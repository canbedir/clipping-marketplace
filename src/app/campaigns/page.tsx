import { Suspense } from "react";

import { CampaignBrowser } from "@/components/creator/campaign-browser";
import { TableSkeleton } from "@/components/data-state";

export const metadata = { title: "Browse campaigns" };

export default function BrowseCampaignsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Open campaigns</h1>
        <p className="text-sm text-muted-foreground">
          Pick a campaign, post your clip, and get paid per thousand views until the budget
          runs out.
        </p>
      </div>
      <Suspense fallback={<TableSkeleton rows={10} columns={4} />}>
        <CampaignBrowser />
      </Suspense>
    </div>
  );
}
