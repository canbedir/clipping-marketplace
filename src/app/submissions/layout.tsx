import type { ReactNode } from "react";

import { requireRole } from "@/server/auth/guard";

export default async function SubmissionsLayout({ children }: { children: ReactNode }) {
  await requireRole("creator");
  return <>{children}</>;
}
