"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useState } from "react";

import { EmptyState, ErrorState, LoadingLabel, TableSkeleton } from "@/components/data-state";
import { PaginationBar } from "@/components/pagination-bar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { PLATFORM_LABELS } from "@/lib/constants";
import { formatCents } from "@/lib/money";
import { remainingBudget } from "@/lib/payout";
import { useTRPC } from "@/lib/trpc/client";

const PAGE_SIZE = 10;

export function CampaignBrowser() {
  const trpc = useTRPC();
  const { page, search, setParams } = useListParams();
  const [searchDraft, setSearchDraft] = useState(search);
  const debouncedSearch = useDebounced(searchDraft);

  useEffect(() => {
    if (debouncedSearch !== search) setParams({ search: debouncedSearch });
  }, [debouncedSearch, search, setParams]);

  const query = useQuery(
    trpc.campaign.browse.queryOptions({
      page,
      pageSize: PAGE_SIZE,
      search: debouncedSearch,
    }),
  );

  return (
    <div className="space-y-4">
      <div className="grid max-w-sm gap-1.5">
        <Label htmlFor="browse-search">Search campaigns</Label>
        <Input
          id="browse-search"
          type="search"
          value={searchDraft}
          onChange={(event) => setSearchDraft(event.target.value)}
          placeholder="Sony, Samsung, festival"
        />
      </div>

      <div className="rounded-lg border">
        {query.isPending ? (
          <>
            <LoadingLabel>Loading campaigns</LoadingLabel>
            <TableSkeleton rows={PAGE_SIZE} columns={4} />
          </>
        ) : query.isError ? (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        ) : query.data.items.length === 0 ? (
          <EmptyState
            title="No open campaigns right now"
            description={
              search
                ? "Nothing matches that search. Try a different word."
                : "Check back later — brands add campaigns regularly."
            }
            action={
              search ? (
                <Button
                  variant="outline"
                  onClick={() => {
                    setSearchDraft("");
                    setParams({ search: "" });
                  }}
                >
                  Clear search
                </Button>
              ) : undefined
            }
          />
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Campaign</TableHead>
                  <TableHead className="text-right">Pays per 1k views</TableHead>
                  <TableHead className="text-right">Budget left</TableHead>
                  <TableHead className="text-right">Submit</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {query.data.items.map((campaign) => (
                  <TableRow key={campaign.id}>
                    <TableCell>
                      <Link
                        href={`/campaigns/${campaign.id}`}
                        className="font-medium underline-offset-4 hover:underline focus-visible:underline"
                      >
                        {campaign.title}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        {campaign.platforms.map((p) => PLATFORM_LABELS[p]).join(" / ")}
                        {" · "}
                        runs to {campaign.endsAt}
                        {campaign.alreadySubmitted ? " · you have submitted here" : ""}
                      </p>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCents(campaign.payoutPer1kViews)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCents(remainingBudget(campaign.totalBudget, campaign.spent))}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button asChild size="sm" variant="outline">
                        <Link href={`/campaigns/${campaign.id}`}>Submit a clip</Link>
                      </Button>
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
