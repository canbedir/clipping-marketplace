import type { AppErrorDetail } from "@/server/errors";

type ErrorShape = {
  data?: {
    appError?: AppErrorDetail | null;
    zodError?: Record<string, string[] | undefined> | null;
    httpStatus?: number;
  } | null;
  message?: string;
};

export function appErrorOf(error: unknown): AppErrorDetail | null {
  return (error as ErrorShape | null)?.data?.appError ?? null;
}

export function fieldErrorsOf(error: unknown): Record<string, string[] | undefined> | null {
  return (error as ErrorShape | null)?.data?.zodError ?? null;
}

export function messageOf(error: unknown, fallback = "Something went wrong"): string {
  const message = (error as ErrorShape | null)?.message;
  return message && message.length > 0 ? message : fallback;
}
