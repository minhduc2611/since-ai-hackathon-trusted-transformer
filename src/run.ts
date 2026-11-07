import { config } from "./config.js";
import { PROGRESS_MARKER, RESULT_MARKER } from "./lib/progressProtocol.js";
import { runPipeline, type PipelineResult } from "./pipeline.js";
import { PIPELINE_STEPS, type PipelineOptions, type PipelineStep } from "./types.js";

/*
Parse CLI args and run the privacy pipeline.
*/
async function main(): Promise<void> {
  const arg = (process.argv[2] || "all").toLowerCase();
  const fromEnv = (process.env.STEPS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean) as PipelineStep[];
  const steps = fromEnv.length
    ? PIPELINE_STEPS.filter((s) => fromEnv.includes(s))
    : arg === "all"
      ? PIPELINE_STEPS
      : PIPELINE_STEPS.filter((s) => s === arg);
  if (!steps.length) throw new Error(`Unknown step "${arg}". Use: ${PIPELINE_STEPS.join(" | ")} | all`);

  const opts: PipelineOptions = {
    dataset: config.dataset,
    scenario: config.scenario,
    tables: (process.env.TABLES || "").split(",").map((t) => t.trim()).filter(Boolean),
    onProgress: reportProgress,
  };
  console.log(`TrustED PETs Transformer | dataset=${opts.dataset} scenario=${opts.scenario} model=${config.model}`);
  const result = await runPipeline(opts, steps);
  printResult(result);
  console.log(`${RESULT_MARKER}${JSON.stringify(result)}`);
}

/*
Emit a machine-readable progress line on stdout.
*/
function reportProgress(step: PipelineStep, message: string): void {
  console.log(`${PROGRESS_MARKER}${JSON.stringify({ step, message })}`);
}

/*
Print a human-readable summary of pipeline results.
*/
function printResult(r: PipelineResult): void {
  if (r.columns) console.log(`detect: ${r.columns} columns labelled`);
  if (r.decisions) console.log(`select: ${r.decisions} PET decisions`);
  for (const [table, t] of Object.entries(r.transform?.tables ?? {})) {
    const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
    console.log(`transform ${table}: k<5 ${pct(t.kBelow5Before)} → ${pct(t.kBelow5After)} (${t.cellsSuppressed} cells suppressed)`);
  }
  if (r.demonstrate) {
    const s = r.demonstrate.scorecard;
    console.log(s ? `scorecard: privacy ${s.privacy} utility ${s.utility} composite ${s.composite}` : r.demonstrate.scorecardMessage);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
