import type { Row } from "@shared/api";

const MAX_CELL = 120;

interface Props {
  rows: Row[];
  offset: number;
}

export function DataTable({ rows, offset }: Props) {
  if (!rows.length) return <p className="muted">No rows.</p>;
  const columns = Object.keys(rows[0]);
  return (
    <div className="table-scroll">
      <table className="data">
        <thead>
          <tr>
            <th className="rownum">#</th>
            {columns.map((c) => (
              <th key={c}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={offset + i}>
              <td className="rownum">{offset + i + 1}</td>
              {columns.map((c) => (
                <Cell key={c} value={row[c]} />
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Cell({ value }: { value: string }) {
  if (value === "") return <td className="empty">∅</td>;
  const short = value.length > MAX_CELL ? `${value.slice(0, MAX_CELL)}…` : value;
  return <td title={value.length > MAX_CELL ? value : undefined}>{short}</td>;
}
