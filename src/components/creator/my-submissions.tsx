"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";

import { EmptyState, ErrorState, LoadingLabel, TableSkeleton } from "@/components/data-state";
import { PaginationBar } from "@/components/pagination-bar";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
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
import { PLATFORM_LABELS, SUBMISSION_STATUSES, type SubmissionStatus } from "@/lib/constants";
import { formatCents, formatCount } from "@/lib/money";
import { useTRPC } from "@/lib/trpc/client";

const PAGE_SIZE = 10;

export function MySubmissions() {
  const trpc = useTRPC();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<SubmissionStatus | null>(null);

  const query = useQuery(
    trpc.submission.mine.queryOptions({ page, pageSize: PAGE_SIZE, status }),
  );

  const totalEarnings = (query.data?.items ?? [])
    .filter((item) => item.status === "approved" || item.status === "paid")
    .reduce((sum, item) => sum + item.payable, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm text-muted-foreground">
          Confirmed on this page:{" "}
          <span className="font-medium tabular-nums text-foreground">
            {formatCents(totalEarnings)}
          </span>
        </p>
        <Select
          value={status ?? "all"}
          onValueChange={(value) => {
            setStatus(value === "all" ? null : (value as SubmissionStatus));
            setPage(1);
          }}
        >
          <SelectTrigger className="ml-auto w-40" size="sm" aria-label="Filter by status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any status</SelectItem>
            {SUBMISSION_STATUSES.map((value) => (
              <SelectItem key={value} value={value} className="capitalize">
                {value}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-lg border">
        {query.isPending ? (
          <>
            <LoadingLabel>Loading your submissions</LoadingLabel>
            <TableSkeleton rows={PAGE_SIZE} columns={5} />
          </>
        ) : query.isError ? (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        ) : query.data.items.length === 0 ? (
          <EmptyState
            title={status ? `No ${status} submissions` : "You have not submitted a clip yet"}
            description={
              status
                ? "Try a different status filter."
                : "Pick an open campaign and paste the link to your clip."
            }
            action={
              <Button asChild>
                <Link href="/campaigns">Browse campaigns</Link>
              </Button>
            }
          />
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Clip</TableHead>
                  <TableHead>Campaign</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Views</TableHead>
                  <TableHead className="text-right">Earnings</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {query.data.items.map((submission) => {
                  const settled =
                    submission.status === "approved" || submission.status === "paid";
                  return (
                    <TableRow key={submission.id}>
                      <TableCell className="max-w-xs">
                        <a
                          href={submission.postUrl}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="block truncate text-sm underline-offset-4 hover:underline focus-visible:underline"
                        >
                          {submission.postUrl}
                        </a>
                        <p className="text-xs text-muted-foreground">
                          {PLATFORM_LABELS[submission.platform]}
                          {submission.capturedAt ? ` · views as of ${submission.capturedAt}` : ""}
                        </p>
                        {submission.rejectionReason ? (
                          <p className="mt-1 text-xs text-muted-foreground">
                            Reason: {submission.rejectionReason}
                          </p>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-sm">{submission.campaignTitle}</TableCell>
                      <TableCell>
                        <StatusBadge status={submission.status} />
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatCount(submission.views)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatCents(submission.earnings)}
                        <span className="block text-xs text-muted-foreground">
                          {settled ? "confirmed" : "estimated"}
                        </span>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            <PaginationBar
              page={query.data.page}
              pageCount={query.data.pageCount}
              total={query.data.total}
              pageSize={query.data.pageSize}
              busy={query.isFetching}
              onPageChange={setPage}
            />
          </>
        )}
      </div>
    </div>
  );
}
