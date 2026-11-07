import { useState } from "react";
import type { Workspace } from "../hooks/useWorkspace";
import { DataViewer } from "./DataViewer";
import { PetPlanTable } from "./PetPlanTable";

type Tab = "original" | "protected" | "plan";

/** Original data, protected data and PET plan for the selected table. */
export function MainTabs({ ws }: { ws: Workspace }) {
  const [tab, setTab] = useState<Tab>("original");
  const { dataset, table, scenarioId, result, refreshKey } = ws;
  if (!dataset || !table) return <p className="muted">Select a table.</p>;

  const released = !!result.data?.released.includes(table);
  const active: Tab = tab === "protected" && !released ? "original" : tab;

  return (
    <section className="main">
      <header className="main-head">
        <h1>
          <DatasourceIcon />
          <span>
            {dataset} / <span className="accent">{table}.csv</span>
          </span>
        </h1>
        <div className="tabs" role="tablist" aria-label="Data views">
          <TabButton id="original" active={active} onClick={setTab} label="Original" />
          <TabButton id="protected" active={active} onClick={setTab} label={`Protected (${scenarioId})`} disabled={!released} />
          <TabButton id="plan" active={active} onClick={setTab} label="PET plan" />
        </div>
      </header>
      <div className="tab-panel" role="tabpanel">
        {active === "original" && <DataViewer source={{ kind: "original", dataset, table }} />}
        {active === "protected" && scenarioId && (
          <DataViewer source={{ kind: "protected", dataset, scenario: scenarioId, table }} refreshKey={refreshKey} />
        )}
        {active === "plan" &&
          (result.data ? (
            <PetPlanTable plan={result.data.petPlan} busy={ws.busy} onApply={ws.applyPetOverrides} />
          ) : (
            <p className="muted">Run Protect first to generate a PET plan, then override PETs here.</p>
          ))}
      </div>
    </section>
  );
}

interface TabButtonProps {
  id: Tab;
  active: Tab;
  label: string;
  disabled?: boolean;
  onClick: (tab: Tab) => void;
}

function TabButton({ id, active, label, disabled, onClick }: TabButtonProps) {
  const selected = active === id;
  return (
    <button
      type="button"
      role="tab"
      id={`tab-${id}`}
      aria-selected={selected}
      tabIndex={selected ? 0 : -1}
      className={`tab${selected ? " active" : ""}`}
      disabled={disabled}
      onClick={() => onClick(id)}
    >
      {label}
    </button>
  );
}

function DatasourceIcon() {
  return (
    <svg className="title-icon" viewBox="0 0 16 16" width="18" height="18" aria-hidden>
      <ellipse cx="8" cy="4" rx="5.5" ry="2.2" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <path d="M2.5 4v4c0 1.2 2.5 2.2 5.5 2.2S13.5 9.2 13.5 8V4" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <path d="M2.5 8v4c0 1.2 2.5 2.2 5.5 2.2S13.5 13.2 13.5 12V8" fill="none" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}
