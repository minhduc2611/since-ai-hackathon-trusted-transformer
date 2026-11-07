import path from "node:path";
import { config } from "../config.js";
import { writeCsv } from "../lib/csv.js";
import { ensureDir, readJson, writeJson } from "../lib/fsutil.js";
import { outPaths } from "../lib/paths.js";
import { findScenario } from "../lib/scenarios.js";
import type { FieldLabel, PetDecision, PipelineOptions, TrustLevel } from "../types.js";
import { refineWithGemma } from "./gemmaPlan.js";
import type { SelectContext } from "./gemmaSelect.js";
import { applyHumanOverrides } from "./humanOverrides.js";
import { alignJoinKeys } from "./joinKeys.js";
import { minimiseForTasks } from "./minimise.js";
import { choosePet, reasonFor, trustFromScenario } from "./policy.js";
import { loadScenarioTasks, neededFields, type UtilityTaskInfo } from "./scenarioTasks.js";

const PLAN_COLUMNS = ["dataset", "table", "column", "privacy_role", "subtype", "pet", "level", "decided_by", "reason"];

/*
Map each detected field to a PET for the chosen scenario.
*/
export async function runSelect(opts: PipelineOptions): Promise<PetDecision[]> {
  const { dataset, scenario } = opts;
  const p = outPaths(dataset, scenario);
  const trust = trustFromScenario(scenario);
  const labels = readJson<FieldLabel[]>(p.fieldLabelsJson);
  const tasks = loadScenarioTasks(dataset, scenario);
  opts.onProgress?.("select", `choosing PETs for ${labels.length} columns (${trust}, ${tasks.length} utility tasks)`);
  let decisions = labels.map((label) => decide(label, scenario, trust));
  if (tasks.length) decisions = minimiseForTasks(decisions, neededFields(tasks, labels));
  if (config.gemmaSelect) decisions = await gemmaPass(decisions, opts, trust, tasks);
  decisions = alignJoinKeys(decisions);
  decisions = applyHumanOverrides(decisions, dataset, scenario);
  const human = decisions.filter((d) => d.decided_by === "human").length;
  if (human) opts.onProgress?.("select", `kept ${human} human override(s)`);

  ensureDir(p.root);
  writeJson(p.petPlanJson, decisions);
  writeCsv(p.petPlanCsv, PLAN_COLUMNS, decisions as unknown as Array<Record<string, unknown>>);
  return decisions;
}

/*
Choose a rule-based PET decision for one labelled field.
*/
function decide(label: FieldLabel, scenario: string, trust: TrustLevel): PetDecision {
  const pet = choosePet(label, trust);
  return { ...label, scenario, trust_level: trust, pet, reason: reasonFor(label, pet, trust), decided_by: "rules" };
}

/*
Let Gemma refine the plan using the scenario and its utility tasks.
*/
async function gemmaPass(decisions: PetDecision[], opts: PipelineOptions, trust: TrustLevel, tasks: UtilityTaskInfo[]): Promise<PetDecision[]> {
  const { dataset, scenario } = opts;
  const ctx: SelectContext = {
    scenario: findScenario(scenario),
    scenarioId: scenario,
    trust,
    tasks,
    cacheFile: path.join(outPaths(dataset, scenario).root, "gemma_select_cache.json"),
  };
  opts.onProgress?.("select", `Gemma choosing PETs (${ctx.tasks.length} utility tasks in context)`);
  const { decisions: refined, stats } = await refineWithGemma(decisions, ctx);
  const failed = stats.failedTables.length ? `; failed tables: ${stats.failedTables.join(", ")}` : "";
  opts.onProgress?.("select", `Gemma decided ${stats.accepted} of ${stats.asked} column(s), ${stats.rejected} rejected by guardrails${failed}`);
  return refined;
}
