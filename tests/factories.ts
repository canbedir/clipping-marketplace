import { db } from "@/server/db";
import {
  campaigns,
  submissionMetrics,
  submissions,
  users,
  type Campaign,
  type Submission,
  type User,
} from "@/server/db/schema";

let sequence = 0;
function next(): number {
  sequence += 1;
  return sequence;
}

export async function createUser(
  overrides: Partial<typeof users.$inferInsert> = {},
): Promise<User> {
  const n = next();
  const [user] = await db
    .insert(users)
    .values({
      email: `user-${n}-${Date.now()}@example.com`,
      name: `User ${n}`,
      role: "creator",
      ...overrides,
    })
    .returning();
  return user!;
}

export async function createCampaign(
  overrides: Partial<typeof campaigns.$inferInsert> = {},
): Promise<Campaign> {
  const n = next();
  const [campaign] = await db
    .insert(campaigns)
    .values({
      title: `Campaign ${n}`,
      platforms: ["tiktok"],
      payoutPer1kViews: 100,
      totalBudget: 100_000,
      status: "active",
      startsAt: "2026-01-01",
      endsAt: "2026-12-31",
      ...overrides,
    })
    .returning();
  return campaign!;
}

export async function createSubmission(
  overrides: Partial<typeof submissions.$inferInsert> & {
    campaignId: string;
    creatorId: string;
  },
): Promise<Submission> {
  const n = next();
  const url = `https://www.tiktok.com/@creator/video/${7_000_000_000_000_000_000n + BigInt(n)}`;
  const [submission] = await db
    .insert(submissions)
    .values({
      postUrl: url,
      canonicalUrl: url,
      platform: "tiktok",
      status: "pending",
      ...overrides,
    })
    .returning();
  return submission!;
}

export async function addMetric(input: {
  submissionId: string;
  views: number;
  capturedAt?: string;
  likes?: number;
  comments?: number;
}) {
  const [metric] = await db
    .insert(submissionMetrics)
    .values({
      submissionId: input.submissionId,
      capturedAt: input.capturedAt ?? "2026-02-01",
      views: input.views,
      likes: input.likes ?? 0,
      comments: input.comments ?? 0,
    })
    .returning();
  return metric!;
}

export async function pendingSubmissionWithViews(input: {
  campaignId: string;
  creatorId: string;
  views: number;
  capturedAt?: string;
}) {
  const submission = await createSubmission({
    campaignId: input.campaignId,
    creatorId: input.creatorId,
  });
  await addMetric({
    submissionId: submission.id,
    views: input.views,
    capturedAt: input.capturedAt,
  });
  return submission;
}
