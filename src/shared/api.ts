/**
 * Types shared by the API server and the React web app.
 * Keep this file free of Node imports so the browser bundle can use it.
 */

export interface Pagination {
  total: number;
  limit: number;
  offset: number;
  current_page: number;
  total_pages: number;
  has_next: boolean;
  has_previous: boolean;
}

export interface PaginatedResponse<T> {
  success: true;
  data: T[];
  pagination: Pagination;
}

export interface ApiResponse<T> {
  success: true;
  data: T;
}

export interface ApiError {
  success: false;
  error: string;
}

export type Row = Record<string, string>;

export interface TableInfo {
  name: string;
  columns: string[];
  sizeBytes: number;
}

export interface DatasetInfo {
  name: string;
  tables: TableInfo[];
}

export interface ScenarioInfo {
  id: string;
  dataset: string;
  title: string;
  recipient: string;
  purpose: string;
  trust_level: string;
  utility_requirements: string[];
  suggested_privacy_targets: string;
  defaultTables: string[];
}

export type JobStep = "detect" | "select" | "transform" | "demonstrate";
export type JobStatus = "queued" | "running" | "done" | "failed";

export interface ProtectRequest {
  dataset: string;
  scenario: string;
  tables: string[];
  /** Subset of pipeline steps; omit for a full Detect→Demonstrate run. */
  steps?: JobStep[];
}

export interface PetOverride {
  table: string;
  column: string;
  pet: string;
  level?: string;
}

export interface PetPlanPatchRequest {
  overrides: PetOverride[];
  /** Re-run transform + demonstrate after saving (default true). */
  apply?: boolean;
}

export interface JobInfo {
  id: string;
  request: ProtectRequest;
  status: JobStatus;
  step: JobStep | null;
  log: string[];
  error?: string;
  createdAt: string;
  finishedAt?: string;
}

export interface PetPlanEntry {
  table: string;
  column: string;
  privacy_role: string;
  subtype: string;
  pet: string;
  level?: string;
  reason: string;
  source: string;
  decided_by?: string;
}

export interface TableTransformResult {
  rows: number;
  qis: string[];
  kBelow5Before: number;
  kBelow5After: number;
  cellsSuppressed: number;
}

export interface TextLeakLabel {
  label: string;
  n: number;
  leaked: number;
  rate: number;
}

export interface TextLeakInsight {
  table: string;
  column: string;
  identifyingLeakageRate: number;
  labels: TextLeakLabel[];
}

export interface ScorecardSummary {
  privacy: number;
  utility: number;
  composite: number;
  risks: Record<string, number>;
  utilityTasks: Array<{ id: string; description: string; score: number | null }>;
  scenario?: { id: string; title: string; suggested_privacy_targets: string };
  textLeaks: TextLeakInsight[];
}

export interface OrgInfo {
  id: string;
  name: string;
  idp: string;
  ssoDomain: string;
  allowedCidrs: string[];
}

export interface AuthOrgsResponse {
  orgs: OrgInfo[];
  clientIp: string;
  simulateIp: boolean;
}

export interface SsoLoginRequest {
  orgId: string;
  email: string;
  /** Only honoured when the server runs with IP simulation enabled. */
  simulatedIp?: string;
}

export interface AuthSession {
  email: string;
  orgId: string;
  orgName: string;
  idp: string;
  ip: string;
  expiresAt: string;
}

export interface ReportBar {
  label: string;
  value: number;
}

export type ReportChart =
  | { kind: "bars"; table: string; column: string; rows: number; blank: number; items: ReportBar[]; other: number }
  | { kind: "timeline"; table: string; column: string; rows: number; blank: number; items: ReportBar[] }
  | {
      kind: "histogram";
      table: string;
      column: string;
      rows: number;
      blank: number;
      items: ReportBar[];
      min: number;
      max: number;
      mean: number;
      median: number;
    }
  | {
      kind: "text";
      table: string;
      column: string;
      rows: number;
      blank: number;
      avgLength: number;
      placeholders: ReportBar[];
      samples: string[];
    }
  | { kind: "keys"; table: string; column: string; rows: number; blank: number; distinct: number }
  | { kind: "grouped"; table: string; column: string; by: string; byTime: boolean; items: ReportBar[] };

export interface ReportSection {
  id: string;
  description: string;
  /** Omitted for overview sections that are not a utility task. */
  score?: number | null;
  charts: ReportChart[];
}

export interface ScenarioReport {
  dataset: string;
  scenario: string;
  title: string;
  recipient: string;
  purpose: string;
  trustLevel: string;
  tables: Array<{ name: string; rows: number; columns: number }>;
  privacy: number | null;
  utility: number | null;
  composite: number | null;
  sections: ReportSection[];
}

export interface ResultInfo {
  dataset: string;
  scenario: string;
  released: string[];
  withheld: string[];
  tables: Record<string, TableTransformResult>;
  petPlan: PetPlanEntry[];
  scorecard: ScorecardSummary | null;
  hasScorecardHtml: boolean;
}
