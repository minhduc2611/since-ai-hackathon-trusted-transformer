import fs from "node:fs";
import { ensureDir, readJson, writeJson } from "../lib/fsutil.js";
import { outPaths } from "../lib/paths.js";
import type { PetDecision, PipelineOptions } from "../types.js";
import { buildInventory, countByPet } from "./inventory.js";
import { runPetsEvalScorecard } from "./scorecard.js";
import { readScorecardSummary, type ScorecardSummary } from "./scorecardSummary.js";

export interface DemonstrateResult {
  inventoryPath: string;
  scorecardMessage: string;
  scorecard: ScorecardSummary | null;
}

/*
Write demo artifacts and run the pets-eval scorecard.
*/
export function runDemonstrate(opts: PipelineOptions): DemonstrateResult {
  const { dataset, scenario } = opts;
  const p = outPaths(dataset, scenario);
  const decisions = readJson<PetDecision[]>(p.petPlanJson);

  ensureDir(p.root);
  fs.writeFileSync(p.inventory, `${buildInventory(decisions).join("\n")}\n`, "utf8");
  writeJson(p.demoSummary, { dataset, scenario, pet_counts: countByPet(decisions), protectedDir: p.protectedDir });

  opts.onProgress?.("demonstrate", "running pets-eval scorecard");
  const run = runPetsEvalScorecard(dataset, scenario, p);
  return { inventoryPath: p.inventory, scorecardMessage: run.message, scorecard: readScorecardSummary(p.scorecardJson) };
}
