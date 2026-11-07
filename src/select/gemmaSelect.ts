import crypto from "node:crypto";
import fs from "node:fs";
import { generateJson } from "../lib/ollama.js";
import { readJson, writeJson } from "../lib/fsutil.js";
import type { ScenarioMeta } from "../lib/scenarios.js";
import type { FieldLabel, TrustLevel } from "../types.js";
import type { PetOptions, Proposal } from "./guardrails.js";
import { tasksNeeding, type UtilityTaskInfo } from "./scenarioTasks.js";

export interface SelectContext {
  scenario: ScenarioMeta | null;
  scenarioId: string;
  trust: TrustLevel;
  tasks: UtilityTaskInfo[];
  cacheFile: string;
}

export interface ColumnAsk {
  label: FieldLabel;
  options: PetOptions;
}

const PROMPT_VERSION = "v2";

/*
Ask Gemma to choose a PET for each open column of one table.
*/
export async function proposeForTable(table: string, asks: ColumnAsk[], ctx: SelectContext): Promise<Map<string, Proposal>> {
  const prompt = buildPrompt(table, asks, ctx);
  const raw = await cachedAsk(prompt, ctx.cacheFile, 120 + asks.length * 70);
  const out = new Map<string, Proposal>();
  for (const p of raw.columns ?? []) {
    if (p && typeof p.column === "string") out.set(p.column, p);
  }
  return out;
}

/*
Return a cached Gemma answer for this exact prompt, or ask and cache it.
*/
async function cachedAsk(prompt: string, cacheFile: string, maxTokens: number): Promise<{ columns?: Array<Proposal & { column?: string }> }> {
  const key = crypto.createHash("sha1").update(`${PROMPT_VERSION}\n${prompt}`).digest("hex");
  const cache = fs.existsSync(cacheFile) ? readJson<Record<string, unknown>>(cacheFile) : {};
  if (cache[key]) return cache[key] as { columns?: Array<Proposal & { column?: string }> };
  const answer = await generateJson<{ columns?: Array<Proposal & { column?: string }> }>(prompt, maxTokens);
  writeJson(cacheFile, { ...cache, [key]: answer });
  return answer;
}

/*
Build the per-table PET selection prompt with scenario, tasks and allowed options.
*/
function buildPrompt(table: string, asks: ColumnAsk[], ctx: SelectContext): string {
  return [
    "You choose privacy-enhancing techniques (PETs) for one table of a data release.",
    ...scenarioLines(ctx),
    "Utility tasks the recipient must still be able to do:",
    ...taskLines(ctx.tasks),
    "Principles: data minimisation. Suppress quasi-identifiers that no task needs.",
    "Keep what tasks need at the coarsest level that still answers them; prefer generalise over suppress for needed quasi-identifiers.",
    "Combinations of quasi-identifiers (dates, places, demographics) single people out, so release as few as possible.",
    `Table: ${table}`,
    "Columns (pick exactly one listed option per column):",
    ...asks.map((a) => columnLine(table, a, ctx.tasks)),
    'Return JSON: {"columns":[{"column":"name","pet":"one option","level":"a listed level or empty","reason":"max 15 words"}]}',
  ].join("\n");
}

/*
Describe the sharing scenario for the prompt.
*/
function scenarioLines(ctx: SelectContext): string[] {
  const s = ctx.scenario;
  if (!s) return [`Scenario: ${ctx.scenarioId}, trust level ${ctx.trust}, generic controlled research.`];
  return [
    `Scenario: ${s.id} — ${s.title ?? ""}`,
    `Recipient: ${s.recipient ?? ""}`,
    `Purpose: ${s.purpose ?? ""}`,
    `Trust level: ${ctx.trust}`,
    `Threat model: ${s.threat_model ?? ""}`,
    `Privacy targets: ${s.suggested_privacy_targets ?? ""}`,
    `Notes: ${s.notes ?? ""}`,
  ];
}

/*
List utility tasks with the columns they read.
*/
function taskLines(tasks: UtilityTaskInfo[]): string[] {
  if (!tasks.length) return ["- none listed; keep general analytical value"];
  return tasks.map((t) => `- ${t.id}: ${t.description} Uses: ${t.needs.join(", ") || "n/a"}`);
}

/*
Describe one column, which tasks need it and its allowed options.
*/
function columnLine(table: string, ask: ColumnAsk, tasks: UtilityTaskInfo[]): string {
  const { label, options } = ask;
  const needed = tasksNeeding(tasks, label.column, label.subtype);
  const opts = options.pets.map((p) => (p === "generalise" ? `generalise(level: ${options.levels.join("|")})` : p));
  return `- ${label.column} | ${label.privacy_role}/${label.subtype} | needed by: ${needed.join(", ") || "no task"} | options: ${opts.join(", ")}`;
}
