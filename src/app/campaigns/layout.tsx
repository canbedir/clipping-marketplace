import type { ReactNode } from "react";

import { requireRole } from "@/server/auth/guard";

export default async function CreatorCampaignsLayout({ children }: { children: ReactNode }) {
  await requireRole("creator");
  return <>{children}</>;
}
