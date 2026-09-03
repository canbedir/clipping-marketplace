import { and, desc, eq } from "drizzle-orm";

import { allocatable, earningsForViews, remainingBudget } from "@/lib/payout";
import type { Database, Transaction } from "@/server/db";
import { campaigns, submissionMetrics, submissions } from "@/server/db/schema";
import { AppError } from "@/server/errors";

export type ReviewResult = {
  submissionId: string;
  campaignId: string;
  payable: number;
  campaignSpent: number;
  campaignCompleted: boolean;
};

async function latestViews(tx: Transaction, submissionId: string): Promise<number> {
  const [metric] = await tx
    .select({ views: submissionMetrics.views })
    .from(submissionMetrics)
    .where(eq(submissionMetrics.submissionId, submissionId))
    .orderBy(desc(submissionMetrics.capturedAt))
    .limit(1);

  return metric?.views ?? 0;
}

export async function approveSubmission(
  db: Database,
  submissionId: string,
): Promise<ReviewResult> {
  return db.transaction(async (tx) => {
    const [target] = await tx
      .select({ campaignId: submissions.campaignId })
      .from(submissions)
      .where(eq(submissions.id, submissionId))
      .limit(1);

    if (!target) {
      throw new AppError({ code: "ALREADY_REVIEWED", status: "pending" });
    }

    const [campaign] = await tx
      .select()
      .from(campaigns)
      .where(eq(campaigns.id, target.campaignId))
      .limit(1)
      .for("update");

    if (!campaign) {
      throw new AppError({ code: "CAMPAIGN_NOT_ACCEPTING", status: "draft" });
    }

    const [submission] = await tx
      .select()
      .from(submissions)
      .where(eq(submissions.id, submissionId))
      .limit(1)
      .for("update");

    if (!submission) {
      throw new AppError({ code: "ALREADY_REVIEWED", status: "pending" });
    }

    if (submission.status !== "pending") {
      throw new AppError({ code: "ALREADY_REVIEWED", status: submission.status });
    }

    const views = await latestViews(tx, submissionId);
    const required = earningsForViews(views, campaign.payoutPer1kViews);
    const remaining = remainingBudget(campaign.totalBudget, campaign.spent);

    // Budget first: a campaign that auto-completed because it ran out of money
    // should tell the reviewer that, not just that it is closed.
    if (required > remaining) {
      throw new AppError({ code: "BUDGET_EXCEEDED", remaining, required });
    }

    if (campaign.status !== "active") {
      throw new AppError({ code: "CAMPAIGN_NOT_ACCEPTING", status: campaign.status });
    }

    const spent = campaign.spent + required;
    const completed = spent >= campaign.totalBudget;

    await tx
      .update(submissions)
      .set({
        status: "approved",
        payable: required,
        rejectionReason: null,
        reviewedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(submissions.id, submissionId));

    await tx
      .update(campaigns)
      .set({
        spent,
        status: completed ? "completed" : campaign.status,
        updatedAt: new Date(),
      })
      .where(eq(campaigns.id, campaign.id));

    return {
      submissionId,
      campaignId: campaign.id,
      payable: required,
      campaignSpent: spent,
      campaignCompleted: completed,
    };
  });
}

export async function rejectSubmission(
  db: Database,
  submissionId: string,
  rejectionReason: string,
): Promise<{ submissionId: string }> {
  return db.transaction(async (tx) => {
    const [submission] = await tx
      .select({ status: submissions.status })
      .from(submissions)
      .where(eq(submissions.id, submissionId))
      .limit(1)
      .for("update");

    if (!submission) {
      throw new AppError({ code: "ALREADY_REVIEWED", status: "pending" });
    }

    if (submission.status !== "pending") {
      throw new AppError({ code: "ALREADY_REVIEWED", status: submission.status });
    }

    await tx
      .update(submissions)
      .set({
        status: "rejected",
        rejectionReason,
        payable: 0,
        reviewedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(submissions.id, submissionId));

    return { submissionId };
  });
}

export async function applyMetricToBudget(
  tx: Transaction,
  input: { submissionId: string; campaignId: string; views: number },
): Promise<{ granted: number; campaignCompleted: boolean }> {
  const [campaign] = await tx
    .select()
    .from(campaigns)
    .where(eq(campaigns.id, input.campaignId))
    .limit(1)
    .for("update");

  if (!campaign) return { granted: 0, campaignCompleted: false };

  const [submission] = await tx
    .select({ payable: submissions.payable, status: submissions.status })
    .from(submissions)
    .where(and(eq(submissions.id, input.submissionId), eq(submissions.status, "approved")))
    .limit(1)
    .for("update");

  if (!submission) return { granted: 0, campaignCompleted: false };

  const earned = earningsForViews(input.views, campaign.payoutPer1kViews);
  const remaining = remainingBudget(campaign.totalBudget, campaign.spent);
  const granted = allocatable(earned - submission.payable, remaining);

  if (granted === 0) {
    return { granted: 0, campaignCompleted: campaign.status === "completed" };
  }

  const spent = campaign.spent + granted;
  const completed = spent >= campaign.totalBudget;

  await tx
    .update(submissions)
    .set({ payable: submission.payable + granted, updatedAt: new Date() })
    .where(eq(submissions.id, input.submissionId));

  await tx
    .update(campaigns)
    .set({
      spent,
      status: completed ? "completed" : campaign.status,
      updatedAt: new Date(),
    })
    .where(eq(campaigns.id, campaign.id));

  return { granted, campaignCompleted: completed };
}
