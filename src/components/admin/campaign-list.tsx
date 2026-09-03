"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useState } from "react";

import { EmptyState, ErrorState, LoadingLabel, TableSkeleton } from "@/components/data-state";
import { PaginationBar } from "@/components/pagination-bar";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useDebounced } from "@/hooks/use-debounced";
import { useListParams } from "@/hooks/use-list-params";
import { CAMPAIGN_STATUSES, PLATFORM_LABELS, type CampaignStatus } from "@/lib/constants";
import { formatCents } from "@/lib/money";
import { remainingBudget } from "@/lib/payout";
import { useTRPC } from "@/lib/trpc/client";

const PAGE_SIZE = 10;
const ANY_STATUS = "all";

export function CampaignList() {
  const trpc = useTRPC();
  const { page, search, status, setParams } = useListParams();
  const [searchDraft, setSearchDraft] = useState(search);
  const debouncedSearch = useDebounced(searchDraft);

  useEffect(() => {
    if (debouncedSearch !== search) setParams({ search: debouncedSearch });
  }, [debouncedSearch, search, setParams]);

  const query = useQuery(
    trpc.campaign.list.queryOptions({
      page,
      pageSize: PAGE_SIZE,
      search: debouncedSearch,
      status: (status as CampaignStatus | null) ?? null,
    }),
  );

  const filtered = search.length > 0 || status !== null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="campaign-search">Search titles</Label>
          <Input
            id="campaign-search"
            type="search"
            value={searchDraft}
            onChange={(event) => setSearchDraft(event.target.value)}
            placeholder="Sony, Samsung, festival"
            className="w-64"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="campaign-status">Status</Label>
          <Select
            value={status ?? ANY_STATUS}
            onValueChange={(value) =>
              setParams({ status: value === ANY_STATUS ? null : value })
            }
          >
            <SelectTrigger id="campaign-status" className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY_STATUS}>Any status</SelectItem>
              {CAMPAIGN_STATUSES.map((value) => (
                <SelectItem key={value} value={value} className="capitalize">
                  {value}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button asChild className="ml-auto">
          <Link href="/admin/campaigns/new">New campaign</Link>
        </Button>
      </div>

      <div className="rounded-lg border">
        {query.isPending ? (
          <>
            <LoadingLabel>Loading campaigns</LoadingLabel>
            <TableSkeleton rows={PAGE_SIZE} columns={5} />
          </>
        ) : query.isError ? (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        ) : query.data.items.length === 0 ? (
          <EmptyState
            title="No campaigns match those filters"
            description={
              filtered
                ? "Try a different title, or clear the status filter."
                : "Create your first campaign to start collecting clips."
            }
            action={
              filtered ? (
                <Button
                  variant="outline"
                  onClick={() => {
                    setSearchDraft("");
                    setParams({ search: "", status: null });
                  }}
                >
                  Clear filters
                </Button>
              ) : (
                <Button asChild>
                  <Link href="/admin/campaigns/new">New campaign</Link>
                </Button>
              )
            }
          />
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Campaign</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Rate / 1k views</TableHead>
                  <TableHead className="text-right">Budget left</TableHead>
                  <TableHead className="text-right">Pending</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {query.data.items.map((campaign) => (
                  <TableRow key={campaign.id}>
                    <TableCell>
                      <Link
                        href={`/admin/campaigns/${campaign.id}`}
                        className="font-medium underline-offset-4 hover:underline focus-visible:underline"
                      >
                        {campaign.title}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        {campaign.platforms.map((p) => PLATFORM_LABELS[p]).join(" / ")}
                        {" · "}
                        {campaign.startsAt} to {campaign.endsAt}
                      </p>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={campaign.status} />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCents(campaign.payoutPer1kViews)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCents(remainingBudget(campaign.totalBudget, campaign.spent))}
                      <span className="block text-xs text-muted-foreground">
                        of {formatCents(campaign.totalBudget)}
                      </span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {campaign.pendingCount}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <PaginationBar
              page={query.data.page}
              pageCount={query.data.pageCount}
              total={query.data.total}
              pageSize={query.data.pageSize}
              busy={query.isFetching}
              onPageChange={(next) => setParams({ page: next })}
            />
          </>
        )}
      </div>
    </div>
  );
}
