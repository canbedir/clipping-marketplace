"use client";

import { Button } from "@/components/ui/button";

export function PaginationBar({
  page,
  pageCount,
  total,
  pageSize,
  onPageChange,
  busy,
}: {
  page: number;
  pageCount: number;
  total: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  busy?: boolean;
}) {
  const first = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);

  return (
    <nav
      className="flex items-center justify-between gap-4 border-t px-4 py-3"
      aria-label="Pagination"
    >
      <p className="text-sm text-muted-foreground tabular-nums">
        {total === 0 ? "No results" : `${first}\u2013${last} of ${total}`}
      </p>
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => onPageChange(page - 1)}
          disabled={busy || page <= 1}
        >
          Previous
        </Button>
        <span className="text-sm text-muted-foreground tabular-nums" aria-current="page">
          Page {page} of {pageCount}
        </span>
        <Button
          size="sm"
          variant="outline"
          onClick={() => onPageChange(page + 1)}
          disabled={busy || page >= pageCount}
        >
          Next
        </Button>
      </div>
    </nav>
  );
}
