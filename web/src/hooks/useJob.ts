import type { JobInfo } from "@shared/api";
import { useEffect, useState } from "react";
import { api } from "../api/client";

const POLL_MS = 1500;

/** Poll a protect job until it is done or failed. */
export function useJob(jobId: string | null): { job: JobInfo | null; error: string | null } {
  const [job, setJob] = useState<JobInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setJob(null);
    setError(null);
    if (!jobId) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;
    const tick = async () => {
      try {
        const next = await api.job(jobId);
        if (stopped) return;
        setJob(next);
        if (next.status === "queued" || next.status === "running") timer = setTimeout(tick, POLL_MS);
      } catch (e) {
        if (!stopped) setError(e instanceof Error ? e.message : String(e));
      }
    };
    void tick();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [jobId]);

  return { job, error };
}
