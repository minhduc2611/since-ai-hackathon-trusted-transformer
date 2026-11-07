import type { PetDecision } from "../types.js";

/*
Tighten rule-based decisions using the columns the scenario's utility tasks read.
*/
export function minimiseForTasks(decisions: PetDecision[], needed: Map<string, string>): PetDecision[] {
  return decisions.map((d) => minimiseOne(d, needed.get(`${d.table}.${d.column}`)));
}

/*
Suppress an unused identifying column, or pick the coarsest level a task still accepts.
*/
function minimiseOne(d: PetDecision, hint: string | undefined): PetDecision {
  if (!isMinimisable(d)) return d;
  if (hint === undefined) {
    return { ...d, pet: "suppress", level: undefined, decided_by: "tasks", reason: "not read by any utility task (data minimisation)" };
  }
  if (d.pet !== "generalise") return d;
  const level = levelFor(d.subtype, hint);
  if (!level) return d;
  return { ...d, level, decided_by: "tasks", reason: `read by a utility task; coarsened to ${level}` };
}

/*
Quasi-identifiers and non-key technical identifiers can be dropped when unused.
*/
function isMinimisable(d: PetDecision): boolean {
  if (d.privacy_role === "quasi_identifier") return true;
  return d.privacy_role === "technical_identifier" && d.subtype !== "RECORD_ID";
}

/*
Coarser timestamp level when a task's hint says it only needs time of day or week.
*/
function levelFor(subtype: string, hint: string): string | undefined {
  if (subtype !== "TIMESTAMP" && subtype !== "DATE") return undefined;
  if (/time of day|hour/i.test(hint)) return "time_of_day";
  if (/week/i.test(hint)) return "iso_week";
  return undefined;
}
