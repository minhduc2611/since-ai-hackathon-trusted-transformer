import fs from "node:fs";
import path from "node:path";
import { parse } from "csv-parse";
import { outPaths } from "../lib/paths.js";
import { findScenario } from "../lib/scenarios.js";
import { loadScenarioTasks, type UtilityTaskInfo } from "../select/scenarioTasks.js";
import type { ReportBar, ReportChart, ReportSection, ScenarioReport } from "../shared/api.js";
import { readResult } from "./results.js";

type Kind = "time" | "numeric" | "text" | "keys" | "category";

const SAMPLE_ROWS = 500;
const TOP_N = 8;
const MAX_CATEGORIES = 5000;
const MAX_TIME_BUCKETS = 120;
const HIST_BINS = 12;
const PLACEHOLDER = /\[([A-Z][A-Z_]*)\]/g;

const cache = new Map<string, { stamp: number; report: ScenarioReport }>();

/*
Build a scenario-driven report from the protected release: one section per required utility task,
charting only the columns that task reads.
*/
export async function buildReport(dataset: string, scenario: string): Promise<ScenarioReport> {
  const result = readResult(dataset, scenario);
  const p = outPaths(dataset, scenario);
  const stamp = fs.existsSync(p.transformSummary) ? fs.statSync(p.transformSummary).mtimeMs : 0;
  const key = `${dataset}/${scenario}`;
  const hit = cache.get(key);
  if (hit && hit.stamp === stamp) return hit.report;

  const headers = new Map<string, string[]>();
  for (const table of result.released) {
    const file = path.join(p.protectedDir, `${table}.csv`);
    if (fs.existsSync(file)) headers.set(table, await readHeaders(file));
  }

  const tasks = loadScenarioTasks(dataset, scenario);
  const plans = tasks.length ? tasks.map((t) => planTask(t, headers)) : fallbackPlans(headers);
  const activity = await activityPlan(p.protectedDir, headers);
  if (activity.refs.length) plans.unshift(activity);

  const wanted = new Map<string, Set<string>>();
  for (const plan of plans) {
    for (const ref of plan.refs) {
      const set = wanted.get(ref.table) ?? new Set<string>();
      set.add(ref.column);
      wanted.set(ref.table, set);
    }
  }

  const profiles = new Map<string, TableProfile>();
  const rowCounts = new Map<string, number>();
  for (const [table, cols] of wanted) {
    const file = path.join(p.protectedDir, `${table}.csv`);
    const profile = await profileTable(file, [...cols], groupPairs(table, plans));
    profiles.set(table, profile);
    rowCounts.set(table, profile.rows);
  }
  for (const table of headers.keys()) {
    if (!rowCounts.has(table)) rowCounts.set(table, result.tables[table]?.rows ?? 0);
  }

  const scoreById = new Map((result.scorecard?.utilityTasks ?? []).map((u) => [u.id, u.score]));
  const sections: ReportSection[] = plans.map((plan) => ({
    id: plan.id,
    description: plan.description,
    score: plan === activity ? undefined : (scoreById.get(plan.id) ?? null),
    charts: chartsFor(plan, profiles),
  }));

  const meta = findScenario(scenario);
  const report: ScenarioReport = {
    dataset,
    scenario,
    title: meta?.title ?? scenario,
    recipient: meta?.recipient ?? "Data recipient",
    purpose: meta?.purpose ?? "",
    trustLevel: meta?.trust_level ?? "",
    tables: [...headers.entries()].map(([name, cols]) => ({
      name,
      rows: rowCounts.get(name) ?? 0,
      columns: cols.length,
    })),
    privacy: result.scorecard?.privacy ?? null,
    utility: result.scorecard?.utility ?? null,
    composite: result.scorecard?.composite ?? null,
    sections,
  };
  cache.set(key, { stamp, report });
  return report;
}

interface ColumnRef {
  table: string;
  column: string;
}

interface TaskPlan {
  id: string;
  description: string;
  refs: ColumnRef[];
}

/*
Resolve a task's needs ("t.a|t.b", "a+b", "ts (time of day)") to protected columns that exist.
*/
function planTask(task: UtilityTaskInfo, headers: Map<string, string[]>): TaskPlan {
  const refs: ColumnRef[] = [];
  for (const need of task.needs) {
    const alts = need.split("|").map((alt) =>
      alt
        .split(/[+,]/)
        .map((part) => part.replace(/\(.*?\)/g, "").trim())
        .filter(Boolean)
        .map((ref) => {
          const [table, column] = ref.includes(".") ? ref.split(".", 2) : [task.table, ref];
          return { table, column };
        }),
    );
    const exists = (r: ColumnRef) => headers.get(r.table)?.includes(r.column) ?? false;
    const chosen = alts.find((parts) => parts.every(exists)) ?? alts.flat().filter(exists);
    for (const r of chosen) if (!refs.some((x) => x.table === r.table && x.column === r.column)) refs.push(r);
  }
  return { id: task.id, description: task.description, refs };
}

function fallbackPlans(headers: Map<string, string[]>): TaskPlan[] {
  return [...headers.entries()].map(([table, cols]) => ({
    id: table,
    description: `Overview of ${table}`,
    refs: cols.slice(0, 6).map((column) => ({ table, column })),
  }));
}

/*
First timestamp-like column of each released table, for rows-over-time trend lines.
*/
async function activityPlan(dir: string, headers: Map<string, string[]>): Promise<TaskPlan> {
  const refs: ColumnRef[] = [];
  for (const [table, cols] of headers) {
    const sample = await readSample(path.join(dir, `${table}.csv`), cols);
    const column = cols.find((c) => classify(sample.map((r) => r[c] ?? "")) === "time");
    if (column) refs.push({ table, column });
  }
  return { id: "Activity", description: "Records over time in the protected release", refs };
}

/*
Pairs (dimension, measure) within one table that a task reads together, for grouped averages.
*/
function groupPairs(table: string, plans: TaskPlan[]): Array<[string, string]> {
  const pairs: Array<[string, string]> = [];
  for (const plan of plans) {
    const cols = plan.refs.filter((r) => r.table === table).map((r) => r.column);
    for (const a of cols) for (const b of cols) if (a !== b) pairs.push([a, b]);
  }
  return pairs;
}

interface ColumnStats {
  kind: Kind;
  blank: number;
  counts: Map<string, number>;
  overflow: boolean;
  distinct: Set<string>;
  numbers: number[];
  textLen: number;
  textRows: number;
  placeholders: Map<string, number>;
  samples: string[];
}

interface TableProfile {
  rows: number;
  columns: Map<string, ColumnStats>;
  grouped: Map<string, Map<string, { sum: number; n: number }>>;
  pairs: Array<[string, string]>;
}

/*
Stream one protected table once, profiling the requested columns.
*/
async function profileTable(file: string, columns: string[], allPairs: Array<[string, string]>): Promise<TableProfile> {
  const sample = await readSample(file, columns);
  const kinds = new Map(columns.map((c) => [c, classify(sample.map((r) => r[c] ?? ""))]));
  const stats = new Map<string, ColumnStats>(
    columns.map((c) => [
      c,
      {
        kind: kinds.get(c) as Kind,
        blank: 0,
        counts: new Map(),
        overflow: false,
        distinct: new Set(),
        numbers: [],
        textLen: 0,
        textRows: 0,
        placeholders: new Map(),
        samples: [],
      },
    ]),
  );
  const pairs = allPairs.filter(([dim, measure]) => {
    const dk = kinds.get(dim);
    return kinds.get(measure) === "numeric" && (dk === "category" || dk === "time");
  });
  const grouped = new Map<string, Map<string, { sum: number; n: number }>>();
  for (const [dim, measure] of pairs) grouped.set(`${measure}|${dim}`, new Map());

  let rows = 0;
  const stream = fs.createReadStream(file);
  try {
    const parser = stream.pipe(
      parse({ columns: true, bom: true, relax_quotes: true, relax_column_count: true, skip_empty_lines: true }),
    );
    for await (const row of parser as AsyncIterable<Record<string, string>>) {
      rows += 1;
      for (const [col, s] of stats) accumulate(s, row[col] ?? "");
      for (const [dim, measure] of pairs) {
        const d = row[dim];
        const v = Number(row[measure]);
        if (!d || row[measure] === "" || !Number.isFinite(v)) continue;
        const bucket = kinds.get(dim) === "time" ? timeKey(d) : d;
        const g = grouped.get(`${measure}|${dim}`) as Map<string, { sum: number; n: number }>;
        const cur = g.get(bucket) ?? { sum: 0, n: 0 };
        cur.sum += v;
        cur.n += 1;
        if (g.size < MAX_CATEGORIES || g.has(bucket)) g.set(bucket, cur);
      }
    }
  } finally {
    stream.destroy();
  }
  return { rows, columns: stats, grouped, pairs };
}

function accumulate(s: ColumnStats, raw: string): void {
  const v = raw.trim();
  if (!v) {
    s.blank += 1;
    return;
  }
  switch (s.kind) {
    case "numeric": {
      const n = Number(v);
      if (Number.isFinite(n)) s.numbers.push(n);
      else s.blank += 1;
      return;
    }
    case "time":
      bump(s.counts, timeKey(v));
      return;
    case "keys":
      s.distinct.add(v);
      return;
    case "text": {
      s.textRows += 1;
      s.textLen += v.length;
      for (const m of v.matchAll(PLACEHOLDER)) bump(s.placeholders, m[1]);
      if (s.samples.length < 3 && PLACEHOLDER.test(v)) s.samples.push(v.length > 220 ? `${v.slice(0, 220)}…` : v);
      PLACEHOLDER.lastIndex = 0;
      return;
    }
    default:
      if (s.overflow) {
        s.distinct.add(v);
        return;
      }
      bump(s.counts, v);
      if (s.counts.size > MAX_CATEGORIES) {
        s.overflow = true;
        for (const k of s.counts.keys()) s.distinct.add(k);
      }
  }
}

function bump(map: Map<string, number>, key: string): void {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function timeKey(v: string): string {
  return /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : v;
}

function classify(values: string[]): Kind {
  const filled = values.map((v) => v.trim()).filter(Boolean);
  if (!filled.length) return "category";
  const share = (fn: (v: string) => boolean) => filled.filter(fn).length / filled.length;
  if (share((v) => /^\d{4}-(\d{2}|W\d{2})/.test(v) || /^\d{2}:\d{2}/.test(v)) > 0.8) return "time";
  if (share((v) => v !== "" && Number.isFinite(Number(v))) > 0.9) {
    const distinct = new Set(filled).size;
    const width = filled[0].length;
    const isCode = width >= 3 && filled.every((v) => /^\d+$/.test(v) && v.length === width);
    return distinct <= 12 || isCode ? "category" : "numeric";
  }
  const avgLen = filled.reduce((a, v) => a + v.length, 0) / filled.length;
  if (avgLen > 40 || share((v) => v.split(/\s+/).length >= 5) > 0.5) return "text";
  if (new Set(filled).size / filled.length > 0.6 && filled.length >= 50) return "keys";
  return "category";
}

/*
Turn a task's profiled columns into charts.
*/
function chartsFor(plan: TaskPlan, profiles: Map<string, TableProfile>): ReportChart[] {
  const charts: ReportChart[] = [];
  for (const ref of plan.refs) {
    const prof = profiles.get(ref.table);
    const s = prof?.columns.get(ref.column);
    if (!prof || !s) continue;
    charts.push(columnChart(ref, prof.rows, s));
  }
  for (const ref of plan.refs) {
    const prof = profiles.get(ref.table);
    if (!prof) continue;
    for (const [dim, measure] of prof.pairs) {
      if (measure !== ref.column) continue;
      if (!plan.refs.some((r) => r.table === ref.table && r.column === dim)) continue;
      const g = prof.grouped.get(`${measure}|${dim}`);
      if (!g?.size || prof.columns.get(dim)?.overflow) continue;
      const isTime = prof.columns.get(dim)?.kind === "time";
      const means = [...g.entries()].map(([label, a]) => ({ label, value: a.sum / a.n, n: a.n }));
      const items = isTime
        ? rollTime(means, true)
        : means.sort((a, b) => b.n - a.n).slice(0, TOP_N).map(({ label, value }) => ({ label, value }));
      charts.push({ kind: "grouped", table: ref.table, column: measure, by: dim, byTime: isTime, items });
    }
  }
  return charts;
}

function columnChart(ref: ColumnRef, rows: number, s: ColumnStats): ReportChart {
  const base = { table: ref.table, column: ref.column, rows, blank: s.blank };
  switch (s.kind) {
    case "numeric":
      return { kind: "histogram", ...base, ...histogram(s.numbers) };
    case "time":
      return { kind: "timeline", ...base, items: rollTime([...s.counts.entries()].map(([label, value]) => ({ label, value })), false) };
    case "text":
      return {
        kind: "text",
        ...base,
        avgLength: s.textRows ? s.textLen / s.textRows : 0,
        placeholders: topBars(s.placeholders),
        samples: s.samples,
      };
    case "keys":
      return { kind: "keys", ...base, distinct: s.distinct.size };
    default: {
      if (s.overflow) return { kind: "keys", ...base, distinct: s.distinct.size };
      const sorted = [...s.counts.entries()].sort((a, b) => b[1] - a[1]);
      const items = sorted.slice(0, TOP_N).map(([label, value]) => ({ label, value }));
      const other = sorted.slice(TOP_N).reduce((a, [, v]) => a + v, 0);
      return { kind: "bars", ...base, items, other };
    }
  }
}

function topBars(map: Map<string, number>): ReportBar[] {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, TOP_N)
    .map(([label, value]) => ({ label, value }));
}

/*
Sort time buckets and roll days up to months when there are too many points.
*/
function rollTime(items: ReportBar[], average: boolean): ReportBar[] {
  const sorted = [...items].sort((a, b) => a.label.localeCompare(b.label));
  if (sorted.length <= MAX_TIME_BUCKETS || !sorted.every((i) => /^\d{4}-\d{2}-\d{2}$/.test(i.label))) {
    return sorted.slice(-MAX_TIME_BUCKETS);
  }
  const weeks = rollUp(sorted, weekStart, average);
  return weeks.length <= MAX_TIME_BUCKETS ? weeks : rollUp(sorted, (d) => d.slice(0, 7), average);
}

function rollUp(items: ReportBar[], bucket: (day: string) => string, average: boolean): ReportBar[] {
  const groups = new Map<string, { sum: number; n: number }>();
  for (const i of items) {
    const k = bucket(i.label);
    const cur = groups.get(k) ?? { sum: 0, n: 0 };
    cur.sum += i.value;
    cur.n += 1;
    groups.set(k, cur);
  }
  return [...groups.entries()].map(([label, a]) => ({ label, value: average ? a.sum / a.n : a.sum }));
}

function weekStart(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

function histogram(values: number[]) {
  if (!values.length) return { items: [], min: 0, max: 0, mean: 0, median: 0 };
  const sorted = Float64Array.from(values).sort();
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const mean = values.reduce((a, v) => a + v, 0) / values.length;
  const median = sorted[Math.floor(sorted.length / 2)];
  const hi = sorted[Math.floor(sorted.length * 0.99)] ?? max;
  const width = (hi - min) / HIST_BINS || 1;
  const bins = new Array<number>(HIST_BINS).fill(0);
  for (const v of values) bins[Math.min(HIST_BINS - 1, Math.max(0, Math.floor((v - min) / width)))] += 1;
  const items = bins.map((value, i) => ({ label: fmtNum(min + i * width), value }));
  return { items, min, max, mean, median };
}

function fmtNum(n: number): string {
  return Math.abs(n) >= 100 ? Math.round(n).toString() : n.toFixed(1);
}

async function readHeaders(file: string): Promise<string[]> {
  const stream = fs.createReadStream(file);
  try {
    for await (const rec of stream.pipe(parse({ bom: true, to_line: 1, relax_quotes: true })) as AsyncIterable<string[]>) {
      return rec;
    }
    return [];
  } finally {
    stream.destroy();
  }
}

async function readSample(file: string, columns: string[]): Promise<Array<Record<string, string>>> {
  const stream = fs.createReadStream(file);
  const out: Array<Record<string, string>> = [];
  try {
    const parser = stream.pipe(
      parse({ columns: true, bom: true, relax_quotes: true, relax_column_count: true, to_line: SAMPLE_ROWS + 1 }),
    );
    for await (const row of parser as AsyncIterable<Record<string, string>>) {
      const pick: Record<string, string> = {};
      for (const c of columns) pick[c] = row[c] ?? "";
      out.push(pick);
    }
  } finally {
    stream.destroy();
  }
  return out;
}
