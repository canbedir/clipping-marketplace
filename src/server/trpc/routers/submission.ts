import { TRPCError } from "@trpc/server";
import { and, desc, eq, sql, type SQL } from "drizzle-orm";
import { z } from "zod";

import type { SubmissionStatus } from "@/lib/constants";
import { earningsForViews } from "@/lib/payout";
import { parsePostUrl } from "@/lib/post-url";
import {
  createSubmissionInput,
  mySubmissionsInput,
  postUrlSchema,
  reviewQueueInput,
  reviewSubmissionInput,
} from "@/lib/validation/submission";
import { isUniqueViolation } from "@/server/db/errors";
import { campaigns, submissions, users } from "@/server/db/schema";
import { AppError } from "@/server/errors";
import { approveSubmission, rejectSubmission } from "@/server/services/review";
import { adminProcedure, createTRPCRouter, creatorProcedure } from "../init";
import { pageOf, paginate, totalCount } from "../pagination";

// Written with explicit table qualification rather than Drizzle column
// interpolation: inside a subquery an unqualified "id" binds to the subquery's
// own table, which silently makes the correlation always false.
const latestViews = sql<number>`COALESCE((
  SELECT m.views FROM submission_metrics m
  WHERE m.submission_id = submissions.id
  ORDER BY m.captured_at DESC
  LIMIT 1
), 0)`.mapWith(Number);

const latestCapturedAt = sql<string | null>`(
  SELECT to_char(m.captured_at, 'YYYY-MM-DD') FROM submission_metrics m
  WHERE m.submission_id = submissions.id
  ORDER BY m.captured_at DESC
  LIMIT 1
)`;

// Approved work is worth what the campaign has actually committed. A rejected
// clip is worth nothing, however many views it went on to collect. Only a
// submission still awaiting review gets an estimate.
function earningsOf(submission: {
  status: SubmissionStatus;
  payable: number;
  views: number;
  payoutPer1kViews: number;
}): number {
  if (submission.status === "approved" || submission.status === "paid") {
    return submission.payable;
  }
  if (submission.status === "rejected") return 0;
  return earningsForViews(submission.views, submission.payoutPer1kViews);
}

export const submissionRouter = createTRPCRouter({
  create: creatorProcedure.input(createSubmissionInput).mutation(async ({ ctx, input }) => {
    const [campaign] = await ctx.db
      .select({
        id: campaigns.id,
        status: campaigns.status,
        platforms: campaigns.platforms,
      })
      .from(campaigns)
      .where(eq(campaigns.id, input.campaignId))
      .limit(1);

    if (!campaign) throw new TRPCError({ code: "NOT_FOUND", message: "Campaign not found" });

    if (campaign.status !== "active") {
      throw new AppError({ code: "CAMPAIGN_NOT_ACCEPTING", status: campaign.status });
    }

    // Same schema the form used, re-run here with the campaign's platforms so a
    // hand-crafted request cannot get past the client-side check.
    const parsed = postUrlSchema(campaign.platforms).safeParse(input.postUrl);
    if (!parsed.success) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: parsed.error.issues[0]?.message ?? "Invalid post URL",
        cause: parsed.error,
      });
    }

    const post = parsePostUrl(parsed.data)!;

    try {
      const [submission] = await ctx.db
        .insert(submissions)
        .values({
          campaignId: campaign.id,
          creatorId: ctx.user.id,
          postUrl: parsed.data,
          canonicalUrl: post.canonicalUrl,
          platform: post.platform,
        })
        .returning();
      return submission!;
    } catch (error) {
      if (isUniqueViolation(error, "submissions_campaign_canonical_url_key")) {
        throw new AppError({ code: "DUPLICATE_SUBMISSION" });
      }
      throw error;
    }
  }),

  mine: creatorProcedure.input(mySubmissionsInput).query(async ({ ctx, input }) => {
    const filters: SQL[] = [eq(submissions.creatorId, ctx.user.id)];
    if (input.status) filters.push(eq(submissions.status, input.status));

    const rows = await ctx.db
      .select({
        id: submissions.id,
        postUrl: submissions.postUrl,
        platform: submissions.platform,
        status: submissions.status,
        rejectionReason: submissions.rejectionReason,
        payable: submissions.payable,
        createdAt: submissions.createdAt,
        campaignId: campaigns.id,
        campaignTitle: campaigns.title,
        payoutPer1kViews: campaigns.payoutPer1kViews,
        views: latestViews,
        capturedAt: latestCapturedAt,
        totalCount,
      })
      .from(submissions)
      .innerJoin(campaigns, eq(campaigns.id, submissions.campaignId))
      .where(and(...filters))
      .orderBy(desc(submissions.createdAt), desc(submissions.id))
      .limit(paginate(input.page, input.pageSize).limit)
      .offset(paginate(input.page, input.pageSize).offset);

    const page = pageOf(rows, input.page, input.pageSize);

    return {
      ...page,
      items: page.items.map((item) => ({ ...item, earnings: earningsOf(item) })),
    };
  }),

  queue: adminProcedure.input(reviewQueueInput).query(async ({ ctx, input }) => {
    const filters: SQL[] = [eq(submissions.campaignId, input.campaignId)];
    if (input.status) filters.push(eq(submissions.status, input.status));

    const rows = await ctx.db
      .select({
        id: submissions.id,
        postUrl: submissions.postUrl,
        platform: submissions.platform,
        status: submissions.status,
        rejectionReason: submissions.rejectionReason,
        payable: submissions.payable,
        createdAt: submissions.createdAt,
        creatorName: users.name,
        creatorEmail: users.email,
        views: latestViews,
        capturedAt: latestCapturedAt,
        totalCount,
      })
      .from(submissions)
      .innerJoin(users, eq(users.id, submissions.creatorId))
      .where(and(...filters))
      .orderBy(desc(submissions.createdAt), desc(submissions.id))
      .limit(paginate(input.page, input.pageSize).limit)
      .offset(paginate(input.page, input.pageSize).offset);

    return pageOf(rows, input.page, input.pageSize);
  }),

  review: adminProcedure.input(reviewSubmissionInput).mutation(async ({ ctx, input }) => {
    const [exists] = await ctx.db
      .select({ id: submissions.id })
      .from(submissions)
      .where(eq(submissions.id, input.submissionId))
      .limit(1);

    if (!exists) throw new TRPCError({ code: "NOT_FOUND", message: "Submission not found" });

    if (input.decision === "approve") {
      return { decision: "approve" as const, ...(await approveSubmission(ctx.db, input.submissionId)) };
    }

    return {
      decision: "reject" as const,
      ...(await rejectSubmission(ctx.db, input.submissionId, input.rejectionReason)),
    };
  }),

  byId: creatorProcedure
    .input(z.object({ id: z.uuid() }))
    .query(async ({ ctx, input }) => {
      const [submission] = await ctx.db
        .select()
        .from(submissions)
        .where(and(eq(submissions.id, input.id), eq(submissions.creatorId, ctx.user.id)))
        .limit(1);

      if (!submission) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Submission not found" });
      }
      return submission;
    }),
});
