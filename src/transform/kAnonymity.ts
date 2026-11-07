import type { CsvRow } from "../lib/csv.js";

/*
Suppress QI cells until all equivalence classes reach size k.
*/
export function enforceK(rows: CsvRow[], qis: string[], k = 5): number {
  const order = [...qis].sort((a, b) => distinctCount(rows, b) - distinctCount(rows, a));
  let blanked = 0;
  for (const col of order) {
    const small = rowsInSmallClasses(rows, order, k);
    if (!small.length) break;
    for (const row of small) {
      if (row[col]) blanked += 1;
      row[col] = "";
    }
  }
  return blanked;
}

/*
Compute the share of rows in QI classes smaller than k.
*/
export function shareBelowK(rows: CsvRow[], qis: string[], k = 5): number {
  if (!rows.length || !qis.length) return 0;
  return rowsInSmallClasses(rows, qis, k).length / rows.length;
}

/*
Return rows whose QI combination occurs fewer than k times.
*/
function rowsInSmallClasses(rows: CsvRow[], qis: string[], k: number): CsvRow[] {
  const keyOf = (r: CsvRow) => qis.map((q) => r[q] ?? "").join("\u0001");
  const counts = new Map<string, number>();
  for (const r of rows) counts.set(keyOf(r), (counts.get(keyOf(r)) ?? 0) + 1);
  return rows.filter((r) => (counts.get(keyOf(r)) ?? 0) < k);
}

/*
Count distinct values in a column.
*/
function distinctCount(rows: CsvRow[], col: string): number {
  return new Set(rows.map((r) => r[col] ?? "")).size;
}
