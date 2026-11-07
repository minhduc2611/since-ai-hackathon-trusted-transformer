import { Router } from "express";
import { availableTables } from "../../lib/releaseTables.js";
import type { ProtectRequest } from "../../shared/api.js";
import { datasetExists, listScenarios } from "../catalog.js";
import { HttpError, asyncRoute, ok, param } from "../http.js";
import { enqueueJob, getJob } from "../jobs.js";

export const jobsRouter = Router();

jobsRouter.post(
  "/protect",
  asyncRoute((req, res) => {
    const request = validateProtect(req.body as Partial<ProtectRequest>);
    const job = enqueueJob(request);
    res.status(202);
    ok(res, { jobId: job.id });
  }),
);

jobsRouter.get(
  "/jobs/:id",
  asyncRoute((req, res) => {
    const job = getJob(param(req, "id"));
    if (!job) throw new HttpError(404, "Job not found");
    ok(res, job);
  }),
);

/*
Validate and normalize a protect job request body.
*/
function validateProtect(body: Partial<ProtectRequest>): ProtectRequest {
  const dataset = String(body.dataset ?? "");
  const scenario = String(body.scenario ?? "");
  if (!datasetExists(dataset)) throw new HttpError(400, `Unknown dataset ${dataset}`);
  if (!listScenarios(dataset).some((s) => s.id === scenario)) {
    throw new HttpError(400, `Scenario ${scenario} does not belong to ${dataset}`);
  }
  const tables = Array.isArray(body.tables) ? body.tables.map(String) : [];
  const known = new Set(availableTables(dataset));
  const unknown = tables.filter((t) => !known.has(t));
  if (unknown.length) throw new HttpError(400, `Unknown tables: ${unknown.join(", ")}`);
  const steps = parseSteps(body.steps);
  return { dataset, scenario, tables, ...(steps ? { steps } : {}) };
}

const ALL_STEPS = ["detect", "select", "transform", "demonstrate"] as const;

function parseSteps(raw: unknown): ProtectRequest["steps"] | undefined {
  if (raw == null) return undefined;
  if (!Array.isArray(raw) || !raw.length) throw new HttpError(400, "steps must be a non-empty array");
  const steps = raw.map(String);
  const bad = steps.filter((s) => !(ALL_STEPS as readonly string[]).includes(s));
  if (bad.length) throw new HttpError(400, `Unknown steps: ${bad.join(", ")}`);
  return steps as ProtectRequest["steps"];
}
