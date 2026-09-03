import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { earningsForViews } from "@/lib/payout";
import { db } from "@/server/db";
import { campaigns, submissionMetrics, submissions } from "@/server/db/schema";
import { AppError } from "@/server/errors";
import { approveSubmission } from "@/server/services/review";
import { createCampaign, createUser, pendingSubmissionWithViews } from "./factories";

function settled(results: PromiseSettledResult<unknown>[]) {
  return {
    approved: results.filter((r) => r.status === "fulfilled").length,
    refused: results
      .filter((r) => r.status === "rejected")
      .map((r) => (r.reason as AppError).detail.code),
  };
}

describe("two admins approving at the same moment", () => {
  it("lets exactly one through when the budget only covers one", async () => {
    const creator = await createUser();
    const campaign = await createCampaign({ payoutPer1kViews: 100, totalBudget: 500 });
    const first = await pendingSubmissionWithViews({
      campaignId: campaign.id,
      creatorId: creator.id,
      views: 5_000,
    });
    const second = await pendingSubmissionWithViews({
      campaignId: campaign.id,
      creatorId: creator.id,
      views: 5_000,
    });

    const results = await Promise.allSettled([
      approveSubmission(db, first.id),
      approveSubmission(db, second.id),
    ]);

    expect(settled(results)).toEqual({ approved: 1, refused: ["BUDGET_EXCEEDED"] });

    const [campaignRow] = await db
      .select()
      .from(campaigns)
      .where(eq(campaigns.id, campaign.id));
    expect(campaignRow).toMatchObject({ spent: 500, status: "completed" });

    const rows = await db
      .select({ status: submissions.status, payable: submissions.payable })
      .from(submissions)
      .where(eq(submissions.campaignId, campaign.id));
    expect(rows.filter((r) => r.status === "approved")).toHaveLength(1);
    expect(rows.reduce((sum, r) => sum + r.payable, 0)).toBe(500);
  });

  it("admits only as many as the budget covers when eight race at once", async () => {
    const creator = await createUser();
    const campaign = await createCampaign({ payoutPer1kViews: 100, totalBudget: 1_500 });

    const created = [];
    for (let i = 0; i < 8; i += 1) {
      created.push(
        await pendingSubmissionWithViews({
          campaignId: campaign.id,
          creatorId: creator.id,
          views: 5_000,
        }),
      );
    }

    const results = await Promise.allSettled(
      created.map((submission) => approveSubmission(db, submission.id)),
    );

    const outcome = settled(results);
    expect(outcome.approved).toBe(3);
    expect(outcome.refused).toEqual(Array(5).fill("BUDGET_EXCEEDED"));

    const [campaignRow] = await db
      .select()
      .from(campaigns)
      .where(eq(campaigns.id, campaign.id));
    expect(campaignRow).toMatchObject({ spent: 1_500, status: "completed" });
  });

  it("pays a submission once when the same approval is fired twice", async () => {
    const creator = await createUser();
    const campaign = await createCampaign({ payoutPer1kViews: 100, totalBudget: 10_000 });
    const submission = await pendingSubmissionWithViews({
      campaignId: campaign.id,
      creatorId: creator.id,
      views: 5_000,
    });

    const results = await Promise.allSettled([
      approveSubmission(db, submission.id),
      approveSubmission(db, submission.id),
    ]);

    expect(settled(results)).toEqual({ approved: 1, refused: ["ALREADY_REVIEWED"] });

    const [campaignRow] = await db
      .select()
      .from(campaigns)
      .where(eq(campaigns.id, campaign.id));
    expect(campaignRow!.spent).toBe(500);
  });
});

describe("why the row lock is there", () => {
  it("shows the lost update that a read-then-write approval would allow", async () => {
    const creator = await createUser();
    const campaign = await createCampaign({ payoutPer1kViews: 100, totalBudget: 1_000 });
    const first = await pendingSubmissionWithViews({
      campaignId: campaign.id,
      creatorId: creator.id,
      views: 5_000,
    });
    const second = await pendingSubmissionWithViews({
      campaignId: campaign.id,
      creatorId: creator.id,
      views: 5_000,
    });

    // Deliberately unsafe: reads the campaign without locking it, the shape this
    // would take if the transaction were only there for atomicity.
    const approveWithoutLock = (submissionId: string) =>
      db.transaction(async (tx) => {
        const [campaignRow] = await tx
          .select()
          .from(campaigns)
          .where(eq(campaigns.id, campaign.id));

        const [metric] = await tx
          .select()
          .from(submissionMetrics)
          .where(eq(submissionMetrics.submissionId, submissionId));

        const earned = earningsForViews(metric!.views, campaignRow!.payoutPer1kViews);
        await new Promise((resolve) => setTimeout(resolve, 40));

        await tx
          .update(submissions)
          .set({ status: "approved", payable: earned })
          .where(eq(submissions.id, submissionId));
        await tx
          .update(campaigns)
          .set({ spent: campaignRow!.spent + earned })
          .where(eq(campaigns.id, campaign.id));
      });

    await Promise.all([approveWithoutLock(first.id), approveWithoutLock(second.id)]);

    const [campaignRow] = await db
      .select()
      .from(campaigns)
      .where(eq(campaigns.id, campaign.id));
    const owed = await db
      .select({ payable: submissions.payable })
      .from(submissions)
      .where(eq(submissions.campaignId, campaign.id));

    const totalOwed = owed.reduce((sum, row) => sum + row.payable, 0);
    expect(totalOwed).toBe(1_000);
    // Both approvals read spent = 0, so one of the two writes is lost and the
    // campaign under-reports what it now owes.
    expect(campaignRow!.spent).toBe(500);
    expect(campaignRow!.spent).toBeLessThan(totalOwed);
  });
});
