"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";

import { DailyViewsChart } from "@/components/admin/daily-views-chart";
import { ReviewQueue } from "@/components/admin/review-queue";
import { ErrorState } from "@/components/data-state";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PLATFORM_LABELS } from "@/lib/constants";
import { formatCents, formatCount } from "@/lib/money";
import { useTRPC } from "@/lib/trpc/client";

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card>
      <CardHeader className="pb-1">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-semibold tabular-nums">{value}</p>
        {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
      </CardContent>
    </Card>
  );
}

export function CampaignDetail({ campaignId }: { campaignId: string }) {
  const trpc = useTRPC();
  const query = useQuery(trpc.campaign.overview.queryOptions({ id: campaignId }));

  if (query.isPending) {
    return (
      <div className="space-y-6" aria-hidden>
        <Skeleton className="h-9 w-80" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-28" />
          ))}
        </div>
        <Skeleton className="h-72" />
      </div>
    );
  }

  if (query.isError) {
    return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  }

  const { campaign } = query.data;
  const spentShare =
    campaign.totalBudget > 0 ? Math.round((campaign.spent / campaign.totalBudget) * 100) : 0;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start gap-4">
        <div className="space-y-1">
          <Link
            href="/admin/campaigns"
            className="text-sm text-muted-foreground underline-offset-4 hover:underline"
          >
            Back to campaigns
          </Link>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">{campaign.title}</h1>
            <StatusBadge status={campaign.status} />
          </div>
          <p className="text-sm text-muted-foreground">
            {campaign.platforms.map((p) => PLATFORM_LABELS[p]).join(" / ")}
            {" · "}
            {campaign.startsAt} to {campaign.endsAt}
            {" · "}
            {formatCents(campaign.payoutPer1kViews)} per 1,000 views
          </p>
        </div>
        <Button asChild variant="outline" className="ml-auto">
          <Link href={`/admin/campaigns/${campaign.id}/edit`}>Edit campaign</Link>
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Approved views"
          value={formatCount(query.data.approvedViews)}
          hint={`across ${query.data.approvedSubmissions} approved clips`}
        />
        <Stat
          label="Budget spent"
          value={formatCents(query.data.budgetSpent)}
          hint={`${spentShare}% of ${formatCents(campaign.totalBudget)}`}
        />
        <Stat
          label="Budget left"
          value={formatCents(query.data.budgetLeft)}
          hint={
            query.data.budgetLeft === 0
              ? "Exhausted, so the campaign completed itself"
              : "Available for further approvals"
          }
        />
        <Stat
          label="Pending review"
          value={String(query.data.pendingSubmissions)}
          hint="Waiting on an admin decision"
        />
      </div>

      <section className="space-y-3" aria-labelledby="daily-views-heading">
        <h2 id="daily-views-heading" className="text-lg font-semibold tracking-tight">
          Daily views
        </h2>
        <div className="rounded-lg border p-4">
          <DailyViewsChart data={query.data.daily} />
        </div>
      </section>

      <ReviewQueue campaignId={campaign.id} payoutPer1kViews={campaign.payoutPer1kViews} />
    </div>
  );
}
