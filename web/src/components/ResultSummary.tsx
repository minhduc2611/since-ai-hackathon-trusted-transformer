import { useState } from "react";
import type { ResultInfo, ScorecardSummary, TextLeakInsight } from "@shared/api";
import { api } from "../api/client";
import { formatInt, formatPct } from "../format";
import { InfoTip } from "./InfoTip";
import { ReportModal } from "./ReportModal";

const RISK_HELP: Record<string, string> = {
  "direct identifiers retained": "Share of catalogued direct-identifier values that still appear verbatim in the release.",
  "hashed ids reversible": "Share of hashed IDs recovered by unsalted MD5/SHA-1/SHA-256 of candidate values.",
  "records with k<5": "Share of rows in equivalence classes smaller than 5 on the catalogued quasi-identifiers you kept.",
  "linkage re-identification": "Worst re-identification or attribute-inference rate from attacks in metadata/attack_specs.json.",
  "free-text identifier leakage": "Share of gold PII spans (metadata/pii_spans) whose exact value still appears in protected free text.",
  "trajectory unicity": "Share of subjects singled out by a few known (place, hour) points on trajectory tables.",
  "synthetic: DCR / membership inference": "Copied rows from the original, and membership-attack advantage over a coin flip.",
};

const LABEL_HELP: Record<string, string> = {
  PERSON: "Person names still present in text.",
  NATIONAL_ID: "National ID / HETU values still present.",
  PHONE: "Phone numbers still present.",
  EMAIL: "Email addresses still present.",
  ADDRESS: "Street addresses still present.",
  LOCATION: "Location phrases still present.",
  IBAN: "Bank account (IBAN) values still present.",
  PAYMENT_CARD: "Card numbers still present.",
  ACCOUNT_NUMBER: "Account numbers still present.",
  HEALTH: "Health-related mentions still present (Art. 9 special category).",
  SECRET: "Secrets / passwords / tokens still present.",
  ORG: "Organisation names still present.",
  DATE: "Date expressions still present.",
  LICENSE_PLATE: "Vehicle plates still present.",
  IP_ADDRESS: "IP addresses still present.",
  DEVICE_ID: "Device identifiers still present.",
  USERNAME: "Usernames still present.",
  URL: "URLs still present.",
  PROPERTY_ID: "Property / cadastral IDs still present.",
};

export function ResultSummary({
  result,
  busy,
  onReset,
}: {
  result: ResultInfo;
  busy?: boolean;
  onReset?: () => void;
}) {
  const [more, setMore] = useState(false);
  const [sending, setSending] = useState(false);
  const sc = result.scorecard;
  return (
    <section className="panel">
      <h2>Result</h2>
      {sc?.scenario && (
        <p className="scenario-result">
          <strong>{sc.scenario.id}</strong> — {sc.scenario.title}
        </p>
      )}
      {sc ? <ScoreCards scorecard={sc} /> : <p className="muted">No scorecard yet.</p>}
      {sc && (
        <button type="button" className="primary send-data" disabled={busy} onClick={() => setSending(true)}>
          Send protected data
        </button>
      )}
      {sending && <ReportModal dataset={result.dataset} scenario={result.scenario} onClose={() => setSending(false)} />}
      <button type="button" className="secondary show-more" onClick={() => setMore((v) => !v)}>
        {more ? "Show less" : "Show more"}
      </button>
      {more && (
        <div className="result-more">
          {sc?.scenario?.suggested_privacy_targets && (
            <>
              <h3>
                Scenario privacy targets{" "}
                <InfoTip text="What this sharing scenario asks you to achieve for privacy (from scenarios.json)." />
              </h3>
              <p className="muted small">{sc.scenario.suggested_privacy_targets}</p>
            </>
          )}
          <KAnonymityList result={result} />
          {sc && <RiskList risks={sc.risks} />}
          {sc && sc.textLeaks.length > 0 && <TextLeakList leaks={sc.textLeaks} />}
          {sc && <UtilityList scorecard={sc} />}
          {result.hasScorecardHtml && (
            <a href={api.scorecardUrl(result.dataset, result.scenario)} target="_blank" rel="noreferrer">
              Open full scorecard ↗
            </a>
          )}
          <p className="muted small">Self-assessment with pets-eval, not the official judging score.</p>
          {onReset && (
            <button type="button" className="secondary reset" disabled={busy} onClick={onReset}>
              Reset
            </button>
          )}
        </div>
      )}
    </section>
  );
}

function scoreTone(value: number): "good" | "fair" | "mid" | "poor" {
  if (value >= 0.7) return "good";
  if (value >= 0.5) return "fair";
  if (value >= 0.3) return "mid";
  return "poor";
}

function ScoreCards({ scorecard }: { scorecard: ScorecardSummary }) {
  const cards = [
    ["Privacy", scorecard.privacy],
    ["Utility", scorecard.utility],
    ["Composite", scorecard.composite],
  ] as const;
  return (
    <div className="scores">
      {cards.map(([label, value]) => (
        <div key={label} className="score">
          <span className={`value ${scoreTone(value)}`}>{formatPct(value)}</span>
          <span className="label">{label}</span>
        </div>
      ))}
    </div>
  );
}

function KAnonymityList({ result }: { result: ResultInfo }) {
  return (
    <>
      <h3>
        Released tables{" "}
        <InfoTip text="Your transform’s k-anonymity on columns labeled quasi_identifier. Differs from the scorecard’s catalog-QI k<5 risk." />
      </h3>
      <ul className="compact">
        {Object.entries(result.tables).map(([name, t]) => (
          <li key={name}>
            <strong>{name}</strong>: {formatInt(t.rows)} rows, k&lt;5 {formatPct(t.kBelow5Before)} → {formatPct(t.kBelow5After)}
            {t.cellsSuppressed > 0 && <span className="muted"> ({formatInt(t.cellsSuppressed)} cells suppressed)</span>}
          </li>
        ))}
      </ul>
      {result.withheld.length > 0 && <p className="muted small">Withheld: {result.withheld.join(", ")}</p>}
    </>
  );
}

function RiskList({ risks }: { risks: Record<string, number> }) {
  const byTable = groupRisks(risks);
  return (
    <>
      <h3>
        Residual risks <InfoTip text="pets-eval privacy risk components (0 = none, 1 = maximal). Privacy score weights the worst risk heavily." />
      </h3>
      {byTable.map(([table, items]) => (
        <div key={table} className="risk-group">
          <h4>{table}</h4>
          <ul className="compact">
            {items.map(([name, value]) => (
              <li key={name} className={value > 0.05 ? "bad" : value > 0 ? "warn" : ""}>
                {formatPct(value)} — {name}{" "}
                {RISK_HELP[name] && <InfoTip text={RISK_HELP[name]} />}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </>
  );
}

function groupRisks(risks: Record<string, number>): Array<[string, Array<[string, number]>]> {
  const map = new Map<string, Array<[string, number]>>();
  for (const [key, value] of Object.entries(risks)) {
    const i = key.indexOf(": ");
    const table = i >= 0 ? key.slice(0, i) : "other";
    const name = i >= 0 ? key.slice(i + 2) : key;
    const list = map.get(table) ?? [];
    list.push([name, value]);
    map.set(table, list);
  }
  return [...map.entries()];
}

function TextLeakList({ leaks }: { leaks: TextLeakInsight[] }) {
  return (
    <>
      <h3>
        Free-text leaks{" "}
        <InfoTip text="Breakdown of free-text identifier leakage: gold spans in metadata/pii_spans that still occur verbatim in protected text. Fix by improving redact / suppress on these columns." />
      </h3>
      {leaks.map((leak) => (
        <div key={`${leak.table}.${leak.column}`} className="risk-group">
          <h4>
            {leak.table}.{leak.column}{" "}
            <span className={leak.identifyingLeakageRate > 0.05 ? "bad" : "warn"}>
              {formatPct(leak.identifyingLeakageRate)} identifying
            </span>{" "}
            <InfoTip
              text={`${leak.table}.${leak.column}: ${formatPct(leak.identifyingLeakageRate)} of identifying PII span values still appear after protection.`}
            />
          </h4>
          {leak.labels.length === 0 ? (
            <p className="muted small">No per-label breakdown.</p>
          ) : (
            <ul className="compact">
              {leak.labels.map((l) => (
                <li key={l.label} className={l.rate > 0.05 ? "bad" : "warn"}>
                  <strong>{l.label}</strong>: {formatInt(l.leaked)}/{formatInt(l.n)} spans ({formatPct(l.rate)}){" "}
                  <InfoTip
                    text={
                      LABEL_HELP[l.label]
                        ? `${LABEL_HELP[l.label]} ${formatInt(l.leaked)} of ${formatInt(l.n)} gold spans leaked (${formatPct(l.rate)}).`
                        : `${l.label}: ${formatInt(l.leaked)} of ${formatInt(l.n)} gold spans still present (${formatPct(l.rate)}).`
                    }
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </>
  );
}

function UtilityList({ scorecard }: { scorecard: ScorecardSummary }) {
  if (!scorecard.utilityTasks.length) return null;
  return (
    <>
      <h3>
        Utility tasks <InfoTip text="Only tasks required by this scenario. n/a means a needed column was removed or coarsened away." />
      </h3>
      <ul className="compact">
        {scorecard.utilityTasks.map((u) => (
          <li key={u.id}>
            <strong>{u.id}</strong> {u.score == null ? "n/a" : formatPct(u.score)}{" "}
            <span className="muted">{u.description}</span> <InfoTip text={u.description} />
          </li>
        ))}
      </ul>
    </>
  );
}
