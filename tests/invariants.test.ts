import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { db } from "@/server/db";
import type { User } from "@/server/db/schema";
import { AppError } from "@/server/errors";
import { runIngest, type MetricSampler } from "@/server/services/ingest";
import { approveSubmission, rejectSubmission } from "@/server/services/review";
import { createCaller } from "@/server/trpc/root";
import { createCampaign, createUser, pendingSubmissionWithViews } from "./factories";

type CampaignState = {
  id: string;
  title: string;
  status: string;
  spent: number;
  total_budget: number;
  owed: number;
};

// The one thing a CHECK constraint cannot express: campaigns.spent is a
// materialised sum, and it has to keep agreeing with the rows it summarises.
async function campaignStates(): Promise<CampaignState[]> {
  const result = await db.execute<CampaignState>(sql`
    SELECT c.id, c.title, c.status::text AS status, c.spent, c.total_budget,
           COALESCE(SUM(s.payable), 0)::int AS owed
    FROM campaigns c
    LEFT JOIN submissions s ON s.campaign_id = c.id
    GROUP BY c.id, c.title, c.status, c.spent, c.total_budget
  `);
  return result.rows;
}

function expectConsistent(states: CampaignState[]) {
  expect(states.length).toBeGreaterThan(0);
  for (const state of states) {
    // What the campaign says it spent is exactly what it owes its creators.
    expect({ title: state.title, spent: state.spent }).toEqual({
      title: state.title,
      spent: state.owed,
    });
    expect(state.spent).toBeLessThanOrEqual(state.total_budget);
    // A campaign is completed if and only if there is nothing left to give.
    expect({ title: state.title, completed: state.status === "completed" }).toEqual({
      title: state.title,
      completed: state.spent >= state.total_budget,
    });
  }
}

const growing =
  (multiplier: number): MetricSampler =>
  ({ previous }) => {
    const views = Math.max(1_000, Math.round((previous?.views ?? 1_000) * multiplier));
    return { views, likes: 10, comments: 2 };
  };

describe("campaigns.spent never drifts from what is owed", () => {
  it("holds through approvals, rejections and repeated ingest runs", async () => {
    const creator = await createUser();
    const roomy = await createCampaign({ payoutPer1kViews: 100, totalBudget: 100_000 });
    const tight = await createCampaign({ payoutPer1kViews: 100, totalBudget: 2_000 });

    for (const campaign of [roomy, tight]) {
      for (const views of [3_000, 7_000, 11_000]) {
        const submission = await pendingSubmissionWithViews({
          campaignId: campaign.id,
          creatorId: creator.id,
          views,
          capturedAt: "2026-02-01",
        });
        await approveSubmission(db, submission.id).catch((error: unknown) => {
          // The tight campaign is meant to run out part way through.
          if (!(error instanceof AppError)) throw error;
        });
      }

      const rejected = await pendingSubmissionWithViews({
        campaignId: campaign.id,
        creatorId: creator.id,
        views: 50_000,
        capturedAt: "2026-02-01",
      });
      await rejectSubmission(db, rejected.id, "Does not use the campaign track");
    }

    expectConsistent(await campaignStates());

    await runIngest(db, { capturedAt: "2026-02-02", sampler: growing(4) });
    expectConsistent(await campaignStates());

    // A second run for the same day must change nothing at all.
    const before = await campaignStates();
    await runIngest(db, { capturedAt: "2026-02-02", sampler: growing(9) });
    expect(await campaignStates()).toEqual(before);

    // Enough growth to exhaust both budgets, and it still has to balance.
    await runIngest(db, { capturedAt: "2026-02-03", sampler: growing(40) });
    await runIngest(db, { capturedAt: "2026-02-04", sampler: growing(40) });
    const final = await campaignStates();
    expectConsistent(final);
    expect(final.some((state) => state.status === "completed")).toBe(true);
  });

  it("holds after a pile of approvals race for the same budget", async () => {
    const creator = await createUser();
    const campaign = await createCampaign({ payoutPer1kViews: 100, totalBudget: 1_500 });

    const submissions = [];
    for (let i = 0; i < 8; i += 1) {
      submissions.push(
        await pendingSubmissionWithViews({
          campaignId: campaign.id,
          creatorId: creator.id,
          views: 5_000,
        }),
      );
    }

    await Promise.allSettled(submissions.map((s) => approveSubmission(db, s.id)));

    expectConsistent(await campaignStates());
  });
});

describe("editing a campaign budget", () => {
  async function editBudget(admin: User, campaignId: string, totalBudget: string) {
    return createCaller({ db, user: admin, resHeaders: null }).campaign.update({
      id: campaignId,
      data: {
        title: "Edited campaign",
        platforms: ["tiktok"],
        payoutPer1kViews: "1.00",
        totalBudget,
        status: "active",
        startsAt: "2026-01-01",
        endsAt: "2026-12-31",
      },
    });
  }

  it("refuses a budget below what the campaign has already committed", async () => {
    const admin = await createUser({ role: "admin" });
    const creator = await createUser();
    const campaign = await createCampaign({ payoutPer1kViews: 100, totalBudget: 10_000 });
    const submission = await pendingSubmissionWithViews({
      campaignId: campaign.id,
      creatorId: creator.id,
      views: 20_000,
    });
    await approveSubmission(db, submission.id);

    const error = await editBudget(admin, campaign.id, "10.00").catch((e: unknown) => e);

    expect((error as { cause?: AppError }).cause?.detail).toEqual({
      code: "BUDGET_BELOW_COMMITTED",
      committed: 2_000,
      requested: 1_000,
    });
    expectConsistent(await campaignStates());
  });

  it("accepts a budget that exactly matches what is committed, and completes it", async () => {
    const admin = await createUser({ role: "admin" });
    const creator = await createUser();
    const campaign = await createCampaign({ payoutPer1kViews: 100, totalBudget: 10_000 });
    const submission = await pendingSubmissionWithViews({
      campaignId: campaign.id,
      creatorId: creator.id,
      views: 20_000,
    });
    await approveSubmission(db, submission.id);

    const updated = await editBudget(admin, campaign.id, "20.00");

    expect(updated).toMatchObject({ totalBudget: 2_000, spent: 2_000, status: "completed" });
    expectConsistent(await campaignStates());
  });

  it("still allows raising the budget", async () => {
    const admin = await createUser({ role: "admin" });
    const creator = await createUser();
    const campaign = await createCampaign({ payoutPer1kViews: 100, totalBudget: 10_000 });
    const submission = await pendingSubmissionWithViews({
      campaignId: campaign.id,
      creatorId: creator.id,
      views: 20_000,
    });
    await approveSubmission(db, submission.id);

    const updated = await editBudget(admin, campaign.id, "500.00");

    expect(updated).toMatchObject({ totalBudget: 50_000, spent: 2_000, status: "active" });
    expectConsistent(await campaignStates());
  });
});
