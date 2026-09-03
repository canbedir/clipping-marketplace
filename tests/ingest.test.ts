import { asc, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { db } from "@/server/db";
import { campaigns, submissionMetrics, submissions } from "@/server/db/schema";
import { runIngest, type MetricSampler } from "@/server/services/ingest";
import { approveSubmission } from "@/server/services/review";
import {
  addMetric,
  createCampaign,
  createSubmission,
  createUser,
  pendingSubmissionWithViews,
} from "./factories";

const DAY = "2026-03-01";

const fixedSampler =
  (views: number): MetricSampler =>
  () => ({ views, likes: 10, comments: 2 });

async function metricsFor(submissionId: string) {
  return db
    .select()
    .from(submissionMetrics)
    .where(eq(submissionMetrics.submissionId, submissionId))
    .orderBy(asc(submissionMetrics.capturedAt));
}

async function campaignRow(campaignId: string) {
  const [row] = await db.select().from(campaigns).where(eq(campaigns.id, campaignId));
  return row!;
}

async function submissionRow(submissionId: string) {
  const [row] = await db.select().from(submissions).where(eq(submissions.id, submissionId));
  return row!;
}

describe("daily ingest", () => {
  it("captures one row per approved submission and skips everything else", async () => {
    const creator = await createUser();
    const campaign = await createCampaign();

    const approved = await pendingSubmissionWithViews({
      campaignId: campaign.id,
      creatorId: creator.id,
      views: 1_000,
      capturedAt: "2026-02-01",
    });
    await approveSubmission(db, approved.id);

    const pending = await createSubmission({
      campaignId: campaign.id,
      creatorId: creator.id,
    });
    const rejected = await createSubmission({
      campaignId: campaign.id,
      creatorId: creator.id,
      status: "rejected",
      rejectionReason: "off brief",
    });

    const report = await runIngest(db, { capturedAt: DAY, sampler: fixedSampler(4_000) });

    expect(report).toMatchObject({ considered: 1, inserted: 1, skipped: 0, failures: [] });
    expect(await metricsFor(approved.id)).toHaveLength(2);
    expect(await metricsFor(pending.id)).toHaveLength(0);
    expect(await metricsFor(rejected.id)).toHaveLength(0);
  });

  it("leaves the data untouched when the same day is ingested twice", async () => {
    const creator = await createUser();
    const campaign = await createCampaign({ payoutPer1kViews: 100, totalBudget: 100_000 });
    const submission = await pendingSubmissionWithViews({
      campaignId: campaign.id,
      creatorId: creator.id,
      views: 1_000,
      capturedAt: "2026-02-01",
    });
    await approveSubmission(db, submission.id);

    await runIngest(db, { capturedAt: DAY, sampler: fixedSampler(9_000) });
    const afterFirst = {
      metrics: await metricsFor(submission.id),
      campaign: await campaignRow(campaign.id),
      submission: await submissionRow(submission.id),
    };

    const second = await runIngest(db, { capturedAt: DAY, sampler: fixedSampler(50_000) });

    expect(second).toMatchObject({ inserted: 0, skipped: 1, grantedCents: 0 });
    expect(await metricsFor(submission.id)).toEqual(afterFirst.metrics);
    expect(await campaignRow(campaign.id)).toEqual(afterFirst.campaign);
    expect((await submissionRow(submission.id)).payable).toBe(afterFirst.submission.payable);
  });

  it("never lets a captured view count go backwards", async () => {
    const creator = await createUser();
    const campaign = await createCampaign();
    const submission = await pendingSubmissionWithViews({
      campaignId: campaign.id,
      creatorId: creator.id,
      views: 20_000,
      capturedAt: "2026-02-01",
    });
    await approveSubmission(db, submission.id);

    await runIngest(db, { capturedAt: DAY, sampler: fixedSampler(3) });

    const rows = await metricsFor(submission.id);
    expect(rows.at(-1)!.views).toBe(20_000);
    expect(rows.map((r) => r.views)).toEqual([...rows.map((r) => r.views)].sort((a, b) => a - b));
  });

  it("finishes the run and reports the failure when one submission blows up", async () => {
    const creator = await createUser();
    const campaign = await createCampaign();

    const ids: string[] = [];
    for (let i = 0; i < 3; i += 1) {
      const submission = await pendingSubmissionWithViews({
        campaignId: campaign.id,
        creatorId: creator.id,
        views: 1_000,
        capturedAt: "2026-02-01",
      });
      await approveSubmission(db, submission.id);
      ids.push(submission.id);
    }

    const poisoned = ids[1]!;
    const sampler: MetricSampler = ({ submissionId }) => {
      if (submissionId === poisoned) throw new Error("upstream API returned 500");
      return { views: 5_000, likes: 10, comments: 2 };
    };

    const report = await runIngest(db, { capturedAt: DAY, sampler });

    expect(report.inserted).toBe(2);
    expect(report.failures).toEqual([
      { submissionId: poisoned, message: "upstream API returned 500" },
    ]);
    expect(await metricsFor(poisoned)).toHaveLength(1);
    expect(await metricsFor(ids[0]!)).toHaveLength(2);
    expect(await metricsFor(ids[2]!)).toHaveLength(2);
  });
});

describe("ingest against a budget ceiling", () => {
  it("stops paying once the campaign is exhausted, however far views run", async () => {
    const creator = await createUser();
    const campaign = await createCampaign({ payoutPer1kViews: 100, totalBudget: 1_000 });
    const submission = await pendingSubmissionWithViews({
      campaignId: campaign.id,
      creatorId: creator.id,
      views: 5_000,
      capturedAt: "2026-02-01",
    });
    await approveSubmission(db, submission.id);
    expect((await campaignRow(campaign.id)).spent).toBe(500);

    const report = await runIngest(db, { capturedAt: DAY, sampler: fixedSampler(900_000) });

    expect(report.grantedCents).toBe(500);
    expect(await campaignRow(campaign.id)).toMatchObject({
      spent: 1_000,
      status: "completed",
    });
    expect((await submissionRow(submission.id)).payable).toBe(1_000);
  });

  it("grants nothing more once the ceiling has been reached", async () => {
    const creator = await createUser();
    const campaign = await createCampaign({ payoutPer1kViews: 100, totalBudget: 1_000 });
    const submission = await pendingSubmissionWithViews({
      campaignId: campaign.id,
      creatorId: creator.id,
      views: 5_000,
      capturedAt: "2026-02-01",
    });
    await approveSubmission(db, submission.id);
    await runIngest(db, { capturedAt: DAY, sampler: fixedSampler(900_000) });

    const report = await runIngest(db, {
      capturedAt: "2026-03-02",
      sampler: fixedSampler(2_000_000),
    });

    expect(report.grantedCents).toBe(0);
    expect((await campaignRow(campaign.id)).spent).toBe(1_000);
  });
});

describe("metric history", () => {
  it("keeps one row per submission per day", async () => {
    const creator = await createUser();
    const campaign = await createCampaign();
    const submission = await createSubmission({
      campaignId: campaign.id,
      creatorId: creator.id,
    });

    await addMetric({ submissionId: submission.id, views: 100, capturedAt: DAY });

    await expect(
      addMetric({ submissionId: submission.id, views: 200, capturedAt: DAY }),
    ).rejects.toThrow();
  });
});
