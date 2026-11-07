import { spawn } from "node:child_process";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";
import { PROGRESS_MARKER, RESULT_MARKER } from "../lib/progressProtocol.js";
import type { JobStep, ProtectRequest } from "../shared/api.js";

const SOLUTION_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

export interface RunHooks {
  onStep: (step: JobStep, message: string) => void;
  onLog: (line: string) => void;
}

/*
Run the pipeline CLI in a child process for the API.
*/
export function runPipelineProcess(req: ProtectRequest, hooks: RunHooks): Promise<void> {
  const child = spawn(process.execPath, ["--import", "tsx", "src/run.ts", "all"], {
    cwd: SOLUTION_ROOT,
    env: {
      ...process.env,
      DATASET: req.dataset,
      SCENARIO: req.scenario,
      TABLES: req.tables.join(","),
      ...(req.steps?.length ? { STEPS: req.steps.join(",") } : {}),
    },
  });
  readline.createInterface({ input: child.stdout }).on("line", (line) => handleLine(line, hooks));
  readline.createInterface({ input: child.stderr }).on("line", (line) => hooks.onLog(line));

  return new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`Pipeline exited with code ${code}`))));
  });
}

/*
Route a child-process stdout line to progress or log hooks.
*/
function handleLine(line: string, hooks: RunHooks): void {
  if (line.startsWith(RESULT_MARKER)) return;
  if (line.startsWith(PROGRESS_MARKER)) {
    const { step, message } = JSON.parse(line.slice(PROGRESS_MARKER.length)) as { step: JobStep; message: string };
    hooks.onStep(step, message);
    return;
  }
  hooks.onLog(line);
}
