// All monetary columns are integer cents.
import { relations, sql } from "drizzle-orm";
import {
  check,
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import {
  CAMPAIGN_STATUSES,
  PLATFORMS,
  SUBMISSION_STATUSES,
  USER_ROLES,
} from "@/lib/constants";

export const userRole = pgEnum("user_role", USER_ROLES);
export const platform = pgEnum("platform", PLATFORMS);
export const campaignStatus = pgEnum("campaign_status", CAMPAIGN_STATUSES);
export const submissionStatus = pgEnum("submission_status", SUBMISSION_STATUSES);

export const users = pgTable("users", {
  id: uuid().primaryKey().defaultRandom(),
  email: text().notNull().unique(),
  name: text().notNull(),
  role: userRole().notNull(),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

export const campaigns = pgTable(
  "campaigns",
  {
    id: uuid().primaryKey().defaultRandom(),
    title: text().notNull(),
    platforms: platform().array().notNull(),
    payoutPer1kViews: integer("payout_per_1k_views").notNull(),
    totalBudget: integer().notNull(),
    spent: integer().notNull().default(0),
    status: campaignStatus().notNull().default("draft"),
    startsAt: date({ mode: "string" }).notNull(),
    endsAt: date({ mode: "string" }).notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("campaigns_status_created_at_idx").on(t.status, t.createdAt.desc()),
    check("campaigns_payout_positive", sql`${t.payoutPer1kViews} > 0`),
    check("campaigns_budget_positive", sql`${t.totalBudget} > 0`),
    check("campaigns_period_ordered", sql`${t.endsAt} >= ${t.startsAt}`),
    check("campaigns_platforms_not_empty", sql`array_length(${t.platforms}, 1) >= 1`),
    check(
      "campaigns_spent_within_budget",
      sql`${t.spent} >= 0 AND ${t.spent} <= ${t.totalBudget}`,
    ),
  ],
);

export const submissions = pgTable(
  "submissions",
  {
    id: uuid().primaryKey().defaultRandom(),
    campaignId: uuid()
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    creatorId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    postUrl: text().notNull(),
    canonicalUrl: text().notNull(),
    platform: platform().notNull(),
    status: submissionStatus().notNull().default("pending"),
    rejectionReason: text(),
    payable: integer().notNull().default(0),
    reviewedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("submissions_campaign_canonical_url_key").on(t.campaignId, t.canonicalUrl),
    index("submissions_campaign_status_created_at_idx").on(
      t.campaignId,
      t.status,
      t.createdAt.desc(),
    ),
    index("submissions_creator_created_at_idx").on(t.creatorId, t.createdAt.desc()),
    check(
      "submissions_rejection_reason_required",
      sql`${t.status} <> 'rejected' OR ${t.rejectionReason} IS NOT NULL`,
    ),
    check(
      "submissions_payable_only_when_earning",
      sql`${t.payable} >= 0 AND (${t.status} IN ('approved', 'paid') OR ${t.payable} = 0)`,
    ),
  ],
);

export const submissionMetrics = pgTable(
  "submission_metrics",
  {
    id: uuid().primaryKey().defaultRandom(),
    submissionId: uuid()
      .notNull()
      .references(() => submissions.id, { onDelete: "cascade" }),
    capturedAt: date({ mode: "string" }).notNull(),
    views: integer().notNull(),
    likes: integer().notNull(),
    comments: integer().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("submission_metrics_submission_captured_at_key").on(
      t.submissionId,
      t.capturedAt.desc(),
    ),
    check(
      "submission_metrics_counts_non_negative",
      sql`${t.views} >= 0 AND ${t.likes} >= 0 AND ${t.comments} >= 0`,
    ),
  ],
);

export const campaignsRelations = relations(campaigns, ({ many }) => ({
  submissions: many(submissions),
}));

export const usersRelations = relations(users, ({ many }) => ({
  submissions: many(submissions),
}));

export const submissionsRelations = relations(submissions, ({ one, many }) => ({
  campaign: one(campaigns, {
    fields: [submissions.campaignId],
    references: [campaigns.id],
  }),
  creator: one(users, {
    fields: [submissions.creatorId],
    references: [users.id],
  }),
  metrics: many(submissionMetrics),
}));

export const submissionMetricsRelations = relations(submissionMetrics, ({ one }) => ({
  submission: one(submissions, {
    fields: [submissionMetrics.submissionId],
    references: [submissions.id],
  }),
}));

export type User = typeof users.$inferSelect;
export type Campaign = typeof campaigns.$inferSelect;
export type Submission = typeof submissions.$inferSelect;
export type SubmissionMetric = typeof submissionMetrics.$inferSelect;
