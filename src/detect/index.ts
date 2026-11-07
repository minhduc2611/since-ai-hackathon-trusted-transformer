import path from "node:path";
import { config } from "../config.js";
import { readCsv, writeCsv } from "../lib/csv.js";
import { ensureDir, writeJson } from "../lib/fsutil.js";
import { datasetDir, outPaths } from "../lib/paths.js";
import { resolveTables } from "../lib/releaseTables.js";
import { sampleValues } from "../lib/sample.js";
import type { FieldLabel, PipelineOptions } from "../types.js";
import { classifyWithGemma } from "./gemmaClassify.js";
import { classifyByRules } from "./rules.js";

const LOW_CONF = 0.55;

/*
Detect privacy roles for every column of the selected tables.
*/
export async function runDetect(opts: PipelineOptions): Promise<FieldLabel[]> {
  const { dataset, scenario } = opts;
  const tables = resolveTables(dataset, scenario, opts.tables);
  const labels: FieldLabel[] = [];
  let budget = config.gemmaMaxColumns;

  let gemmaUsed = 0;
  for (const table of tables) {
    opts.onProgress?.("detect", `classifying ${table}`);
    const file = path.join(datasetDir(dataset), `${table}.csv`);
    const part = await detectTable(dataset, table, file, budget);
    labels.push(...part.labels);
    budget = part.budget;
    gemmaUsed += part.gemmaUsed;
  }

  opts.onProgress?.(
    "detect",
    gemmaUsed ? `Gemma used for ${gemmaUsed} column(s)` : "Gemma not used (all columns classified by rules)",
  );

  const p = outPaths(dataset, scenario);
  ensureDir(p.root);
  writeJson(p.fieldLabelsJson, labels);
  writeCsv(p.fieldLabelsCsv, ["dataset", "table", "column", "privacy_role", "subtype"], labels as unknown as Array<Record<string, unknown>>);
  return labels;
}

/*
Classify every column in one table, using Gemma when rules are unsure.
*/
async function detectTable(
  dataset: string,
  table: string,
  file: string,
  budget: number,
): Promise<{ labels: FieldLabel[]; budget: number; gemmaUsed: number }> {
  const { headers, rows } = readCsv(file);
  const labels: FieldLabel[] = [];
  let left = budget;
  let gemmaUsed = 0;
  for (const column of headers) {
    const samples = sampleValues(rows, column, config.gemmaSampleSize);
    let label = classifyByRules(column, samples, table);
    if (label.confidence < LOW_CONF && left > 0) {
      label = await classifyWithGemma({ dataset, table, column, samples });
      left -= 1;
      gemmaUsed += 1;
    }
    labels.push({ dataset, table, column, ...label });
  }
  return { labels, budget: left, gemmaUsed };
}
