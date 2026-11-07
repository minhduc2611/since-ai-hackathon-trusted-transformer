export type PrivacyRole =
  | "direct_identifier"
  | "quasi_identifier"
  | "sensitive_attribute"
  | "technical_identifier"
  | "free_text"
  | "record_key"
  | "non_sensitive";

export type TrustLevel = "public" | "controlled_research" | "contractual";

export type PetAction =
  | "suppress"
  | "pseudonym"
  | "pseudonym_or_suppress"
  | "generalise"
  | "redact"
  | "aggregate"
  | "aggregate_or_generalise"
  | "keep";

export interface FieldLabel {
  dataset: string;
  table: string;
  column: string;
  privacy_role: PrivacyRole;
  subtype: string;
  confidence: number;
  source: string;
  error?: string;
}

export interface PetDecision extends FieldLabel {
  scenario: string;
  trust_level: TrustLevel;
  pet: PetAction;
  /** Generalisation level, e.g. "time_of_day", "iso_week", "date". */
  level?: string;
  reason: string;
  decided_by?: "rules" | "tasks" | "gemma" | "human";
}

export type PipelineStep = "detect" | "select" | "transform" | "demonstrate";

export const PIPELINE_STEPS: PipelineStep[] = ["detect", "select", "transform", "demonstrate"];

export interface PipelineOptions {
  dataset: string;
  scenario: string;
  /** Tables to release; empty or missing means the scenario default. */
  tables?: string[];
  onProgress?: (step: PipelineStep, message: string) => void;
}

export interface Config {
  model: string;
  ollamaUrl: string;
  dataset: string;
  scenario: string;
  packageRoot: string;
  dataDir: string;
  outDir: string;
  secret: string;
  gemmaSampleSize: number;
  gemmaMaxColumns: number;
  gemmaSelect: boolean;
}
