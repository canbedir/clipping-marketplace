import { and, desc, eq, lte } from "drizzle-orm";

import type { Database } from "@/server/db";
import { submissionMetrics, submissions } from "@/server/db/schema";
import { applyMetricToBudget } from "./review";

export type MetricSample = { views: number; likes: number; comments: number };

export type MetricSampler = (input: {
  submissionId: string;
  capturedAt: string;
  previous: MetricSample | null;
}) => MetricSample;

export type IngestReport = {
  capturedAt: string;
  considered: number;
  inserted: number;
  skipped: number;
  grantedCents: number;
  failures: { submissionId: string; message: string }[];
};

function hash32(value: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

function seeded(seed: string): number {
  return hash32(seed) / 0xffffffff;
}

export const defaultSampler: MetricSampler = ({ submissionId, capturedAt, previous }) => {
  const seed = `${submissionId}:${capturedAt}`;
  const growthRoll = seeded(`views:${seed}`);
  const likeRoll = seeded(`likes:${seed}`);
  const commentRoll = seeded(`comments:${seed}`);

  const growth = previous
    ? Math.round(previous.views * (0.04 + growthRoll * 0.22)) + Math.round(growthRoll * 400)
    : 800 + Math.round(growthRoll * 9_000);

  const views = (previous?.views ?? 0) + growth;
  const likes = Math.round(views * (0.02 + likeRoll * 0.06));
  const comments = Math.round(likes * (0.03 + commentRoll * 0.12));

  return { views, likes, comments };
};

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function runIngest(
  db: Database,
  options: { capturedAt?: string; sampler?: MetricSampler } = {},
): Promise<IngestReport> {
  const capturedAt = options.capturedAt ?? today();
  const sampler = options.sampler ?? defaultSampler;

  const targets = await db
    .select({ id: submissions.id, campaignId: submissions.campaignId })
    .from(submissions)
    .where(eq(submissions.status, "approved"))
    .orderBy(submissions.createdAt);

  const report: IngestReport = {
    capturedAt,
    considered: targets.length,
    inserted: 0,
    skipped: 0,
    grantedCents: 0,
    failures: [],
  };

  for (const target of targets) {
    try {
      const outcome = await db.transaction(async (tx) => {
        const [previous] = await tx
          .select({
            views: submissionMetrics.views,
            likes: submissionMetrics.likes,
            comments: submissionMetrics.comments,
          })
          .from(submissionMetrics)
          .where(
            and(
              eq(submissionMetrics.submissionId, target.id),
              lte(submissionMetrics.capturedAt, capturedAt),
            ),
          )
          .orderBy(desc(submissionMetrics.capturedAt))
          .limit(1);

        const sample = sampler({
          submissionId: target.id,
          capturedAt,
          previous: previous ?? null,
        });

        const views = Math.max(sample.views, previous?.views ?? 0);

        const [row] = await tx
          .insert(submissionMetrics)
          .values({
            submissionId: target.id,
            capturedAt,
            views,
            likes: Math.max(0, sample.likes),
            comments: Math.max(0, sample.comments),
          })
          .onConflictDoNothing({
            target: [submissionMetrics.submissionId, submissionMetrics.capturedAt],
          })
          .returning({ id: submissionMetrics.id });

        if (!row) return { inserted: false, granted: 0 };

        const { granted } = await applyMetricToBudget(tx, {
          submissionId: target.id,
          campaignId: target.campaignId,
          views,
        });

        return { inserted: true, granted };
      });

      if (outcome.inserted) {
        report.inserted += 1;
        report.grantedCents += outcome.granted;
      } else {
        report.skipped += 1;
      }
    } catch (error) {
      report.failures.push({
        submissionId: target.id,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return report;
}
