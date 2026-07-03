export interface CursorPage<T> {
  data: T[];
  pagination: { nextCursor: string | null; hasMore: boolean };
}

/**
 * Keyset pagination helper for high-volume lists (jobs, logs, heartbeats).
 * Callers fetch `limit + 1` rows ordered by a monotonic key; this trims the
 * lookahead row and turns it into a `nextCursor`. Works with any orderable
 * key (bigint `sequence`, or a composite string cursor the caller encodes).
 */
export function toCursorPage<T extends { cursorValue: string }>(
  rows: T[],
  limit: number,
): CursorPage<Omit<T, "cursorValue">> {
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? page[page.length - 1]!.cursorValue : null;
  return {
    data: page.map(({ cursorValue, ...rest }) => rest as Omit<T, "cursorValue">),
    pagination: { nextCursor, hasMore },
  };
}

export interface OffsetPage<T> {
  data: T[];
  pagination: { page: number; pageSize: number; total: number };
}

export function toOffsetPage<T>(data: T[], total: number, page: number, pageSize: number): OffsetPage<T> {
  return { data, pagination: { page, pageSize, total } };
}
