import { useEffect, useState } from "react";
import { usePaginatedRows, type RowSource } from "../hooks/usePaginatedRows";
import { DataTable } from "./DataTable";
import { Pagination } from "./Pagination";

interface Props {
  source: RowSource;
  refreshKey?: number;
}

/** Paginated view of one original or protected table. */
export function DataViewer({ source, refreshKey = 0 }: Props) {
  const [limit, setLimit] = useState(50);
  const [offset, setOffset] = useState(0);
  const sourceKey = JSON.stringify(source);
  useEffect(() => setOffset(0), [sourceKey, refreshKey]);

  const { data, error, loading } = usePaginatedRows(source, limit, offset, refreshKey);
  const changeLimit = (n: number) => {
    setLimit(n);
    setOffset(0);
  };

  if (error) return <p className="error">{error}</p>;
  return (
    <div className={`viewer ${loading ? "loading" : ""}`}>
      {data ? <DataTable rows={data.data} offset={data.pagination.offset} /> : <p className="muted">Loading…</p>}
      {data && <Pagination pagination={data.pagination} onOffsetChange={setOffset} onLimitChange={changeLimit} />}
    </div>
  );
}
