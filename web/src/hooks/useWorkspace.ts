import { useEffect, useState } from "react";
import type { PetOverride } from "@shared/api";
import { api } from "../api/client";
import { useDatasets, useScenarios } from "./useDatasets";
import { useJob } from "./useJob";
import { useResult } from "./useResult";

/** All UI state: selection, scenario, the running job and the latest result. */
export function useWorkspace() {
  const datasets = useDatasets();
  const [dataset, setDataset] = useState<string | null>(null);
  const [table, setTable] = useState<string | null>(null);
  const scenarios = useScenarios(dataset);
  const [scenarioId, setScenarioId] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [protectError, setProtectError] = useState<string | null>(null);
  const { job } = useJob(jobId);
  const [refreshKey, setRefreshKey] = useState(0);
  const result = useResult(dataset, scenarioId, refreshKey);

  useEffect(() => {
    const first = datasets.data?.[0];
    if (first && !dataset) select(first.name, first.tables[0]?.name ?? null);
  }, [datasets.data]);

  useEffect(() => {
    const list = scenarios.data ?? [];
    if (!list.some((s) => s.id === scenarioId)) setScenarioId(list[0]?.id ?? null);
  }, [scenarios.data]);

  useEffect(() => {
    if (job?.status === "done") setRefreshKey((k) => k + 1);
  }, [job?.status]);

  function select(nextDataset: string, nextTable: string | null) {
    setDataset(nextDataset);
    setTable(nextTable);
  }

  async function protect(tables: string[]) {
    if (!dataset || !scenarioId) return;
    setProtectError(null);
    try {
      setJobId((await api.protect({ dataset, scenario: scenarioId, tables })).jobId);
    } catch (e) {
      setProtectError(e instanceof Error ? e.message : String(e));
    }
  }

  async function applyPetOverrides(overrides: PetOverride[]) {
    if (!dataset || !scenarioId) return;
    setProtectError(null);
    const { jobId: id } = await api.patchPetPlan(dataset, scenarioId, overrides, true);
    setRefreshKey((k) => k + 1);
    if (id) setJobId(id);
  }

  async function resetResult() {
    if (!dataset || !scenarioId) return;
    setProtectError(null);
    try {
      await api.resetResult(dataset, scenarioId);
      setJobId(null);
      setRefreshKey((k) => k + 1);
    } catch (e) {
      setProtectError(e instanceof Error ? e.message : String(e));
    }
  }

  const busy = job?.status === "queued" || job?.status === "running";
  const tables = datasets.data?.find((d) => d.name === dataset)?.tables ?? [];
  return {
    datasets,
    dataset,
    table,
    tables,
    select,
    scenarios,
    scenarioId,
    setScenarioId,
    job,
    busy,
    protect,
    applyPetOverrides,
    resetResult,
    protectError,
    result,
    refreshKey,
  };
}

export type Workspace = ReturnType<typeof useWorkspace>;
