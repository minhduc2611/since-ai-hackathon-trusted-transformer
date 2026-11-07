import path from "node:path";
import { config } from "../config.js";

export interface OutPaths {
  root: string;
  fieldLabelsJson: string;
  fieldLabelsCsv: string;
  petPlanJson: string;
  petPlanCsv: string;
  petOverridesJson: string;
  transformSummary: string;
  inventory: string;
  demoSummary: string;
  protectedDir: string;
  scorecardJson: string;
  scorecardHtml: string;
  scorecardLog: string;
}

const SAFE = /^[A-Za-z0-9_-]+$/;

/*
Build output file paths for one dataset and scenario run.
*/
export function outPaths(dataset: string, scenario: string): OutPaths {
  if (!SAFE.test(dataset) || !SAFE.test(scenario)) {
    throw new Error(`Invalid dataset or scenario name: ${dataset}/${scenario}`);
  }
  const root = path.join(config.outDir, dataset, scenario);
  const protectedDir = path.join(root, "protected");
  return {
    root,
    fieldLabelsJson: path.join(root, "field_labels.json"),
    fieldLabelsCsv: path.join(root, "field_labels.csv"),
    petPlanJson: path.join(root, "pet_plan.json"),
    petPlanCsv: path.join(root, "pet_plan.csv"),
    petOverridesJson: path.join(root, "pet_overrides.json"),
    transformSummary: path.join(root, "transform_summary.json"),
    inventory: path.join(root, "inventory.md"),
    demoSummary: path.join(root, "demo_summary.json"),
    protectedDir,
    scorecardJson: path.join(protectedDir, "scorecard.json"),
    scorecardHtml: path.join(protectedDir, "scorecard.html"),
    scorecardLog: path.join(root, "scorecard_run.log"),
  };
}

/*
Resolve the filesystem path of a dataset directory.
*/
export function datasetDir(dataset: string): string {
  if (!SAFE.test(dataset)) throw new Error(`Invalid dataset name: ${dataset}`);
  return path.join(config.dataDir, dataset);
}
