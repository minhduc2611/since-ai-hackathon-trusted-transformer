import type { PaginatedResponse, Row } from "@shared/api";
import { api } from "../api/client";
import { useAsync } from "./useAsync";

export type RowSource =
  | { kind: "original"; dataset: string; table: string }
  | { kind: "protected"; dataset: string; scenario: string; table: string };

function loader(source: RowSource, limit: number, offset: number): () => Promise<PaginatedResponse<Row>> {
  if (source.kind === "original") return () => api.originalRows(source.dataset, source.table, limit, offset);
  return () => api.protectedRows(source.dataset, source.scenario, source.table, limit, offset);
}

/** Load one page of rows for an original or protected table. */
export function usePaginatedRows(source: RowSource | null, limit: number, offset: number, refreshKey = 0) {
  const key = source ? JSON.stringify(source) : null;
  return useAsync(source ? loader(source, limit, offset) : null, [key, limit, offset, refreshKey]);
}
