import { eq } from "drizzle-orm";

import { db, type Database } from "@/server/db";
import { users, type User } from "@/server/db/schema";
import { readSessionCookieValue, SESSION_COOKIE } from "@/server/auth/session";

export type Context = {
  db: Database;
  user: User | null;
  resHeaders: Headers | null;
};

function readCookie(header: string | null, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return undefined;
}

export async function resolveUserFromHeaders(headers: Headers): Promise<User | null> {
  const userId = readSessionCookieValue(readCookie(headers.get("cookie"), SESSION_COOKIE));
  if (!userId) return null;

  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  return user ?? null;
}

export async function createTRPCContext(opts: {
  headers: Headers;
  resHeaders?: Headers;
}): Promise<Context> {
  return {
    db,
    user: await resolveUserFromHeaders(opts.headers),
    resHeaders: opts.resHeaders ?? null,
  };
}

