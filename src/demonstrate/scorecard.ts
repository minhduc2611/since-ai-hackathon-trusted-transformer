import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { config } from "../config.js";
import { datasetDir, type OutPaths } from "../lib/paths.js";
import { findScenario } from "../lib/scenarios.js";

export interface ScorecardRun {
  ok: boolean;
  message: string;
}

/*
Run the pets-eval scorecard on the protected folder.
*/
export function runPetsEvalScorecard(dataset: string, scenario: string, paths: OutPaths): ScorecardRun {
  const toolkit = path.join(config.packageRoot, "toolkit");
  const py = resolvePython(toolkit);
  if (!py) return { ok: false, message: installHint() };

  const args = ["-m", "pets_eval", "scorecard", "--original", datasetDir(dataset), "--protected", paths.protectedDir];
  if (findScenario(scenario)) args.push("--scenario", scenario);
  const env = { ...process.env, PYTHONPATH: toolkit };
  const res = spawnSync(py, args, { cwd: config.packageRoot, env, encoding: "utf8" });
  fs.writeFileSync(paths.scorecardLog, `${res.stdout || ""}\n${res.stderr || ""}`, "utf8");

  if (res.status !== 0) {
    const missing = /ModuleNotFoundError|No module named/i.test(`${res.stderr}${res.stdout}`);
    return { ok: false, message: `pets-eval failed (see ${paths.scorecardLog}). ${missing ? installHint() : ""}`.trim() };
  }
  return { ok: true, message: `Scorecard written to ${paths.scorecardHtml}` };
}

/*
Find a Python executable that can import pets_eval.
*/
function resolvePython(toolkit: string): string | null {
  if (!fs.existsSync(path.join(toolkit, "pets_eval"))) return null;
  for (const cand of ["python3", "python"]) {
    const r = spawnSync(cand, ["-c", "import pets_eval"], {
      env: { ...process.env, PYTHONPATH: toolkit },
      encoding: "utf8",
    });
    if (r.status === 0) return cand;
  }
  return null;
}

/*
Return an install hint when the pets-eval toolkit is unavailable.
*/
function installHint(): string {
  return `Install the toolkit deps: python3 -m pip install pandas numpy scipy scikit-learn (toolkit at ${config.packageRoot}/toolkit)`;
}
