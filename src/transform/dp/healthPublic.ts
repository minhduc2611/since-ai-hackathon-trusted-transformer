import fs from "node:fs";
import path from "node:path";
import { config } from "../../config.js";
import { readCsv, writeCsv, type CsvRow } from "../../lib/csv.js";
import { ensureDir } from "../../lib/fsutil.js";
import { datasetDir } from "../../lib/paths.js";
import { AGE_BANDS, GROUPS, deriveVisits, isoWeek, weekThursday, type Visit } from "./healthVisits.js";
import { laplace, noisyCount, noisyMean } from "./laplace.js";

/** Event-level DP budget (one ED visit = one record). Families within a release touch disjoint cells → parallel composition. */
export const BUDGET = {
  weekly: { epsilon: 1, cube: 1 }, // per weekly release: week × age band × diagnosis group counts
  annual: { epsilon: 1, monthAge: 0.25, muniGroup: 0.25, los: 0.2, admitted: 0.2, hour: 0.1 },
};
const MIN_CELL = 5;

type Query = { id: string; type: "count" | "mean"; value?: keyof Visit; filters: Record<string, string>; bounds?: [number, number] };

export interface DpReport {
  mechanism: string;
  unit: string;
  budget: typeof BUDGET;
  composition: string;
  files: Record<string, string>;
  synthetic_rows: number;
  dashboard_cells: number;
  dashboard_cells_suppressed: number;
}

/*
HEALTH public release (aggregate only): no real visit row leaves the hospital.
Writes dp_answers.csv, a DP-synthetic ed_visits.csv and a small-cell-suppressed weekly dashboard table.
*/
export function writeHealthPublicRelease(protectedDir: string): DpReport {
  const visits = deriveVisits(readCsv(path.join(datasetDir("health"), "ed_visits.csv")).rows);
  const cube = noisyWeeklyCube(visits);
  const hours = noisyHours(visits);
  ensureDir(protectedDir);
  const answers = answerWorkload(visits, cube);
  writeCsv(path.join(protectedDir, "dp_answers.csv"), ["id", "value"], answers);
  const synthetic = syntheticVisits(cube, hours);
  writeCsv(path.join(protectedDir, "ed_visits.csv"), ["arrival_ts", "age_band", "diagnosis_group"], synthetic);
  const suppressed = { n: 0 };
  const dash = dashboardTable(cube, suppressed);
  writeCsv(path.join(protectedDir, "published_weekly_stats.csv"), ["week", "age_band", "diagnosis_group", "visits"], dash);
  return {
    mechanism: "Laplace (sensitivity 1 for counts; clamped sums for means)",
    unit: "one ED visit (event-level DP; a patient with several visits gets proportionally weaker protection)",
    budget: BUDGET,
    composition: "Each weekly release costs ε=1 (a visit is in exactly one week). The annual summary costs ε=1. Total per visit: ε=2.",
    files: {
      "dp_answers.csv": "254 workload queries; ILI-by-week derived from the weekly cube, the rest from the annual summary",
      "ed_visits.csv": "synthetic rows rebuilt from the noisy weekly cube + noisy hour-of-day histogram (post-processing only)",
      "published_weekly_stats.csv": `dashboard cells from the noisy cube; cells < ${MIN_CELL} and their complementary cell suppressed (left out; the 'all' row keeps the total)`,
    },
    synthetic_rows: synthetic.length,
    dashboard_cells: dash.length,
    dashboard_cells_suppressed: suppressed.n,
  };
}

/*
Noisy count for every (week, age band, diagnosis group) cell of the public calendar grid.
*/
function noisyWeeklyCube(visits: Visit[]): Map<string, number> {
  const truth = countBy(visits, (v) => [v.week, v.age_band, v.diagnosis_group].join("|"));
  const cube = new Map<string, number>();
  for (const week of calendarWeeks(visits))
    for (const band of AGE_BANDS)
      for (const group of GROUPS) {
        const key = [week, band, group].join("|");
        cube.set(key, noisyCount(truth.get(key) ?? 0, BUDGET.weekly.cube));
      }
  return cube;
}

/*
Noisy hour-of-day histogram (annual summary).
*/
function noisyHours(visits: Visit[]): number[] {
  const truth = countBy(visits, (v) => String(v.hour));
  return Array.from({ length: 24 }, (_, h) => noisyCount(truth.get(String(h)) ?? 0, BUDGET.annual.hour));
}

/*
Answer the published workload: ILI-by-week from the cube (free), other families with their own noise.
*/
function answerWorkload(visits: Visit[], cube: Map<string, number>): CsvRow[] {
  const file = path.join(config.packageRoot, "metadata", "dp_query_workload_health.json");
  const queries = (JSON.parse(fs.readFileSync(file, "utf8")) as { queries: Query[] }).queries;
  return queries.map((q) => ({ id: q.id, value: String(answer(q, visits, cube)) }));
}

function answer(q: Query, visits: Visit[], cube: Map<string, number>): number {
  const f = q.filters;
  if (q.type === "count" && f.week && f.diagnosis_group) {
    return AGE_BANDS.reduce((s, b) => s + (cube.get([f.week, b, f.diagnosis_group].join("|")) ?? 0), 0);
  }
  const hit = visits.filter((v) => Object.entries(f).every(([k, val]) => String(v[k as keyof Visit]) === val));
  if (q.type === "count") return noisyCount(hit.length, f.month ? BUDGET.annual.monthAge : BUDGET.annual.muniGroup);
  const [lo, hi] = q.bounds ?? [0, 1];
  const vals = hit.map((v) => v[q.value!]).filter((x): x is number => typeof x === "number");
  const eps = q.value === "los" ? BUDGET.annual.los : BUDGET.annual.admitted;
  return Number(noisyMean(vals, lo, hi, eps).toFixed(4));
}

/*
Rebuild visit rows from noisy counts: each cell becomes n rows on the Thursday of its week,
hours dealt out in proportion to the noisy hour histogram. No real row is copied.
*/
function syntheticVisits(cube: Map<string, number>, hours: number[]): CsvRow[] {
  const total = hours.reduce((a, b) => a + b, 0) || 1;
  const out: CsvRow[] = [];
  const byWeek = new Map<string, [string, string, number][]>();
  for (const [key, n] of cube) {
    const [week, band, group] = key.split("|");
    if (n > 0) byWeek.set(week, [...(byWeek.get(week) ?? []), [band, group, n]]);
  }
  for (const [week, cells] of byWeek) {
    const slots = dealHours(cells.reduce((s, c) => s + c[2], 0), hours, total);
    const day = weekThursday(week).toISOString().slice(0, 10);
    let i = 0;
    for (const [band, group, n] of cells)
      for (let k = 0; k < n; k++, i++)
        out.push({ arrival_ts: `${day} ${String(slots[i]).padStart(2, "0")}:00:00`, age_band: band, diagnosis_group: group });
  }
  return out;
}

/*
Largest-remainder split of n rows over 24 hours, returned as one hour per row.
*/
function dealHours(n: number, hours: number[], total: number): number[] {
  const exact = hours.map((h) => (h / total) * n);
  const counts = exact.map(Math.floor);
  const order = exact.map((x, h) => [x - Math.floor(x), h]).sort((a, b) => b[0] - a[0]);
  for (let r = n - counts.reduce((a, b) => a + b, 0), j = 0; r > 0; r--, j++) counts[order[j][1]]++;
  return counts.flatMap((c, h) => Array<number>(c).fill(h));
}

/*
Dashboard: per week and age band, one row per diagnosis group plus an "all" total.
Cells below MIN_CELL are suppressed; if only one cell in a row group is suppressed,
the next smallest is suppressed too so the total cannot give it back.
*/
function dashboardTable(cube: Map<string, number>, suppressed: { n: number }): CsvRow[] {
  const out: CsvRow[] = [];
  const weeks = [...new Set([...cube.keys()].map((k) => k.split("|")[0]))];
  for (const week of weeks)
    for (const band of AGE_BANDS) {
      const cells = GROUPS.map((g) => ({ g, n: cube.get([week, band, g].join("|")) ?? 0 }));
      const hidden = new Set(cells.filter((c) => c.n < MIN_CELL).map((c) => c.g));
      if (hidden.size === 1) {
        const next = cells.filter((c) => !hidden.has(c.g)).sort((a, b) => a.n - b.n)[0];
        if (next) hidden.add(next.g);
      }
      // Suppressed cells are left out (a missing group = suppressed); a text marker would be read as a count by numeric tools.
      for (const c of cells) if (!hidden.has(c.g)) out.push({ week, age_band: band, diagnosis_group: c.g, visits: String(c.n) });
      suppressed.n += hidden.size;
      out.push({ week, age_band: band, diagnosis_group: "all", visits: String(cells.reduce((s, c) => s + c.n, 0)) });
    }
  return out;
}

/** Every ISO week touching the calendar years present (the calendar is public, not data-dependent). */
function calendarWeeks(visits: Visit[]): string[] {
  const years = [...new Set(visits.map((v) => Number(v.month.slice(0, 4))))];
  const weeks = new Set<string>();
  for (const y of years)
    for (let t = Date.UTC(y, 0, 1); t < Date.UTC(y + 1, 0, 1); t += 86400000) weeks.add(isoWeek(new Date(t)));
  return [...weeks].sort();
}

function countBy<T>(items: T[], key: (x: T) => string): Map<string, number> {
  const m = new Map<string, number>();
  for (const x of items) m.set(key(x), (m.get(key(x)) ?? 0) + 1);
  return m;
}

