import { useState } from "react";
import type { AuthSession } from "@shared/api";
import { DatasetSidebar } from "./components/DatasetSidebar";
import { HeaderMenu } from "./components/HeaderMenu";
import { JobProgress } from "./components/JobProgress";
import { MainTabs } from "./components/MainTabs";
import { ProtectPanel } from "./components/ProtectPanel";
import { ResultSummary } from "./components/ResultSummary";
import { TryKeyPage } from "./components/TryKeyPage";
import { useWorkspace, type Workspace } from "./hooks/useWorkspace";

export function App({ session, onLogout }: { session: AuthSession; onLogout: () => void }) {
  const ws = useWorkspace();
  /** null = workspace; a string (possibly empty) = try page prefilled with that key. */
  const [tryKey, setTryKey] = useState<string | null>(null);
  if (ws.datasets.error) return <p className="error page">API unavailable: {ws.datasets.error}</p>;
  if (!ws.datasets.data) return <p className="muted page">Loading datasets…</p>;

  return (
    <div className={tryKey !== null ? "layout try-mode" : "layout"}>
      <header className="topbar">
        <strong>TrustED PETs Transformer</strong>
        <HeaderMenu session={session} onLogout={onLogout} onTryKey={(token) => setTryKey(token ?? "")} />
      </header>
      {tryKey !== null ? (
        <TryKeyPage key={tryKey} initialKey={tryKey} onBack={() => setTryKey(null)} />
      ) : (
        <>
          <DatasetSidebar datasets={ws.datasets.data} dataset={ws.dataset} table={ws.table} onSelect={ws.select} />
          <MainTabs ws={ws} />
          <SidePanel ws={ws} />
        </>
      )}
    </div>
  );
}

function SidePanel({ ws }: { ws: Workspace }) {
  return (
    <aside className="side">
      <ProtectPanel
        scenarios={ws.scenarios.data ?? []}
        scenarioId={ws.scenarioId}
        tables={ws.tables}
        busy={ws.busy}
        onScenarioChange={ws.setScenarioId}
        onProtect={ws.protect}
      />
      {ws.protectError && <p className="error">{ws.protectError}</p>}
      {ws.job && <JobProgress job={ws.job} />}
      {ws.result.data && <ResultSummary result={ws.result.data} busy={ws.busy} onReset={() => void ws.resetResult()} />}
      {!ws.result.data && !ws.result.loading && (
        <p className="muted small panel">No protected release for this scenario yet. Click Protect to generate one.</p>
      )}
    </aside>
  );
}
