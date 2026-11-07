import path from "node:path";
import { readCsv, writeCsv, type CsvRow } from "../lib/csv.js";
import { ensureDir } from "../lib/fsutil.js";
import { datasetDir } from "../lib/paths.js";
import type { PetDecision } from "../types.js";
import { applyColumn } from "./applyColumn.js";
import { enforceK, shareBelowK } from "./kAnonymity.js";
import type { RedactionDict } from "./pets/redact.js";
import { applyRareMerges } from "./rareCategories.js";

const K = 5;

export interface TableResult {
  rows: number;
  qis: string[];
  kBelow5Before: number;
  kBelow5After: number;
  cellsSuppressed: number;
}

/*
Apply the PET plan to one table and write protected output.
*/
export function transformTable(
  dataset: string,
  table: string,
  decisions: PetDecision[],
  protectedDir: string,
  dict?: RedactionDict,
): TableResult {
  const { headers, rows } = readCsv(path.join(datasetDir(dataset), `${table}.csv`));
  const plan = decisions.filter((d) => d.table === table);
  const out = applyPlan(rows, headers, plan, dict);
  applyRareMerges(out.rows, plan);
  const qis = keptQis(plan, out.headers);
  const kBelow5Before = shareBelowK(out.rows, qis, K);
  const cellsSuppressed = enforceK(out.rows, qis, K);

  ensureDir(protectedDir);
  writeCsv(path.join(protectedDir, `${table}.csv`), out.headers, out.rows);
  writeRowMap(protectedDir, table, rows, headers);
  return { rows: out.rows.length, qis, kBelow5Before, kBelow5After: shareBelowK(out.rows, qis, K), cellsSuppressed };
}

/*
Apply column-level PET decisions across all rows.
*/
function applyPlan(
  rows: CsvRow[],
  headers: string[],
  plan: PetDecision[],
  dict?: RedactionDict,
): { headers: string[]; rows: CsvRow[] } {
  const byColumn = new Map(plan.map((d) => [d.column, d]));
  let outHeaders: string[] = [];
  const outRows = rows.map((row) => {
    const mutable = { ...row };
    const kept: string[] = [];
    for (const col of headers) {
      const d = byColumn.get(col);
      const name = d ? applyColumn(mutable, d, dict) : col;
      if (name) kept.push(name);
    }
    if (!outHeaders.length) outHeaders = [...new Set(kept)];
    return pick(mutable, outHeaders);
  });
  return { headers: outHeaders, rows: outRows };
}

/*
List quasi-identifier output names that survived the transform.
*/
function keptQis(plan: PetDecision[], outHeaders: string[]): string[] {
  return plan
    .filter((d) => d.privacy_role === "quasi_identifier" && d.pet !== "suppress")
    .map((d) => (d.subtype === "BIRTH_DATE" ? "age" : d.column))
    .filter((c) => outHeaders.includes(c));
}

/*
Project a row onto the given output headers.
*/
function pick(row: CsvRow, headers: string[]): CsvRow {
  const out: CsvRow = {};
  for (const h of headers) out[h] = row[h] ?? "";
  return out;
}

/*
Write a mapping from protected row index to original record id.
*/
function writeRowMap(protectedDir: string, table: string, rows: CsvRow[], headers: string[]): void {
  const key = pickRecordKey(table, headers);
  const mapRows = rows.map((r, i) => ({ protected_row: String(i), original_record_id: r[key] ?? String(i) }));
  writeCsv(path.join(protectedDir, `rowmap_${table}.csv`), ["protected_row", "original_record_id"], mapRows);
}

/*
Choose the best original record-id column for a table.
*/
function pickRecordKey(table: string, headers: string[]): string {
  const prefer = [`${table.replace(/s$/, "")}_id`, "visit_id", "lab_id", "note_id", "stat_id"];
  for (const p of prefer) if (headers.includes(p)) return p;
  return headers[0];
}
