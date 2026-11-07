import { useEffect, useState } from "react";
import type { PetOverride, PetPlanEntry } from "@shared/api";

const PETS = [
  "keep",
  "suppress",
  "pseudonym",
  "generalise",
  "redact",
  "aggregate",
  "pseudonym_or_suppress",
  "aggregate_or_generalise",
] as const;

interface Props {
  plan: PetPlanEntry[];
  busy?: boolean;
  onApply: (overrides: PetOverride[]) => Promise<void>;
}

/** Detected data types and the PET chosen for each column; edit PET to mark human overrides. */
export function PetPlanTable({ plan, busy, onApply }: Props) {
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => setDraft({}), [plan]);

  if (!plan.length) return <p className="muted">No PET decisions yet.</p>;

  const dirty: PetOverride[] = [];
  for (const p of plan) {
    const key = `${p.table}.${p.column}`;
    const pet = draft[key];
    if (!pet || pet === p.pet) continue;
    dirty.push({ table: p.table, column: p.column, pet, ...(p.level ? { level: p.level } : {}) });
  }

  async function apply() {
    if (!dirty.length) return;
    setSaving(true);
    setError(null);
    try {
      await onApply(dirty);
      setDraft({});
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="plan-wrap">
      <div className="plan-toolbar">
        <button className="primary plan-apply" disabled={!dirty.length || busy || saving} onClick={() => void apply()}>
          {saving ? "Applying…" : dirty.length ? `Apply ${dirty.length} human override${dirty.length === 1 ? "" : "s"}` : "Apply human overrides"}
        </button>
      </div>
      {error && <p className="error">{error}</p>}
      <div className="table-scroll">
        <table className="data plan">
          <thead>
            <tr>
              <th>Table</th>
              <th>Column</th>
              <th>Detected role</th>
              <th>Subtype</th>
              <th>Detected by</th>
              <th>Decided by</th>
              <th>PET</th>
              <th>Reason</th>
            </tr>
          </thead>
          <tbody>
            {plan.map((p) => {
              const key = `${p.table}.${p.column}`;
              const value = draft[key] ?? p.pet;
              const changed = value !== p.pet;
              return (
                <tr key={key} className={changed ? "dirty" : p.decided_by === "human" ? "human" : ""}>
                  <td>{p.table}</td>
                  <td>
                    <code>{p.column}</code>
                  </td>
                  <td>{p.privacy_role}</td>
                  <td>{p.subtype}</td>
                  <td>{p.source}</td>
                  <td>{changed ? "human (draft)" : (p.decided_by ?? "rules")}</td>
                  <td>
                    <select
                      className={`pet-select pet pet-${value}`}
                      value={value}
                      disabled={busy || saving}
                      onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
                    >
                      {PETS.map((pet) => (
                        <option key={pet} value={pet}>
                          {pet}
                        </option>
                      ))}
                    </select>
                    {p.level && <span className="muted"> ({p.level})</span>}
                  </td>
                  <td className="reason">{changed ? `human override → ${value}` : p.reason}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
