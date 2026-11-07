import type { PaginatedResponse, Pagination } from "../shared/api.js";

export const DEFAULT_LIMIT = 50;
export const MAX_LIMIT = 500;

export interface PageParams {
  limit: number;
  offset: number;
}

/*
Parse limit and offset query params with sane bounds.
*/
export function parsePageParams(query: Record<string, unknown>): PageParams {
  const limit = clampInt(query.limit, DEFAULT_LIMIT, 1, MAX_LIMIT);
  const offset = clampInt(query.offset, 0, 0, Number.MAX_SAFE_INTEGER);
  return { limit, offset };
}

/*
Build pagination metadata for a page of results.
*/
export function buildPagination(total: number, { limit, offset }: PageParams): Pagination {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  return {
    total,
    limit,
    offset,
    current_page: Math.floor(offset / limit) + 1,
    total_pages: totalPages,
    has_next: offset + limit < total,
    has_previous: offset > 0,
  };
}

/*
Wrap data and pagination into a PaginatedResponse.
*/
export function paginated<T>(data: T[], total: number, page: PageParams): PaginatedResponse<T> {
  return { success: true, data, pagination: buildPagination(total, page) };
}

/*
Parse an integer and clamp it into a range.
*/
function clampInt(raw: unknown, fallback: number, min: number, max: number): number {
  const n = Number.parseInt(String(raw ?? ""), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}
