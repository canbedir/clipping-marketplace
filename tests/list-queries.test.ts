import { describe, expect, it } from "vitest";

import { db } from "@/server/db";
import type { User } from "@/server/db/schema";
import { createCaller } from "@/server/trpc/root";
import { approveSubmission } from "@/server/services/review";
import {
  addMetric,
  createCampaign,
  createSubmission,
  createUser,
  pendingSubmissionWithViews,
} from "./factories";

function callerFor(user: User) {
  return createCaller({ db, user, resHeaders: null });
}

describe("counts and lookups that ride along on list queries", () => {
  it("counts only this campaign's pending submissions", async () => {
    const admin = await createUser({ role: "admin" });
    const creator = await createUser();
    const [quiet, busy] = await Promise.all([createCampaign(), createCampaign()]);

    await createSubmission({ campaignId: busy.id, creatorId: creator.id });
    await createSubmission({ campaignId: busy.id, creatorId: creator.id });
    await createSubmission({
      campaignId: busy.id,
      creatorId: creator.id,
      status: "rejected",
      rejectionReason: "off brief",
    });
    await createSubmission({ campaignId: quiet.id, creatorId: creator.id });

    const page = await callerFor(admin).campaign.list({ pageSize: 50 });
    const counts = new Map(page.items.map((c) => [c.id, c.pendingCount]));

    expect(counts.get(busy.id)).toBe(2);
    expect(counts.get(quiet.id)).toBe(1);
  });

  it("reports the most recent view count on a creator's submissions", async () => {
    const creator = await createUser();
    const campaign = await createCampaign({ payoutPer1kViews: 100 });
    const submission = await pendingSubmissionWithViews({
      campaignId: campaign.id,
      creatorId: creator.id,
      views: 4_000,
      capturedAt: "2026-02-01",
    });
    await addMetric({ submissionId: submission.id, views: 9_400, capturedAt: "2026-02-05" });

    const page = await callerFor(creator).submission.mine({ pageSize: 50 });

    expect(page.items[0]).toMatchObject({
      views: 9_400,
      capturedAt: "2026-02-05",
      earnings: 900,
    });
  });

  it("marks a campaign the creator has already submitted to, and only for them", async () => {
    const [alice, bob] = await Promise.all([createUser(), createUser()]);
    const [used, untouched] = await Promise.all([createCampaign(), createCampaign()]);
    await createSubmission({ campaignId: used.id, creatorId: alice.id });

    const forAlice = await callerFor(alice).campaign.browse({ pageSize: 50 });
    const forBob = await callerFor(bob).campaign.browse({ pageSize: 50 });

    const flag = (page: typeof forAlice, id: string) =>
      page.items.find((c) => c.id === id)?.alreadySubmitted;

    expect(flag(forAlice, used.id)).toBe(true);
    expect(flag(forAlice, untouched.id)).toBe(false);
    expect(flag(forBob, used.id)).toBe(false);
  });

  it("switches a creator's earnings from estimate to committed on approval", async () => {
    const admin = await createUser({ role: "admin" });
    const creator = await createUser();
    const campaign = await createCampaign({ payoutPer1kViews: 100, totalBudget: 10_000 });
    const submission = await pendingSubmissionWithViews({
      campaignId: campaign.id,
      creatorId: creator.id,
      views: 3_000,
    });

    const before = await callerFor(creator).submission.mine({ pageSize: 50 });
    expect(before.items[0]).toMatchObject({ status: "pending", payable: 0, earnings: 300 });

    await approveSubmission(db, submission.id);
    void admin;

    const after = await callerFor(creator).submission.mine({ pageSize: 50 });
    expect(after.items[0]).toMatchObject({ status: "approved", payable: 300, earnings: 300 });
  });

  it("pays a rejected clip nothing, however many views it went on to collect", async () => {
    const creator = await createUser();
    const campaign = await createCampaign({ payoutPer1kViews: 100 });
    const submission = await createSubmission({
      campaignId: campaign.id,
      creatorId: creator.id,
      status: "rejected",
      rejectionReason: "Clip is under the 10 second minimum",
    });
    await addMetric({ submissionId: submission.id, views: 40_000 });

    const page = await callerFor(creator).submission.mine({ pageSize: 50 });

    expect(page.items[0]).toMatchObject({
      status: "rejected",
      views: 40_000,
      payable: 0,
      earnings: 0,
    });
  });
});

describe("pagination", () => {
  it("never repeats or drops a row when sort keys tie", async () => {
    const admin = await createUser({ role: "admin" });
    const sameInstant = new Date("2026-04-01T10:00:00Z");
    for (let i = 0; i < 12; i += 1) {
      await createCampaign({ title: `Tied campaign ${i}`, createdAt: sameInstant });
    }

    const caller = callerFor(admin);
    const first = await caller.campaign.list({ page: 1, pageSize: 5 });
    const second = await caller.campaign.list({ page: 2, pageSize: 5 });
    const third = await caller.campaign.list({ page: 3, pageSize: 5 });

    const seen = [...first.items, ...second.items, ...third.items].map((c) => c.id);
    expect(seen).toHaveLength(12);
    expect(new Set(seen).size).toBe(12);
    expect(first.total).toBe(12);
    expect(first.pageCount).toBe(3);
  });
});
