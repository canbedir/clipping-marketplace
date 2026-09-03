"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

export type ListParams = {
  page: number;
  search: string;
  status: string | null;
};

export function useListParams(): ListParams & {
  setParams: (next: Partial<ListParams>) => void;
} {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const page = Math.max(1, Number(searchParams.get("page") ?? 1) || 1);
  const search = searchParams.get("q") ?? "";
  const status = searchParams.get("status");

  const setParams = useCallback(
    (next: Partial<ListParams>) => {
      const params = new URLSearchParams(searchParams.toString());
      const merged = { page, search, status, ...next };

      // Any change other than paging puts you back on the first page.
      if (next.search !== undefined || next.status !== undefined) merged.page = 1;

      if (merged.page > 1) params.set("page", String(merged.page));
      else params.delete("page");
      if (merged.search) params.set("q", merged.search);
      else params.delete("q");
      if (merged.status) params.set("status", merged.status);
      else params.delete("status");

      router.replace(params.size > 0 ? `${pathname}?${params}` : pathname, { scroll: false });
    },
    [page, pathname, router, search, searchParams, status],
  );

  return { page, search, status, setParams };
}
