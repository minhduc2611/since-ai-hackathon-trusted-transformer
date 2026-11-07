import fs from "node:fs";
import { Router } from "express";
import { outPaths } from "../../lib/paths.js";
import { saveHumanOverrides } from "../../select/humanOverrides.js";
import type { PetPlanPatchRequest } from "../../shared/api.js";
import { countCsvRows, readCsvPage } from "../csvPage.js";
import { HttpError, asyncRoute, ok, param } from "../http.js";
import { enqueueJob } from "../jobs.js";
import { paginated, parsePageParams } from "../pagination.js";
import { buildReport } from "../report.js";
import { protectedTableFile, readResult } from "../results.js";

export const resultsRouter = Router();

resultsRouter.get(
  "/results/:dataset/:scenario",
  asyncRoute((req, res) => ok(res, readResult(param(req, "dataset"), param(req, "scenario")))),
);

resultsRouter.patch(
  "/results/:dataset/:scenario/pet-plan",
  asyncRoute((req, res) => {
    const dataset = param(req, "dataset");
    const scenario = param(req, "scenario");
    const body = req.body as Partial<PetPlanPatchRequest>;
    const overrides = Array.isArray(body.overrides) ? body.overrides : null;
    if (!overrides?.length) throw new HttpError(400, "overrides[] required");
    try {
      saveHumanOverrides(dataset, scenario, overrides);
    } catch (e) {
      throw new HttpError(400, e instanceof Error ? e.message : String(e));
    }
    const result = readResult(dataset, scenario);
    const apply = body.apply !== false;
    if (!apply) return ok(res, { result, jobId: null });
    const job = enqueueJob({
      dataset,
      scenario,
      tables: result.released,
      steps: ["transform", "demonstrate"],
    });
    res.status(202);
    ok(res, { result, jobId: job.id });
  }),
);

resultsRouter.post(
  "/results/:dataset/:scenario/reset",
  asyncRoute((req, res) => {
    const dataset = param(req, "dataset");
    const scenario = param(req, "scenario");
    const root = outPaths(dataset, scenario).root;
    if (fs.existsSync(root)) fs.rmSync(root, { recursive: true, force: true });
    ok(res, { cleared: true });
  }),
);

resultsRouter.get(
  "/results/:dataset/:scenario/tables/:table/rows",
  asyncRoute(async (req, res) => {
    const file = protectedTableFile(param(req, "dataset"), param(req, "scenario"), param(req, "table"));
    const page = parsePageParams(req.query);
    const [total, { rows }] = await Promise.all([countCsvRows(file), readCsvPage(file, page.offset, page.limit)]);
    res.json(paginated(rows, total, page));
  }),
);

resultsRouter.get(
  "/results/:dataset/:scenario/report",
  asyncRoute(async (req, res) => ok(res, await buildReport(param(req, "dataset"), param(req, "scenario")))),
);

resultsRouter.get(
  "/results/:dataset/:scenario/scorecard.html",
  asyncRoute((req, res) => {
    const file = outPaths(param(req, "dataset"), param(req, "scenario")).scorecardHtml;
    if (!fs.existsSync(file)) throw new HttpError(404, "Scorecard not generated");
    res.sendFile(file);
  }),
);
