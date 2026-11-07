import path from "node:path";
import { Router } from "express";
import { datasetDir } from "../../lib/paths.js";
import { availableTables } from "../../lib/releaseTables.js";
import { datasetExists, listDatasets, listScenarios } from "../catalog.js";
import { countCsvRows, readCsvPage } from "../csvPage.js";
import { HttpError, asyncRoute, ok, param } from "../http.js";
import { paginated, parsePageParams } from "../pagination.js";

export const datasetsRouter = Router();

datasetsRouter.get(
  "/datasets",
  asyncRoute(async (_req, res) => ok(res, await listDatasets())),
);

datasetsRouter.get(
  "/scenarios",
  asyncRoute((req, res) => {
    const dataset = String(req.query.dataset ?? "");
    if (!datasetExists(dataset)) throw new HttpError(404, `Unknown dataset ${dataset}`);
    ok(res, listScenarios(dataset));
  }),
);

datasetsRouter.get(
  "/datasets/:dataset/tables/:table/rows",
  asyncRoute(async (req, res) => {
    const dataset = param(req, "dataset");
    const table = param(req, "table");
    if (!datasetExists(dataset) || !availableTables(dataset).includes(table)) {
      throw new HttpError(404, `Unknown table ${dataset}/${table}`);
    }
    const file = path.join(datasetDir(dataset), `${table}.csv`);
    const page = parsePageParams(req.query);
    const [total, { rows }] = await Promise.all([countCsvRows(file), readCsvPage(file, page.offset, page.limit)]);
    res.json(paginated(rows, total, page));
  }),
);
