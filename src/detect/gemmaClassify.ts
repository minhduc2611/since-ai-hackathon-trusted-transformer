import { generateJson } from "../lib/ollama.js";
import type { PrivacyRole } from "../types.js";
import type { RuleLabel } from "./rules.js";

const ROLES: PrivacyRole[] = [
  "direct_identifier",
  "quasi_identifier",
  "sensitive_attribute",
  "technical_identifier",
  "free_text",
  "record_key",
  "non_sensitive",
];

interface GemmaOut {
  privacy_role?: string;
  subtype?: string;
  confidence?: number;
}

/*
Ask Gemma to label one uncertain column.
*/
export async function classifyWithGemma(args: {
  dataset: string;
  table: string;
  column: string;
  samples: string[];
}): Promise<RuleLabel> {
  try {
    const out = await generateJson<GemmaOut>(buildPrompt(args));
    return normalizeLabel(out);
  } catch (e) {
    return {
      privacy_role: "non_sensitive",
      subtype: "OTHER",
      confidence: 0.2,
      source: "gemma_error",
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

/*
Build the Gemma classification prompt for one column.
*/
function buildPrompt(args: {
  dataset: string;
  table: string;
  column: string;
  samples: string[];
}): string {
  return [
    "You classify columns for a privacy-enhancing pipeline.",
    `Dataset: ${args.dataset}. Table: ${args.table}. Column: ${args.column}.`,
    `Sample values: ${JSON.stringify(args.samples)}`,
    `Pick privacy_role from: ${ROLES.join(", ")}.`,
    "Pick a short UPPER_SNAKE subtype (e.g. NATIONAL_ID, PERSON_NAME, TIMESTAMP).",
    'Return JSON: {"privacy_role":"...","subtype":"...","confidence":0-1}',
  ].join("\n");
}

/*
Normalize and validate Gemma's JSON classification output.
*/
function normalizeLabel(out: GemmaOut): RuleLabel {
  const role = ROLES.includes(out.privacy_role as PrivacyRole)
    ? (out.privacy_role as PrivacyRole)
    : "non_sensitive";
  return {
    privacy_role: role,
    subtype: String(out.subtype || "OTHER").toUpperCase(),
    confidence: Number.isFinite(out.confidence) ? Number(out.confidence) : 0.6,
    source: "gemma",
  };
}
