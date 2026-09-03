import { TRPCError } from "@trpc/server";
import { and, desc, eq, ilike, sql, type SQL } from "drizzle-orm";
import { z } from "zod";

import { remainingBudget } from "@/lib/payout";
import {
  campaignListInput,
  createCampaignInput,
  updateCampaignInput,
} from "@/lib/validation/campaign";
import { campaigns, submissions } from "@/server/db/schema";
import { adminProcedure, createTRPCRouter, creatorProcedure } from "../init";
import { pageOf, paginate, totalCount } from "../pagination";

export const campaignRouter = createTRPCRouter({
  list: adminProcedure.input(campaignListInput).query(async ({ ctx, input }) => {
    const filters: SQL[] = [];
    if (input.search) filters.push(ilike(campaigns.title, `%${input.search}%`));
    if (input.status) filters.push(eq(campaigns.status, input.status));

    const rows = await ctx.db
      .select({
        id: campaigns.id,
        title: campaigns.title,
        platforms: campaigns.platforms,
        status: campaigns.status,
        payoutPer1kViews: campaigns.payoutPer1kViews,
        totalBudget: campaigns.totalBudget,
        spent: campaigns.spent,
        startsAt: campaigns.startsAt,
        endsAt: campaigns.endsAt,
        pendingCount: sql<number>`(
          SELECT count(*) FROM ${submissions}
          WHERE ${submissions.campaignId} = ${campaigns.id}
            AND ${submissions.status} = 'pending'
        )`.mapWith(Number),
        totalCount,
      })
      .from(campaigns)
      .where(filters.length > 0 ? and(...filters) : undefined)
      .orderBy(desc(campaigns.createdAt))
      .limit(paginate(input.page, input.pageSize).limit)
      .offset(paginate(input.page, input.pageSize).offset);

    return pageOf(rows, input.page, input.pageSize);
  }),

  byId: adminProcedure.input(z.object({ id: z.uuid() })).query(async ({ ctx, input }) => {
    const [campaign] = await ctx.db
      .select()
      .from(campaigns)
      .where(eq(campaigns.id, input.id))
      .limit(1);

    if (!campaign) throw new TRPCError({ code: "NOT_FOUND", message: "Campaign not found" });
    return campaign;
  }),

  create: adminProcedure.input(createCampaignInput).mutation(async ({ ctx, input }) => {
    const [campaign] = await ctx.db.insert(campaigns).values(input).returning();
    return campaign!;
  }),

  update: adminProcedure.input(updateCampaignInput).mutation(async ({ ctx, input }) => {
    const [campaign] = await ctx.db
      .update(campaigns)
      .set({ ...input.data, updatedAt: new Date() })
      .where(eq(campaigns.id, input.id))
      .returning();

    if (!campaign) throw new TRPCError({ code: "NOT_FOUND", message: "Campaign not found" });
    return campaign;
  }),

  overview: adminProcedure
    .input(z.object({ id: z.uuid() }))
    .query(async ({ ctx, input }) => {
      const [campaign] = await ctx.db
        .select()
        .from(campaigns)
        .where(eq(campaigns.id, input.id))
        .limit(1);

      if (!campaign) throw new TRPCError({ code: "NOT_FOUND", message: "Campaign not found" });

      const totalsResult = await ctx.db.execute<{
        approved_views: number;
        approved_submissions: number;
        pending_submissions: number;
      }>(sql`
        SELECT
          COALESCE(SUM(latest.views), 0)::int AS approved_views,
          COUNT(latest.views)::int            AS approved_submissions,
          (
            SELECT COUNT(*)::int FROM submissions p
            WHERE p.campaign_id = ${input.id} AND p.status = 'pending'
          )                                   AS pending_submissions
        FROM (
          SELECT DISTINCT ON (m.submission_id) m.views
          FROM submission_metrics m
          JOIN submissions s ON s.id = m.submission_id
          WHERE s.campaign_id = ${input.id} AND s.status IN ('approved', 'paid')
          ORDER BY m.submission_id, m.captured_at DESC
        ) latest
      `);

      // generate_series fills the days the campaign ran but nobody captured
      // metrics for, so the chart keeps a continuous x axis.
      const dailyResult = await ctx.db.execute<{ day: string; views: number }>(sql`
        SELECT to_char(days.day, 'YYYY-MM-DD') AS day, COALESCE(agg.views, 0)::int AS views
        FROM generate_series(
          ${campaign.startsAt}::date,
          ${campaign.endsAt}::date,
          interval '1 day'
        ) AS days(day)
        LEFT JOIN (
          SELECT m.captured_at AS day, SUM(m.views)::int AS views
          FROM submission_metrics m
          JOIN submissions s ON s.id = m.submission_id
          WHERE s.campaign_id = ${input.id} AND s.status IN ('approved', 'paid')
          GROUP BY m.captured_at
        ) agg ON agg.day = days.day
        ORDER BY days.day
      `);

      const totals = totalsResult.rows[0];

      return {
        campaign,
        approvedViews: totals?.approved_views ?? 0,
        approvedSubmissions: totals?.approved_submissions ?? 0,
        pendingSubmissions: totals?.pending_submissions ?? 0,
        budgetSpent: campaign.spent,
        budgetLeft: remainingBudget(campaign.totalBudget, campaign.spent),
        daily: dailyResult.rows.map((row) => ({ day: row.day, views: row.views })),
      };
    }),

  browse: creatorProcedure
    .input(campaignListInput.pick({ page: true, pageSize: true, search: true }))
    .query(async ({ ctx, input }) => {
      const filters: SQL[] = [eq(campaigns.status, "active")];
      if (input.search) filters.push(ilike(campaigns.title, `%${input.search}%`));

      const rows = await ctx.db
        .select({
          id: campaigns.id,
          title: campaigns.title,
          platforms: campaigns.platforms,
          payoutPer1kViews: campaigns.payoutPer1kViews,
          totalBudget: campaigns.totalBudget,
          spent: campaigns.spent,
          startsAt: campaigns.startsAt,
          endsAt: campaigns.endsAt,
          alreadySubmitted: sql<boolean>`EXISTS (
            SELECT 1 FROM ${submissions}
            WHERE ${submissions.campaignId} = ${campaigns.id}
              AND ${submissions.creatorId} = ${ctx.user.id}
          )`,
          totalCount,
        })
        .from(campaigns)
        .where(and(...filters))
        .orderBy(desc(campaigns.createdAt))
        .limit(paginate(input.page, input.pageSize).limit)
        .offset(paginate(input.page, input.pageSize).offset);

      return pageOf(rows, input.page, input.pageSize);
    }),

  openById: creatorProcedure
    .input(z.object({ id: z.uuid() }))
    .query(async ({ ctx, input }) => {
      const [campaign] = await ctx.db
        .select({
          id: campaigns.id,
          title: campaigns.title,
          platforms: campaigns.platforms,
          payoutPer1kViews: campaigns.payoutPer1kViews,
          totalBudget: campaigns.totalBudget,
          spent: campaigns.spent,
          startsAt: campaigns.startsAt,
          endsAt: campaigns.endsAt,
        })
        .from(campaigns)
        .where(and(eq(campaigns.id, input.id), eq(campaigns.status, "active")))
        .limit(1);

      if (!campaign) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Campaign is not open" });
      }
      return campaign;
    }),
});
