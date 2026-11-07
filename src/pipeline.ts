import { runDemonstrate, type DemonstrateResult } from "./demonstrate/index.js";
import { runDetect } from "./detect/index.js";
import { runSelect } from "./select/index.js";
import { runTransform, type TransformSummary } from "./transform/index.js";
import type { PipelineOptions, PipelineStep } from "./types.js";

export interface PipelineResult {
  columns: number;
  decisions: number;
  transform?: TransformSummary;
  demonstrate?: DemonstrateResult;
}

/*
Run the given pipeline steps in order.
*/
export async function runPipeline(
  opts: PipelineOptions,
  steps: PipelineStep[] = ["detect", "select", "transform", "demonstrate"],
): Promise<PipelineResult> {
  const result: PipelineResult = { columns: 0, decisions: 0 };
  if (steps.includes("detect")) {
    opts.onProgress?.("detect", "start");
    result.columns = (await runDetect(opts)).length;
  }
  if (steps.includes("select")) {
    opts.onProgress?.("select", "start");
    result.decisions = (await runSelect(opts)).length;
  }
  if (steps.includes("transform")) {
    opts.onProgress?.("transform", "start");
    result.transform = runTransform(opts);
  }
  if (steps.includes("demonstrate")) {
    opts.onProgress?.("demonstrate", "start");
    result.demonstrate = runDemonstrate(opts);
  }
  return result;
}
