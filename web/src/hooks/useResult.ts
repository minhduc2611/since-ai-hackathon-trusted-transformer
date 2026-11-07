import type { ResultInfo } from "@shared/api";
import { ApiRequestError, api } from "../api/client";
import { useAsync } from "./useAsync";

/** Load the protected result for dataset + scenario; refreshKey reloads after a job finishes. */
export function useResult(dataset: string | null, scenario: string | null, refreshKey: number) {
  return useAsync<ResultInfo | null>(
    dataset && scenario
      ? async () => {
          try {
            return await api.result(dataset, scenario);
          } catch (e) {
            if (e instanceof ApiRequestError && e.status === 404) return null;
            throw e;
          }
        }
      : null,
    [dataset, scenario, refreshKey],
  );
}
