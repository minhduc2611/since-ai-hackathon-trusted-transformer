import fs from "node:fs";
import { writeCsv } from "../lib/csv.js";
import { ensureDir, readJson, writeJson } from "../lib/fsutil.js";
import { outPaths } from "../lib/paths.js";
import type { PetAction, PetDecision } from "../types.js";

export const HUMAN_PETS: PetAction[] = [
  "keep",
  "suppress",
  "pseudonym",
  "generalise",
  "redact",
  "aggregate",
  "pseudonym_or_suppress",
  "aggregate_or_generalise",
];

export interface StoredOverride {
  pet: PetAction;
  level?: string;
}

type OverrideMap = Record<string, StoredOverride>;

const PLAN_COLUMNS = ["dataset", "table", "column", "privacy_role", "subtype", "pet", "level", "decided_by", "reason"];

/*
Key used in pet_overrides.json.
*/
export function overrideKey(table: string, column: string): string {
  return `${table}.${column}`;
}

/*
Load human PET overrides for a run, or {} if none.
*/
export function loadOverrides(dataset: string, scenario: string): OverrideMap {
  const file = outPaths(dataset, scenario).petOverridesJson;
  if (!fs.existsSync(file)) return {};
  return readJson<OverrideMap>(file);
}

/*
Merge saved human overrides onto automated PET decisions.
*/
export function applyHumanOverrides(decisions: PetDecision[], dataset: string, scenario: string): PetDecision[] {
  const overrides = loadOverrides(dataset, scenario);
  if (!Object.keys(overrides).length) return decisions;
  return decisions.map((d) => {
    const hit = overrides[overrideKey(d.table, d.column)];
    if (!hit) return d;
    return {
      ...d,
      pet: hit.pet,
      level: hit.level ?? d.level,
      decided_by: "human",
      reason: `human override → ${hit.pet}`,
    };
  });
}

/*
Persist overrides and rewrite pet_plan.* with decided_by=human on those rows.
*/
export function saveHumanOverrides(
  dataset: string,
  scenario: string,
  patches: Array<{ table: string; column: string; pet: string; level?: string }>,
): PetDecision[] {
  const p = outPaths(dataset, scenario);
  if (!fs.existsSync(p.petPlanJson)) throw new Error(`No PET plan for ${dataset}/${scenario}`);
  const decisions = readJson<PetDecision[]>(p.petPlanJson);
  const overrides = loadOverrides(dataset, scenario);

  for (const patch of patches) {
    const pet = parsePet(patch.pet);
    const idx = decisions.findIndex((d) => d.table === patch.table && d.column === patch.column);
    if (idx < 0) throw new Error(`Unknown column ${patch.table}.${patch.column}`);
    overrides[overrideKey(patch.table, patch.column)] = {
      pet,
      ...(patch.level ? { level: patch.level } : {}),
    };
    decisions[idx] = {
      ...decisions[idx],
      pet,
      level: patch.level ?? decisions[idx].level,
      decided_by: "human",
      reason: `human override → ${pet}`,
    };
  }

  ensureDir(p.root);
  writeJson(p.petOverridesJson, overrides);
  writeJson(p.petPlanJson, decisions);
  writeCsv(p.petPlanCsv, PLAN_COLUMNS, decisions as unknown as Array<Record<string, unknown>>);
  return decisions;
}

/*
Remove all human overrides for a run (pet_overrides.json).
*/
export function clearHumanOverrides(dataset: string, scenario: string): void {
  const file = outPaths(dataset, scenario).petOverridesJson;
  if (fs.existsSync(file)) fs.unlinkSync(file);
}

function parsePet(raw: string): PetAction {
  if ((HUMAN_PETS as string[]).includes(raw)) return raw as PetAction;
  throw new Error(`Invalid PET "${raw}". Use: ${HUMAN_PETS.join(", ")}`);
}
