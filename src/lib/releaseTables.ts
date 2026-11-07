import { listCsvTables } from "./fsutil.js";
import { datasetDir } from "./paths.js";

/** Tables a scenario needs when the user does not pick any. Missing scenario = all tables. */
const SCENARIO_DEFAULTS: Record<string, string[]> = {
  "HEALTH-S1": ["ed_visits", "lab_results", "clinical_notes"],
};

/*
List CSV table names present in a dataset.
*/
export function availableTables(dataset: string): string[] {
  return listCsvTables(datasetDir(dataset)).map((t) => t.table);
}

/*
Choose default tables for a dataset and scenario.
*/
export function defaultTables(dataset: string, scenario: string): string[] {
  const available = availableTables(dataset);
  const preset = SCENARIO_DEFAULTS[scenario];
  return preset ? available.filter((t) => preset.includes(t)) : available;
}

/*
Return requested tables that exist, or the scenario default.
*/
export function resolveTables(dataset: string, scenario: string, requested?: string[]): string[] {
  if (!requested?.length) return defaultTables(dataset, scenario);
  const available = new Set(availableTables(dataset));
  const unknown = requested.filter((t) => !available.has(t));
  if (unknown.length) throw new Error(`Unknown tables for ${dataset}: ${unknown.join(", ")}`);
  return requested;
}
