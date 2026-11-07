import { api } from "../api/client";
import { useAsync } from "./useAsync";

export function useDatasets() {
  return useAsync(() => api.datasets(), []);
}

export function useScenarios(dataset: string | null) {
  return useAsync(dataset ? () => api.scenarios(dataset) : null, [dataset]);
}
