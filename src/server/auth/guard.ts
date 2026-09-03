import { headers } from "next/headers";
import { redirect } from "next/navigation";

import type { UserRole } from "@/lib/constants";
import type { User } from "@/server/db/schema";
import { resolveUserFromHeaders } from "@/server/trpc/context";

// Routing-level guard so a creator does not land on an admin screen only to be
// met by a permission error. Every procedure still checks for itself; this is
// navigation, not security.
export async function requireRole(role: UserRole): Promise<User> {
  const user = await resolveUserFromHeaders(await headers());

  if (!user) redirect("/");
  if (user.role !== role) redirect(user.role === "admin" ? "/admin/campaigns" : "/campaigns");

  return user;
}
