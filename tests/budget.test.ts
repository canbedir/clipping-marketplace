import { eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { db } from "@/server/db";
import { campaigns, submissions } from "@/server/db/schema";
import { AppError } from "@/server/errors";
import { approveSubmission, rejectSubmission } from "@/server/services/review";
import {
  createCampaign,
  createSubmission,
  createUser,
  pendingSubmissionWithViews,
} from "./factories";
import { violatedConstraint } from "./pg-error";

async function reload(campaignId: string) {
  const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, campaignId));
  return campaign!;
}

async function reloadSubmission(submissionId: string) {
  const [submission] = await db
    .select()
    .from(submissions)
    .where(eq(submissions.id, submissionId));
  return submission!;
}

describe("approving inside the budget", () => {
  it("charges the campaign exactly what the submission earned", async () => {
    const creator = await createUser();
    const campaign = await createCampaign({ payoutPer1kViews: 100, totalBudget: 1_000 });
    const submission = await pendingSubmissionWithViews({
      campaignId: campaign.id,
      creatorId: creator.id,
      views: 5_400,
    });

    const result = await approveSubmission(db, submission.id);

    expect(result.payable).toBe(500);
    expect(await reloadSubmission(submission.id)).toMatchObject({
      status: "approved",
      payable: 500,
    });
    expect(await reload(campaign.id)).toMatchObject({ spent: 500, status: "active" });
  });

  it("completes the campaign the moment the last cent is committed", async () => {
    const creator = await createUser();
    const campaign = await createCampaign({ payoutPer1kViews: 100, totalBudget: 500 });
    const submission = await pendingSubmissionWithViews({
      campaignId: campaign.id,
      creatorId: creator.id,
      views: 5_000,
    });

    await approveSubmission(db, submission.id);

    expect(await reload(campaign.id)).toMatchObject({ spent: 500, status: "completed" });
  });
});

describe("the budget ceiling", () => {
  it("refuses an approval that would overspend and says by how much", async () => {
    const creator = await createUser();
    const campaign = await createCampaign({ payoutPer1kViews: 100, totalBudget: 700 });
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

    await approveSubmission(db, first.id);

    const error = await approveSubmission(db, second.id).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).detail).toEqual({
      code: "BUDGET_EXCEEDED",
      remaining: 200,
      required: 500,
    });
  });

  it("leaves the rejected approval with no trace on either row", async () => {
    const creator = await createUser();
    const campaign = await createCampaign({ payoutPer1kViews: 100, totalBudget: 400 });
    const submission = await pendingSubmissionWithViews({
      campaignId: campaign.id,
      creatorId: creator.id,
      views: 5_000,
    });

    await expect(approveSubmission(db, submission.id)).rejects.toBeInstanceOf(AppError);

    expect(await reloadSubmission(submission.id)).toMatchObject({
      status: "pending",
      payable: 0,
    });
    expect(await reload(campaign.id)).toMatchObject({ spent: 0, status: "active" });
  });

  it("is enforced by the database, not only by the service", async () => {
    const campaign = await createCampaign({ totalBudget: 1_000 });

    const error = await db
      .execute(sql`UPDATE campaigns SET spent = 1001 WHERE id = ${campaign.id}`)
      .catch((e: unknown) => e);

    expect(violatedConstraint(error)).toBe("campaigns_spent_within_budget");
  });

  it("will not approve into a campaign that is not active", async () => {
    const creator = await createUser();
    const campaign = await createCampaign({ status: "paused" });
    const submission = await pendingSubmissionWithViews({
      campaignId: campaign.id,
      creatorId: creator.id,
      views: 1_000,
    });

    const error = await approveSubmission(db, submission.id).catch((e: unknown) => e);

    expect((error as AppError).detail).toEqual({
      code: "CAMPAIGN_NOT_ACCEPTING",
      status: "paused",
    });
  });
});

describe("rejecting", () => {
  it("records the reason and pays nothing", async () => {
    const creator = await createUser();
    const campaign = await createCampaign();
    const submission = await createSubmission({
      campaignId: campaign.id,
      creatorId: creator.id,
    });

    await rejectSubmission(db, submission.id, "Clip is under the 10 second minimum");

    expect(await reloadSubmission(submission.id)).toMatchObject({
      status: "rejected",
      rejectionReason: "Clip is under the 10 second minimum",
      payable: 0,
    });
    expect(await reload(campaign.id)).toMatchObject({ spent: 0 });
  });

  it("refuses to review a submission twice", async () => {
    const creator = await createUser();
    const campaign = await createCampaign();
    const submission = await pendingSubmissionWithViews({
      campaignId: campaign.id,
      creatorId: creator.id,
      views: 1_000,
    });

    await approveSubmission(db, submission.id);

    const error = await rejectSubmission(db, submission.id, "changed my mind").catch(
      (e: unknown) => e,
    );
    expect((error as AppError).detail).toEqual({
      code: "ALREADY_REVIEWED",
      status: "approved",
    });
  });
});
