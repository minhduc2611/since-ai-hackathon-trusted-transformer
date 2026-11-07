import type { CsvRow } from "./csv.js";

/*
Take up to n non-empty distinct sample values from a column.
*/
export function sampleValues(rows: CsvRow[], column: string, n = 8): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const row of rows) {
    const v = String(row[column] ?? "").trim();
    if (!v || seen.has(v)) continue;
    seen.add(v);
    out.push(v.length > 80 ? `${v.slice(0, 77)}...` : v);
    if (out.length >= n) break;
  }
  return out;
}
