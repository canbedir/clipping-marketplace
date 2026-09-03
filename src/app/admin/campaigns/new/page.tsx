import { addDays, format } from "date-fns";
import Link from "next/link";

import { CampaignForm } from "@/components/admin/campaign-form";

export const metadata = { title: "New campaign" };

export default function NewCampaignPage() {
  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/campaigns"
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          Back to campaigns
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">New campaign</h1>
      </div>
      <CampaignForm
        defaultValues={{
          title: "",
          platforms: ["tiktok"],
          payoutPer1kViews: "2.50",
          totalBudget: "1000.00",
          status: "draft",
          startsAt: format(new Date(), "yyyy-MM-dd"),
          endsAt: format(addDays(new Date(), 30), "yyyy-MM-dd"),
        }}
      />
    </div>
  );
}
