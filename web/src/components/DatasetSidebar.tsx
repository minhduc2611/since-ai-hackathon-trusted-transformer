import type { DatasetInfo } from "@shared/api";
import { formatBytes } from "../format";

interface Props {
  datasets: DatasetInfo[];
  dataset: string | null;
  table: string | null;
  onSelect: (dataset: string, table: string | null) => void;
}

export function DatasetSidebar({ datasets, dataset, table, onSelect }: Props) {
  return (
    <nav className="sidebar">
      <h2>Datasets</h2>
      <ul>
        {datasets.map((d) => (
          <li key={d.name}>
            <button
              className={`dataset ${d.name === dataset ? "active" : ""}`}
              onClick={() => onSelect(d.name, d.tables[0]?.name ?? null)}
            >
              <DatasetIcon />
              <span className="label">
                {d.name} <span className="muted">({d.tables.length})</span>
              </span>
            </button>
            {d.name === dataset && <TableList dataset={d} table={table} onSelect={onSelect} />}
          </li>
        ))}
      </ul>
    </nav>
  );
}

function TableList({ dataset, table, onSelect }: { dataset: DatasetInfo } & Pick<Props, "table" | "onSelect">) {
  return (
    <ul className="tables">
      {dataset.tables.map((t) => (
        <li key={t.name}>
          <button className={`table ${t.name === table ? "active" : ""}`} onClick={() => onSelect(dataset.name, t.name)}>
            <TableIcon />
            <span className="label">
              {t.name}.csv <span className="muted">{formatBytes(t.sizeBytes)}</span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function DatasetIcon() {
  return (
    <svg className="nav-icon" viewBox="0 0 16 16" width="14" height="14" aria-hidden>
      <ellipse cx="8" cy="4" rx="5.5" ry="2.2" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <path d="M2.5 4v4c0 1.2 2.5 2.2 5.5 2.2S13.5 9.2 13.5 8V4" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <path d="M2.5 8v4c0 1.2 2.5 2.2 5.5 2.2S13.5 13.2 13.5 12V8" fill="none" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

function TableIcon() {
  return (
    <svg className="nav-icon" viewBox="0 0 16 16" width="14" height="14" aria-hidden>
      <rect x="2" y="2.5" width="12" height="11" rx="1.2" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <path d="M2 6h12M2 9.5h12M6.5 6v7.5" fill="none" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}
