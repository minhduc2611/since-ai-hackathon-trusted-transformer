import { spawnSync } from "node:child_process";
import path from "node:path";
import { config } from "../config.js";
import { findScenario } from "../lib/scenarios.js";
import type { FieldLabel } from "../types.js";

export interface UtilityTaskInfo {
  id: string;
  table: string;
  description: string;
  /** Columns the task reads, as "table.column". */
  needs: string[];
}

const DUMP_TASKS = `
import json, sys
from pets_eval.utility import all_tasks
print(json.dumps([{"id": t.id, "table": t.table, "description": t.description,
  "needs": [n if "." in n else t.table + "." + n for n in t.needs]} for t in all_tasks([sys.argv[1]])]))
`;

/*
List the utility tasks a scenario requires, with the columns each one reads.
*/
export function loadScenarioTasks(dataset: string, scenarioId: string): UtilityTaskInfo[] {
  const required = findScenario(scenarioId)?.utility_requirements ?? [];
  if (!required.length) return [];
  const toolkit = path.join(config.packageRoot, "toolkit");
  const res = spawnSync("python3", ["-c", DUMP_TASKS, dataset], {
    env: { ...process.env, PYTHONPATH: toolkit },
    encoding: "utf8",
  });
  if (res.status !== 0) return [];
  const all = JSON.parse(res.stdout) as UtilityTaskInfo[];
  return all.filter((t) => required.includes(t.id));
}

/*
Ids of the tasks that read a given column (birth dates count as "age").
*/
export function tasksNeeding(tasks: UtilityTaskInfo[], column: string, subtype: string): string[] {
  return tasks
    .filter((t) => neededColumns(t).some((c) => c === column || (c === "age" && subtype === "BIRTH_DATE")))
    .map((t) => t.id);
}

/*
Map each "table.column" the tasks read to its granularity hint ("" if none).
For alternatives like "a|b+c", only the first one whose columns all exist counts.
*/
export function neededFields(tasks: UtilityTaskInfo[], labels: FieldLabel[]): Map<string, string> {
  const fields = fieldIndex(labels);
  const needed = new Map<string, string>();
  for (const task of tasks) {
    for (const need of task.needs) {
      const options = need.split("|").map((alt) => parseAlternative(alt, task.table));
      const chosen = options.find((parts) => parts.every((p) => fields.has(p.field))) ?? [];
      for (const p of chosen) {
        const field = fields.get(p.field) as string;
        needed.set(field, [needed.get(field), p.hint].filter(Boolean).join("; "));
      }
    }
  }
  return needed;
}

/*
Resolve "table.column" names to real fields; "table.age" falls back to the birth-date column.
*/
function fieldIndex(labels: FieldLabel[]): Map<string, string> {
  const index = new Map<string, string>();
  for (const l of labels) {
    index.set(`${l.table}.${l.column}`, `${l.table}.${l.column}`);
    if (l.subtype === "BIRTH_DATE" && !index.has(`${l.table}.age`)) index.set(`${l.table}.age`, `${l.table}.${l.column}`);
  }
  return index;
}

/*
Split one alternative like "t.a+b (time of day)" into fields with optional hints.
*/
function parseAlternative(alt: string, defaultTable: string): Array<{ field: string; hint: string }> {
  return alt.split(/[+,]/).map((part) => {
    const hint = part.match(/\((.*?)\)/)?.[1] ?? "";
    const ref = part.replace(/\(.*?\)/g, "").trim();
    const field = ref.includes(".") ? ref : `${defaultTable}.${ref}`;
    return { field, hint };
  });
}

/*
Column names a task reads, from needs like "t.a|t.b", "t.a+t.b" or "t.ts (time of day)".
*/
function neededColumns(task: UtilityTaskInfo): string[] {
  return task.needs.flatMap((n) =>
    n
      .replace(/\(.*?\)/g, "")
      .split(/[|+,]/)
      .map((part) => part.trim().split(".").pop() ?? "")
      .filter(Boolean),
  );
}
