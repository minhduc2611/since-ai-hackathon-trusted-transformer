import fs from "node:fs";
import path from "node:path";
import { config } from "../config.js";

export interface ScenarioMeta {
  id: string;
  dataset: string;
  trust_level: string;
  title?: string;
  recipient?: string;
  purpose?: string;
  threat_model?: string;
  suggested_privacy_targets?: string;
  notes?: string;
  utility_requirements?: string[];
}

/*
Look up a scenario in scenarios.json, or null for custom ids.
*/
export function findScenario(id: string): ScenarioMeta | null {
  const file = path.join(config.packageRoot, "metadata", "scenarios.json");
  const list = JSON.parse(fs.readFileSync(file, "utf8")) as ScenarioMeta[];
  return list.find((s) => s.id === id) ?? null;
}
