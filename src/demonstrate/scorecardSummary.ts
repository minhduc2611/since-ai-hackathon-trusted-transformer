import fs from "node:fs";
import type { ScorecardSummary, TextLeakInsight, TextLeakLabel } from "../shared/api.js";

export type { ScorecardSummary };

interface RawLabel {
  n?: number;
  leaked?: number;
  rate?: number;
}

interface RawFreeTextCol {
  evaluated?: boolean;
  identifying_leakage_rate?: number;
  per_label?: Record<string, RawLabel>;
}

interface RawTable {
  free_text?: Record<string, RawFreeTextCol>;
}

interface RawScorecard {
  summary?: { privacy: number; utility: number; composite: number };
  risk_components?: Record<string, number>;
  utility?: Array<{ id: string; description: string; score: number | null }>;
  scenario?: { id?: string; title?: string; suggested_privacy_targets?: string };
  tables?: Record<string, RawTable>;
}

/*
Read pets-eval scorecard.json into a compact summary, or null if absent.
*/
export function readScorecardSummary(file: string): ScorecardSummary | null {
  if (!fs.existsSync(file)) return null;
  const raw = JSON.parse(fs.readFileSync(file, "utf8")) as RawScorecard;
  if (!raw.summary) return null;
  return {
    privacy: raw.summary.privacy,
    utility: raw.summary.utility,
    composite: raw.summary.composite,
    risks: raw.risk_components ?? {},
    utilityTasks: (raw.utility ?? []).map((u) => ({ id: u.id, description: u.description, score: u.score })),
    scenario: raw.scenario?.id
      ? {
          id: raw.scenario.id,
          title: raw.scenario.title ?? raw.scenario.id,
          suggested_privacy_targets: raw.scenario.suggested_privacy_targets ?? "",
        }
      : undefined,
    textLeaks: extractTextLeaks(raw.tables ?? {}),
  };
}

/*
Pull per-label PII leaks from pets-eval free_text blocks (gold spans still present).
*/
function extractTextLeaks(tables: Record<string, RawTable>): TextLeakInsight[] {
  const out: TextLeakInsight[] = [];
  for (const [table, t] of Object.entries(tables)) {
    for (const [column, col] of Object.entries(t.free_text ?? {})) {
      if (!col?.evaluated) continue;
      const labels = leakedLabels(col.per_label ?? {});
      if (!labels.length && !(col.identifying_leakage_rate && col.identifying_leakage_rate > 0)) continue;
      out.push({
        table,
        column,
        identifyingLeakageRate: col.identifying_leakage_rate ?? 0,
        labels,
      });
    }
  }
  return out;
}

function leakedLabels(per: Record<string, RawLabel>): TextLeakLabel[] {
  return Object.entries(per)
    .map(([label, v]) => ({
      label,
      n: v.n ?? 0,
      leaked: v.leaked ?? 0,
      rate: v.rate ?? 0,
    }))
    .filter((l) => l.leaked > 0)
    .sort((a, b) => b.rate - a.rate || b.leaked - a.leaked);
}
