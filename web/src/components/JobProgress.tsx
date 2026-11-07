import type { JobInfo, JobStep } from "@shared/api";

const STEPS: Array<{ id: JobStep; label: string }> = [
  { id: "detect", label: "Detect" },
  { id: "select", label: "Select" },
  { id: "transform", label: "Transform" },
  { id: "demonstrate", label: "Demonstrate" },
];

type StepState = "pending" | "active" | "done" | "failed";

function stepState(job: JobInfo, index: number): StepState {
  if (job.status === "done") return "done";
  const current = job.step ? STEPS.findIndex((s) => s.id === job.step) : -1;
  if (index < current) return "done";
  if (index === current) return job.status === "failed" ? "failed" : "active";
  return "pending";
}

export function JobProgress({ job }: { job: JobInfo }) {
  return (
    <section className="panel">
      <h2>
        Progress <span className={`status ${job.status}`}>{job.status}</span>
      </h2>
      <ol className="steps">
        {STEPS.map((s, i) => (
          <li key={s.id} className={stepState(job, i)}>
            {s.label}
          </li>
        ))}
      </ol>
      {job.error && <p className="error">{job.error}</p>}
      <details>
        <summary>Log ({job.log.length} lines)</summary>
        <pre className="log">{job.log.slice(-40).join("\n")}</pre>
      </details>
    </section>
  );
}
