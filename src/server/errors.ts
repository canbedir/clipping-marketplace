import { TRPCError } from "@trpc/server";

import type { CampaignStatus, SubmissionStatus } from "@/lib/constants";

export type AppErrorDetail =
  | { code: "BUDGET_EXCEEDED"; remaining: number; required: number }
  | { code: "CAMPAIGN_NOT_ACCEPTING"; status: CampaignStatus }
  | { code: "DUPLICATE_SUBMISSION" }
  | { code: "ALREADY_REVIEWED"; status: SubmissionStatus };

export type AppErrorCode = AppErrorDetail["code"];

const TRPC_CODE: Record<AppErrorCode, TRPCError["code"]> = {
  BUDGET_EXCEEDED: "CONFLICT",
  CAMPAIGN_NOT_ACCEPTING: "CONFLICT",
  DUPLICATE_SUBMISSION: "CONFLICT",
  ALREADY_REVIEWED: "CONFLICT",
};

const MESSAGES: Record<AppErrorCode, string> = {
  BUDGET_EXCEEDED: "This approval would take the campaign over its budget",
  CAMPAIGN_NOT_ACCEPTING: "This campaign is not accepting submissions",
  DUPLICATE_SUBMISSION: "That post has already been submitted to this campaign",
  ALREADY_REVIEWED: "This submission has already been reviewed",
};

export class AppError extends Error {
  readonly detail: AppErrorDetail;

  constructor(detail: AppErrorDetail) {
    super(MESSAGES[detail.code]);
    this.name = "AppError";
    this.detail = detail;
  }

  toTRPCError(): TRPCError {
    return new TRPCError({
      code: TRPC_CODE[this.detail.code],
      message: this.message,
      cause: this,
    });
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}
