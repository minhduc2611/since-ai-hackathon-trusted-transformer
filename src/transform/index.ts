import fs from "node:fs";
import { readJson, writeJson } from "../lib/fsutil.js";
import { outPaths } from "../lib/paths.js";
import { availableTables, resolveTables } from "../lib/releaseTables.js";
import { trustFromScenario } from "../select/policy.js";
import type { PetDecision, PipelineOptions } from "../types.js";
import { writeHealthPublicRelease, type DpReport } from "./dp/healthPublic.js";
import { buildRedactionDict } from "./redactionDict.js";
import { transformTable, type TableResult } from "./tables.js";

export interface TransformSummary {
  dataset: string;
  scenario: string;
  released: string[];
  withheld: string[];
  tables: Record<string, TableResult>;
  dp?: DpReport;
}

/*
Transform selected tables into a protected release folder.
*/
export function runTransform(opts: PipelineOptions): TransformSummary & { protectedDir: string } {
  const { dataset, scenario } = opts;
  const p = outPaths(dataset, scenario);
  const decisions = readJson<PetDecision[]>(p.petPlanJson);
  const released = resolveTables(dataset, scenario, opts.tables);

  if (fs.existsSync(p.protectedDir)) fs.rmSync(p.protectedDir, { recursive: true });
  if (dataset === "health" && trustFromScenario(scenario) === "public") return publicHealth(dataset, scenario, p, opts);
  opts.onProgress?.("transform", "building redaction dictionary from identifier columns");
  const dict = buildRedactionDict(dataset, decisions);
  opts.onProgress?.("transform", `redaction dictionary has ${dict.size} terms`);
  const tables: Record<string, TableResult> = {};
  for (const table of released) {
    opts.onProgress?.("transform", `protecting ${table}`);
    tables[table] = transformTable(dataset, table, decisions, p.protectedDir, dict);
  }

  const withheld = availableTables(dataset).filter((t) => !released.includes(t));
  const summary: TransformSummary = { dataset, scenario, released, withheld, tables };
  writeJson(p.transformSummary, summary);
  return { ...summary, protectedDir: p.protectedDir };
}

/*
Public trust on health = aggregate only: DP answers, DP-synthetic visits and a suppressed dashboard.
Microdata tables are withheld whatever the user selected.
*/
function publicHealth(
  dataset: string,
  scenario: string,
  p: ReturnType<typeof outPaths>,
  opts: PipelineOptions,
): TransformSummary & { protectedDir: string } {
  opts.onProgress?.("transform", "public release: aggregating with differential privacy (Laplace, ε=1 weekly + ε=1 annual)");
  const dp = writeHealthPublicRelease(p.protectedDir);
  const released = ["ed_visits", "published_weekly_stats", "dp_answers"];
  const tables: Record<string, TableResult> = {
    ed_visits: { rows: dp.synthetic_rows, qis: [], kBelow5Before: 0, kBelow5After: 0, cellsSuppressed: 0 },
    published_weekly_stats: { rows: dp.dashboard_cells, qis: [], kBelow5Before: 0, kBelow5After: 0, cellsSuppressed: dp.dashboard_cells_suppressed },
  };
  const withheld = availableTables(dataset).filter((t) => !released.includes(t));
  const summary: TransformSummary = { dataset, scenario, released, withheld, tables, dp };
  writeJson(p.transformSummary, summary);
  return { ...summary, protectedDir: p.protectedDir };
}
