import { TRPCError } from "@trpc/server";
import { describe, expect, it } from "vitest";

import { db } from "@/server/db";
import type { User } from "@/server/db/schema";
import { AppError } from "@/server/errors";
import { createCaller } from "@/server/trpc/root";
import { createCampaign, createSubmission, createUser } from "./factories";

function callerFor(user: User | null) {
  return createCaller({ db, user, resHeaders: null });
}

async function codeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return "NO_ERROR";
  } catch (error) {
    if (error instanceof TRPCError) {
      // Domain failures travel as the cause; that is what the client reads.
      if (error.cause instanceof AppError) return error.cause.detail.code;
      return error.code;
    }
    throw error;
  }
}

describe("who can call what", () => {
  it("turns anonymous callers away from anything that needs a session", async () => {
    const anonymous = callerFor(null);

    expect(await codeOf(anonymous.submission.mine({}))).toBe("UNAUTHORIZED");
    expect(await codeOf(anonymous.campaign.list({}))).toBe("UNAUTHORIZED");
  });

  it("keeps creators out of the admin surface", async () => {
    const creator = await createUser({ role: "creator" });
    const caller = callerFor(creator);
    const campaign = await createCampaign();

    expect(await codeOf(caller.campaign.list({}))).toBe("FORBIDDEN");
    expect(await codeOf(caller.campaign.overview({ id: campaign.id }))).toBe("FORBIDDEN");
    expect(
      await codeOf(
        caller.campaign.create({
          title: "Sneaky campaign",
          platforms: ["tiktok"],
          payoutPer1kViews: "1.00",
          totalBudget: "100.00",
          status: "active",
          startsAt: "2026-01-01",
          endsAt: "2026-06-01",
        }),
      ),
    ).toBe("FORBIDDEN");
    expect(
      await codeOf(
        caller.submission.review({ submissionId: campaign.id, decision: "approve" }),
      ),
    ).toBe("FORBIDDEN");
  });

  it("keeps admins out of the creator surface", async () => {
    const admin = await createUser({ role: "admin" });
    const caller = callerFor(admin);

    expect(await codeOf(caller.submission.mine({}))).toBe("FORBIDDEN");
    expect(await codeOf(caller.campaign.browse({}))).toBe("FORBIDDEN");
  });
});

describe("one creator cannot reach another creator's data", () => {
  it("refuses a hand-crafted submission id that belongs to somebody else", async () => {
    const [alice, bob] = await Promise.all([createUser(), createUser()]);
    const campaign = await createCampaign();
    const bobsSubmission = await createSubmission({
      campaignId: campaign.id,
      creatorId: bob.id,
    });

    expect(await codeOf(callerFor(alice).submission.byId({ id: bobsSubmission.id }))).toBe(
      "NOT_FOUND",
    );
    await expect(
      callerFor(bob).submission.byId({ id: bobsSubmission.id }),
    ).resolves.toMatchObject({ id: bobsSubmission.id });
  });

  it("scopes the submission list to the caller no matter what is asked for", async () => {
    const [alice, bob] = await Promise.all([createUser(), createUser()]);
    const campaign = await createCampaign();
    await createSubmission({ campaignId: campaign.id, creatorId: alice.id });
    await createSubmission({ campaignId: campaign.id, creatorId: bob.id });
    await createSubmission({ campaignId: campaign.id, creatorId: bob.id });

    const alices = await callerFor(alice).submission.mine({ pageSize: 50 });
    const bobs = await callerFor(bob).submission.mine({ pageSize: 50 });

    expect(alices.total).toBe(1);
    expect(bobs.total).toBe(2);
  });

  it("attributes a new submission to the session, never to the payload", async () => {
    const [alice, bob] = await Promise.all([createUser(), createUser()]);
    const campaign = await createCampaign({ platforms: ["tiktok"] });

    const created = await callerFor(alice).submission.create({
      campaignId: campaign.id,
      postUrl: "https://www.tiktok.com/@alice/video/7234567890123456789",
      // A hand-crafted client could send this; the router never reads it.
      creatorId: bob.id,
    } as never);

    expect(created.creatorId).toBe(alice.id);
  });
});

describe("submission rules the server re-checks", () => {
  it("rejects a platform the campaign does not run on", async () => {
    const creator = await createUser();
    const campaign = await createCampaign({ platforms: ["tiktok"] });

    expect(
      await codeOf(
        callerFor(creator).submission.create({
          campaignId: campaign.id,
          postUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        }),
      ),
    ).toBe("BAD_REQUEST");
  });

  it("refuses the same post twice on one campaign, however it is written", async () => {
    const creator = await createUser();
    const campaign = await createCampaign({ platforms: ["youtube"] });
    const caller = callerFor(creator);

    await caller.submission.create({
      campaignId: campaign.id,
      postUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    });

    expect(
      await codeOf(
        caller.submission.create({
          campaignId: campaign.id,
          postUrl: "https://youtu.be/dQw4w9WgXcQ?feature=share",
        }),
      ),
    ).toBe("DUPLICATE_SUBMISSION");
  });

  it("will not take submissions for a campaign that is not live", async () => {
    const creator = await createUser();
    const campaign = await createCampaign({ status: "draft" });

    expect(
      await codeOf(
        callerFor(creator).submission.create({
          campaignId: campaign.id,
          postUrl: "https://www.tiktok.com/@creator/video/7234567890123456789",
        }),
      ),
    ).toBe("CAMPAIGN_NOT_ACCEPTING");

    expect(await codeOf(callerFor(creator).campaign.openById({ id: campaign.id }))).toBe(
      "NOT_FOUND",
    );
  });
});
