import { createHmac, timingSafeEqual } from "node:crypto";

import { env } from "@/env";

export const SESSION_COOKIE = "clip_session";

function sign(userId: string): string {
  return createHmac("sha256", env.SESSION_SECRET).update(userId).digest("base64url");
}

export function createSessionCookieValue(userId: string): string {
  return `${userId}.${sign(userId)}`;
}

export function readSessionCookieValue(raw: string | undefined | null): string | null {
  if (!raw) return null;

  const separator = raw.lastIndexOf(".");
  if (separator <= 0) return null;

  const userId = raw.slice(0, separator);
  const provided = Buffer.from(raw.slice(separator + 1));
  const expected = Buffer.from(sign(userId));

  if (provided.length !== expected.length) return null;
  if (!timingSafeEqual(provided, expected)) return null;

  return userId;
}

export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: "lax",
  path: "/",
  secure: env.NODE_ENV === "production",
  maxAge: 60 * 60 * 24 * 30,
} as const;
