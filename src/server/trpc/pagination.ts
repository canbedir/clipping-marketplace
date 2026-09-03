import { sql } from "drizzle-orm";

// Carrying the total on every row costs one extra column but saves a second
// round trip for the count on every page of every list.
export const totalCount = sql<number>`count(*) over ()`.mapWith(Number);

export function paginate(page: number, pageSize: number) {
  return { limit: pageSize, offset: (page - 1) * pageSize };
}

export function pageOf<T>(
  rows: (T & { totalCount: number })[],
  page: number,
  pageSize: number,
) {
  const total = rows[0]?.totalCount ?? 0;
  return {
    items: rows.map(({ totalCount: _total, ...rest }) => rest as T),
    total,
    page,
    pageSize,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
  };
}
