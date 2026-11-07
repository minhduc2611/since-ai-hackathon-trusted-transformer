// Self-check for the DP helpers and the HEALTH public release invariants. Run: npx tsx src/transform/dp/selfcheck.ts
import assert from "node:assert/strict";
import path from "node:path";
import { readCsv } from "../../lib/csv.js";
import { GROUPS, ageBand, isoWeek, parseTs, weekThursday } from "./healthVisits.js";
import { writeHealthPublicRelease } from "./healthPublic.js";
import { laplace } from "./laplace.js";

assert.equal(isoWeek(parseTs("2025-01-01 10:00:00")), "2025-W01");
assert.equal(isoWeek(parseTs("2025-12-29 00:00:00")), "2026-W01");
assert.equal(isoWeek(parseTs("2024-12-30 00:00:00")), "2025-W01");
assert.equal(isoWeek(weekThursday("2025-W37")), "2025-W37");
assert.equal(ageBand(79.99), "70-79");
assert.equal(ageBand(93), "80+");

const draws = Array.from({ length: 200000 }, () => laplace(2));
const mean = draws.reduce((a, b) => a + b, 0) / draws.length;
const mad = draws.reduce((a, b) => a + Math.abs(b), 0) / draws.length; // E|X| = scale
assert.ok(Math.abs(mean) < 0.05 && Math.abs(mad - 2) < 0.05, `laplace mean=${mean} mad=${mad}`);

const dir = path.join(process.env.TMPDIR ?? "/tmp", "dp-selfcheck");
const report = writeHealthPublicRelease(dir);
const dash = readCsv(path.join(dir, "published_weekly_stats.csv")).rows;
const groups = new Map<string, number>();
for (const r of dash.filter((r) => r.diagnosis_group !== "all")) {
  assert.ok(Number(r.visits) >= 5, `small cell published: ${JSON.stringify(r)}`);
  groups.set(`${r.week}|${r.age_band}`, (groups.get(`${r.week}|${r.age_band}`) ?? 0) + 1);
}
for (const [k, shown] of groups) assert.notEqual(GROUPS.length - shown, 1, `single suppressed cell recoverable from total: ${k}`);
const visits = readCsv(path.join(dir, "ed_visits.csv"));
assert.deepEqual(visits.headers, ["arrival_ts", "age_band", "diagnosis_group"]);
assert.equal(visits.rows.length, report.synthetic_rows);
console.log("dp selfcheck ok", { synthetic_rows: report.synthetic_rows, dashboard_cells: report.dashboard_cells });
