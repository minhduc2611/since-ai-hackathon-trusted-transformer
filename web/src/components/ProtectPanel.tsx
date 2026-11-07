import type { ScenarioInfo, TableInfo } from "@shared/api";
import { useEffect, useState } from "react";
import { formatBytes } from "../format";
import { InfoTip } from "./InfoTip";

const LARGE_TABLE_BYTES = 40 * 1024 ** 2;

interface Props {
  scenarios: ScenarioInfo[];
  scenarioId: string | null;
  tables: TableInfo[];
  busy: boolean;
  onScenarioChange: (id: string) => void;
  onProtect: (tables: string[]) => void;
}

export function ProtectPanel({ scenarios, scenarioId, tables, busy, onScenarioChange, onProtect }: Props) {
  const scenario = scenarios.find((s) => s.id === scenarioId) ?? null;
  const [selected, setSelected] = useState<string[]>([]);
  useEffect(() => setSelected(scenario?.defaultTables ?? []), [scenario]);

  const toggle = (name: string) =>
    setSelected((cur) => (cur.includes(name) ? cur.filter((t) => t !== name) : [...cur, name]));
  const large = tables.filter((t) => selected.includes(t.name) && t.sizeBytes > LARGE_TABLE_BYTES);

  return (
    <section className="panel">
      <h2>Protect</h2>
      <ScenarioSelect scenarios={scenarios} value={scenarioId} scenario={scenario} onChange={onScenarioChange} />
      <TableChecklist tables={tables} selected={selected} onToggle={toggle} />
      {large.length > 0 && (
        <p className="warning">Large tables ({large.map((t) => t.name).join(", ")}) can take minutes to protect.</p>
      )}
      <button className="primary" disabled={busy || !scenario || !selected.length} onClick={() => onProtect(selected)}>
        {busy ? "Protecting…" : "Protect"}
      </button>
    </section>
  );
}

function ScenarioSelect(props: {
  scenarios: ScenarioInfo[];
  value: string | null;
  scenario: ScenarioInfo | null;
  onChange: (id: string) => void;
}) {
  return (
    <label className="field">
      <span className="field-label">
        Sharing scenario
        {props.scenario && <InfoTip text={scenarioHelp(props.scenario)} />}
      </span>
      <select value={props.value ?? ""} onChange={(e) => props.onChange(e.target.value)}>
        {props.scenarios.map((s) => (
          <option key={s.id} value={s.id}>
            {s.id} — {s.title}
          </option>
        ))}
      </select>
    </label>
  );
}

function scenarioHelp(s: ScenarioInfo): string {
  const lines = [`Recipient: ${s.recipient}`, `Purpose: ${s.purpose}`, `Trust level: ${s.trust_level}`];
  if (s.utility_requirements.length) lines.push(`Utility tasks: ${s.utility_requirements.join(", ")}`);
  if (s.suggested_privacy_targets) lines.push(`Privacy targets: ${s.suggested_privacy_targets}`);
  return lines.join("\n");
}

function TableChecklist(props: { tables: TableInfo[]; selected: string[]; onToggle: (name: string) => void }) {
  return (
    <fieldset className="checklist">
      <legend>Tables to release</legend>
      {props.tables.map((t) => (
        <label key={t.name}>
          <input type="checkbox" checked={props.selected.includes(t.name)} onChange={() => props.onToggle(t.name)} />
          {t.name} <span className="muted">{formatBytes(t.sizeBytes)}</span>
        </label>
      ))}
    </fieldset>
  );
}
