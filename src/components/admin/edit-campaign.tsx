"use client";

import { useQuery } from "@tanstack/react-query";

import { CampaignForm } from "@/components/admin/campaign-form";
import { ErrorState } from "@/components/data-state";
import { Skeleton } from "@/components/ui/skeleton";
import { centsToMoneyInput } from "@/lib/money";
import { useTRPC } from "@/lib/trpc/client";

export function EditCampaign({ campaignId }: { campaignId: string }) {
  const trpc = useTRPC();
  const query = useQuery(trpc.campaign.byId.queryOptions({ id: campaignId }));

  if (query.isPending) {
    return (
      <div className="max-w-2xl space-y-6" aria-hidden>
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  if (query.isError) {
    return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  }

  return (
    <CampaignForm
      campaignId={query.data.id}
      defaultValues={{
        title: query.data.title,
        platforms: query.data.platforms,
        payoutPer1kViews: centsToMoneyInput(query.data.payoutPer1kViews),
        totalBudget: centsToMoneyInput(query.data.totalBudget),
        status: query.data.status,
        startsAt: query.data.startsAt,
        endsAt: query.data.endsAt,
      }}
    />
  );
}
