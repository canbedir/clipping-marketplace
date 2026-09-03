import { Suspense } from "react";

import { CampaignList } from "@/components/admin/campaign-list";
import { TableSkeleton } from "@/components/data-state";

export const metadata = { title: "Campaigns" };

export default function AdminCampaignsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Campaigns</h1>
        <p className="text-sm text-muted-foreground">
          Every campaign on the platform, with what is left of each budget.
        </p>
      </div>
      <Suspense fallback={<TableSkeleton rows={10} columns={5} />}>
        <CampaignList />
      </Suspense>
    </div>
  );
}
