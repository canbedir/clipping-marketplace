import { z } from "zod";

import { PLATFORM_LABELS, SUBMISSION_STATUSES, type Platform } from "@/lib/constants";
import { parsePostUrl } from "@/lib/post-url";

export function postUrlSchema(platforms: readonly Platform[]) {
  return z
    .string()
    .trim()
    .min(1, { message: "Paste the URL of your post" })
    .superRefine((value, ctx) => {
      const parsed = parsePostUrl(value);
      if (!parsed) {
        ctx.addIssue({
          code: "custom",
          message: "That does not look like a TikTok, Instagram or YouTube post URL",
        });
        return;
      }
      if (!platforms.includes(parsed.platform)) {
        const accepted = platforms.map((p) => PLATFORM_LABELS[p]).join(", ");
        ctx.addIssue({
          code: "custom",
          message: `This campaign only accepts posts from ${accepted}`,
        });
      }
    });
}

export function submissionFormSchema(platforms: readonly Platform[]) {
  return z.object({ postUrl: postUrlSchema(platforms) });
}

export type SubmissionFormValues = z.input<ReturnType<typeof submissionFormSchema>>;

export const createSubmissionInput = z.object({
  campaignId: z.uuid(),
  postUrl: z.string().trim().min(1).max(2048),
});

export const reviewSubmissionInput = z.discriminatedUnion("decision", [
  z.object({
    submissionId: z.uuid(),
    decision: z.literal("approve"),
  }),
  z.object({
    submissionId: z.uuid(),
    decision: z.literal("reject"),
    rejectionReason: z
      .string()
      .trim()
      .min(5, { message: "Give the creator a reason of at least 5 characters" })
      .max(500, { message: "Keep the reason under 500 characters" }),
  }),
]);

export type ReviewSubmissionInput = z.infer<typeof reviewSubmissionInput>;

export const rejectionReasonSchema = z.object({
  rejectionReason: z
    .string()
    .trim()
    .min(5, { message: "Give the creator a reason of at least 5 characters" })
    .max(500, { message: "Keep the reason under 500 characters" }),
});

export type RejectionReasonValues = z.input<typeof rejectionReasonSchema>;

export const reviewQueueInput = z.object({
  campaignId: z.uuid(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(50).default(10),
  status: z.enum(SUBMISSION_STATUSES).nullable().default(null),
});

export const mySubmissionsInput = z.object({
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(50).default(10),
  status: z.enum(SUBMISSION_STATUSES).nullable().default(null),
});
