import fs from "node:fs";
import path from "node:path";
import { config } from "../config.js";
import { listCsvTables } from "../lib/fsutil.js";
import { datasetDir } from "../lib/paths.js";
import { defaultTables } from "../lib/releaseTables.js";
import type { DatasetInfo, ScenarioInfo, TableInfo } from "../shared/api.js";
import { readCsvHeaders } from "./csvPage.js";

export const GENERIC_SCENARIO = "GENERIC";

/*
List available datasets with their tables.
*/
export async function listDatasets(): Promise<DatasetInfo[]> {
  const names = fs
    .readdirSync(config.dataDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
  return Promise.all(names.map(async (name) => ({ name, tables: await listTables(name) })));
}

/*
List tables and columns for one dataset.
*/
export async function listTables(dataset: string): Promise<TableInfo[]> {
  const tables = listCsvTables(datasetDir(dataset));
  return Promise.all(
    tables.map(async ({ table, file }) => ({
      name: table,
      columns: await readCsvHeaders(file),
      sizeBytes: fs.statSync(file).size,
    })),
  );
}

/*
Check whether a dataset directory exists.
*/
export function datasetExists(dataset: string): boolean {
  try {
    return fs.statSync(datasetDir(dataset)).isDirectory();
  } catch {
    return false;
  }
}

/*
List scenarios for a dataset, including a generic fallback.
*/
export function listScenarios(dataset: string): ScenarioInfo[] {
  const file = path.join(config.packageRoot, "metadata", "scenarios.json");
  const all = JSON.parse(fs.readFileSync(file, "utf8")) as Omit<ScenarioInfo, "defaultTables">[];
  const own = all
    .filter((s) => s.dataset === dataset)
    .map((s) => ({ ...s, defaultTables: defaultTables(dataset, s.id) }));
  return [...own, genericScenario(dataset)];
}

/*
Build the fallback GENERIC scenario for a dataset.
*/
function genericScenario(dataset: string): ScenarioInfo {
  return {
    id: GENERIC_SCENARIO,
    dataset,
    title: "Generic controlled research",
    recipient: "Trusted research partner",
    purpose: "Row-level analysis without a predefined utility task set",
    trust_level: "controlled_research",
    utility_requirements: [],
    suggested_privacy_targets: "No direct identifiers; QIs generalised to k>=5; free text redacted.",
    defaultTables: defaultTables(dataset, GENERIC_SCENARIO),
  };
}
