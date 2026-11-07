import type {
  ApiResponse,
  AuthOrgsResponse,
  AuthSession,
  SsoLoginRequest,
  DatasetInfo,
  JobInfo,
  PaginatedResponse,
  PetOverride,
  ProtectRequest,
  ResultInfo,
  Row,
  ScenarioInfo,
  ScenarioReport,
} from "@shared/api";

export class ApiRequestError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export const UNAUTHORIZED_EVENT = "pets:unauthorized";

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (res.status === 401 && !url.startsWith("/api/auth/")) window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
  const body = (await res.json().catch(() => null)) as { success?: boolean; error?: string } | null;
  if (!res.ok || !body || body.success === false) {
    throw new ApiRequestError(res.status, body?.error || `Request failed (${res.status})`);
  }
  return body as T;
}

async function data<T>(url: string, init?: RequestInit): Promise<T> {
  return (await request<ApiResponse<T>>(url, init)).data;
}

const enc = encodeURIComponent;
const page = (limit: number, offset: number) => `limit=${limit}&offset=${offset}`;

export const api = {
  authOrgs: () => data<AuthOrgsResponse>("/api/auth/orgs"),
  me: () => data<AuthSession>("/api/auth/me"),
  login: (body: SsoLoginRequest) =>
    data<AuthSession>("/api/auth/sso", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  logout: () => data<{ signedOut: true }>("/api/auth/logout", { method: "POST" }),
  datasets: () => data<DatasetInfo[]>("/api/datasets"),
  scenarios: (dataset: string) => data<ScenarioInfo[]>(`/api/scenarios?dataset=${enc(dataset)}`),
  originalRows: (dataset: string, table: string, limit: number, offset: number) =>
    request<PaginatedResponse<Row>>(`/api/datasets/${enc(dataset)}/tables/${enc(table)}/rows?${page(limit, offset)}`),
  protectedRows: (dataset: string, scenario: string, table: string, limit: number, offset: number) =>
    request<PaginatedResponse<Row>>(
      `/api/results/${enc(dataset)}/${enc(scenario)}/tables/${enc(table)}/rows?${page(limit, offset)}`,
    ),
  protect: (body: ProtectRequest) =>
    data<{ jobId: string }>("/api/protect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  job: (id: string) => data<JobInfo>(`/api/jobs/${enc(id)}`),
  result: (dataset: string, scenario: string) => data<ResultInfo>(`/api/results/${enc(dataset)}/${enc(scenario)}`),
  patchPetPlan: (dataset: string, scenario: string, overrides: PetOverride[], apply = true) =>
    data<{ result: ResultInfo; jobId: string | null }>(`/api/results/${enc(dataset)}/${enc(scenario)}/pet-plan`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ overrides, apply }),
    }),
  resetResult: (dataset: string, scenario: string) =>
    data<{ cleared: true }>(`/api/results/${enc(dataset)}/${enc(scenario)}/reset`, { method: "POST" }),
  report: (dataset: string, scenario: string) =>
    data<ScenarioReport>(`/api/results/${enc(dataset)}/${enc(scenario)}/report`),
  scorecardUrl: (dataset: string, scenario: string) => `/api/results/${enc(dataset)}/${enc(scenario)}/scorecard.html`,
};
