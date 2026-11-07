import { randomUUID } from "node:crypto";
import type { JobInfo, ProtectRequest } from "../shared/api.js";
import { runPipelineProcess } from "./jobRunner.js";

const MAX_LOG_LINES = 200;
const jobs = new Map<string, JobInfo>();
const queue: string[] = [];
let running = false;

/*
Queue a protect job for serialised execution.
*/
export function enqueueJob(request: ProtectRequest): JobInfo {
  const job: JobInfo = {
    id: randomUUID(),
    request,
    status: "queued",
    step: null,
    log: [],
    createdAt: new Date().toISOString(),
  };
  jobs.set(job.id, job);
  queue.push(job.id);
  void runNext();
  return job;
}

/*
Look up a queued or running job by id.
*/
export function getJob(id: string): JobInfo | undefined {
  return jobs.get(id);
}

/*
Start the next queued protect job if idle.
*/
async function runNext(): Promise<void> {
  if (running) return;
  const id = queue.shift();
  if (!id) return;
  const job = jobs.get(id);
  if (!job) return void runNext();
  running = true;
  job.status = "running";
  try {
    await runPipelineProcess(job.request, {
      onStep: (step, message) => {
        job.step = step;
        pushLog(job, `[${step}] ${message}`);
      },
      onLog: (line) => pushLog(job, line),
    });
    job.status = "done";
  } catch (err) {
    job.status = "failed";
    job.error = err instanceof Error ? err.message : String(err);
  } finally {
    job.finishedAt = new Date().toISOString();
    running = false;
    void runNext();
  }
}

/*
Append a log line to a job, trimming old lines.
*/
function pushLog(job: JobInfo, line: string): void {
  job.log.push(line);
  if (job.log.length > MAX_LOG_LINES) job.log.splice(0, job.log.length - MAX_LOG_LINES);
}
