import type { CsvRow } from "../lib/csv.js";
import type { PetDecision } from "../types.js";

const MIN_COUNT = /^min_count_(\d+)$/;

/*
Replace rare category values with "other".
*/
export function mergeRare(rows: CsvRow[], column: string, minCount: number): number {
  const counts = new Map<string, number>();
  for (const r of rows) counts.set(r[column], (counts.get(r[column]) ?? 0) + 1);
  let merged = 0;
  for (const r of rows) {
    if (r[column] && (counts.get(r[column]) ?? 0) < minCount) {
      r[column] = "other";
      merged += 1;
    }
  }
  return merged;
}

/*
Apply every min_count generalisation from the PET plan.
*/
export function applyRareMerges(rows: CsvRow[], plan: PetDecision[]): number {
  let merged = 0;
  for (const d of plan) {
    const m = d.level?.match(MIN_COUNT);
    if (m) merged += mergeRare(rows, d.column, Number(m[1]));
  }
  return merged;
}
