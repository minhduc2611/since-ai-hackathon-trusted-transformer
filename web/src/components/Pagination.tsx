import type { Pagination as PaginationInfo } from "@shared/api";
import { formatInt } from "../format";

const PAGE_SIZES = [25, 50, 100, 250];

interface Props {
  pagination: PaginationInfo;
  onOffsetChange: (offset: number) => void;
  onLimitChange: (limit: number) => void;
}

export function Pagination({ pagination: p, onOffsetChange, onLimitChange }: Props) {
  const goToPage = (page: number) => onOffsetChange((Math.min(Math.max(page, 1), p.total_pages) - 1) * p.limit);
  return (
    <div className="pagination">
      <button disabled={!p.has_previous} onClick={() => goToPage(1)}>«</button>
      <button disabled={!p.has_previous} onClick={() => goToPage(p.current_page - 1)}>‹ Prev</button>
      <span>
        Page{" "}
        <input
          type="number"
          min={1}
          max={p.total_pages}
          value={p.current_page}
          onChange={(e) => goToPage(Number(e.target.value))}
        />{" "}
        of {formatInt(p.total_pages)}
      </span>
      <button disabled={!p.has_next} onClick={() => goToPage(p.current_page + 1)}>Next ›</button>
      <button disabled={!p.has_next} onClick={() => goToPage(p.total_pages)}>»</button>
      <select value={p.limit} onChange={(e) => onLimitChange(Number(e.target.value))}>
        {PAGE_SIZES.map((n) => (
          <option key={n} value={n}>{n} / page</option>
        ))}
      </select>
      <span className="muted">{formatInt(p.total)} rows</span>
    </div>
  );
}
