import fs from "node:fs";
import path from "node:path";
import { readScorecardSummary } from "../demonstrate/scorecardSummary.js";
import { readJson } from "../lib/fsutil.js";
import { outPaths } from "../lib/paths.js";
import type { PetDecision } from "../types.js";
import type { PetPlanEntry, ResultInfo } from "../shared/api.js";
import type { TransformSummary } from "../transform/index.js";
import { HttpError } from "./http.js";

/*
Load a finished run from the output folder.
*/
export function readResult(dataset: string, scenario: string): ResultInfo {
  const p = outPaths(dataset, scenario);
  if (!fs.existsSync(p.transformSummary) || !fs.existsSync(p.petPlanJson)) {
    throw new HttpError(404, `No protected result for ${dataset}/${scenario} yet`);
  }
  const summary = readJson<TransformSummary>(p.transformSummary);
  const plan = readJson<PetDecision[]>(p.petPlanJson);
  return {
    dataset,
    scenario,
    released: summary.released,
    withheld: summary.withheld,
    tables: summary.tables,
    petPlan: plan.map(toPlanEntry),
    scorecard: readScorecardSummary(p.scorecardJson),
    hasScorecardHtml: fs.existsSync(p.scorecardHtml),
  };
}

/*
Resolve the path of a released protected table.
*/
export function protectedTableFile(dataset: string, scenario: string, table: string): string {
  const result = readResult(dataset, scenario);
  if (table.startsWith("rowmap_") || !result.released.includes(table)) {
    throw new HttpError(404, `Table ${table} is not part of the protected release`);
  }
  const file = path.join(outPaths(dataset, scenario).protectedDir, `${table}.csv`);
  if (!fs.existsSync(file)) {
    throw new HttpError(404, `Protected table ${table} is not ready yet (pipeline still writing or was cleared)`);
  }
  return file;
}

/*
Project a PetDecision into the API plan entry shape.
*/
function toPlanEntry(d: PetDecision): PetPlanEntry {
  return {
    table: d.table,
    column: d.column,
    privacy_role: d.privacy_role,
    subtype: d.subtype,
    pet: d.pet,
    level: d.level,
    reason: d.reason,
    source: d.source,
    decided_by: d.decided_by,
  };
}
