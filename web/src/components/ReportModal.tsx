import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { ReportBar, ReportChart, ScenarioReport } from "@shared/api";
import { api } from "../api/client";
import { formatInt, formatPct } from "../format";

export function ReportModal({ dataset, scenario, onClose }: { dataset: string; scenario: string; onClose: () => void }) {
  const [report, setReport] = useState<ScenarioReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    let live = true;
    api
      .report(dataset, scenario)
      .then((r) => live && setReport(r))
      .catch((e: unknown) => live && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      live = false;
    };
  }, [dataset, scenario]);

  const close = () => {
    setClosing(true);
    window.setTimeout(onClose, 280);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return createPortal(
    <div className={`report-backdrop${closing ? " closing" : ""}`}>
      <div className="report-modal" role="dialog" aria-modal="true">
        <header className="report-head">
          <div>
            <p className="report-kicker">
              Protected data delivered{report ? ` to ${report.recipient}` : ""}
            </p>
            <h2>{report ? `${report.scenario} — ${report.title}` : scenario}</h2>
            {report?.purpose && <p className="muted">{report.purpose}</p>}
          </div>
          <button type="button" className="secondary" onClick={close}>
            Close
          </button>
        </header>
        <div className="report-body">
          {error && <p className="error">{error}</p>}
          {!report && !error && <p className="muted">Building report from protected data…</p>}
          {report && <ReportContent report={report} />}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function ReportContent({ report }: { report: ScenarioReport }) {
  const kpis: Array<[string, string]> = [
    ["Privacy", report.privacy == null ? "n/a" : formatPct(report.privacy)],
    ["Utility", report.utility == null ? "n/a" : formatPct(report.utility)],
    ["Composite", report.composite == null ? "n/a" : formatPct(report.composite)],
    ["Trust level", report.trustLevel || "—"],
  ];
  return (
    <>
      <div className="report-kpis">
        {kpis.map(([label, value]) => (
          <div key={label} className="report-kpi">
            <span className="value">{value}</span>
            <span className="label">{label}</span>
          </div>
        ))}
        {report.tables.map((t) => (
          <div key={t.name} className="report-kpi">
            <span className="value">{formatInt(t.rows)}</span>
            <span className="label">
              {t.name} rows · {t.columns} cols
            </span>
          </div>
        ))}
      </div>
      {report.sections.map((sec) => (
        <section key={sec.id} className="report-section">
          <h3>
            <span className="report-task">{sec.id}</span> {sec.description}
            {sec.score !== undefined && (
              <span className="report-score">
                {sec.score === null ? "task not possible" : `${formatPct(sec.score)} utility preserved`}
              </span>
            )}
          </h3>
          {sec.charts.length === 0 ? (
            <p className="muted small">The columns this task needs were not released.</p>
          ) : (
            <div className="report-grid">
              {sec.charts.map((c, i) => (
                <ChartCard key={`${c.kind}-${c.table}-${c.column}-${i}`} chart={c} />
              ))}
            </div>
          )}
        </section>
      ))}
    </>
  );
}

function ChartCard({ chart }: { chart: ReportChart }) {
  const title =
    chart.kind === "grouped"
      ? `Average ${chart.column} by ${chart.by}`
      : chart.kind === "timeline"
        ? `${chart.column} over time`
        : chart.kind === "histogram"
          ? `${chart.column} distribution`
          : chart.kind === "text"
            ? `${chart.column} (redacted text)`
            : chart.column;
  const blank = "blank" in chart && chart.rows > 0 ? chart.blank / chart.rows : 0;
  return (
    <div className="report-card">
      <h4>
        {title} <span className="muted small">{chart.table}</span>
      </h4>
      <ChartBody chart={chart} />
      {blank > 0 && <p className="muted small">{formatPct(blank)} blank (suppressed or missing)</p>}
    </div>
  );
}

function ChartBody({ chart }: { chart: ReportChart }) {
  switch (chart.kind) {
    case "bars":
      return (
        <>
          <HBars items={chart.items} />
          {chart.other > 0 && <p className="muted small">+ {formatInt(chart.other)} rows in other values</p>}
        </>
      );
    case "grouped":
      return chart.byTime ? <LineChart items={chart.items} /> : <HBars items={chart.items} decimals />;
    case "timeline":
      return <LineChart items={chart.items} />;
    case "histogram":
      return (
        <>
          <Columns items={chart.items} />
          <p className="muted small">
            min {num(chart.min)} · median {num(chart.median)} · mean {num(chart.mean)} · max {num(chart.max)}
          </p>
        </>
      );
    case "text":
      return (
        <>
          <p className="small">
            {formatInt(chart.rows - chart.blank)} texts, avg {Math.round(chart.avgLength)} chars
          </p>
          {chart.placeholders.length > 0 ? (
            <HBars items={chart.placeholders} />
          ) : (
            <p className="muted small">No redaction placeholders found.</p>
          )}
          {chart.samples.map((s, i) => (
            <blockquote key={i} className="report-sample">
              {s}
            </blockquote>
          ))}
        </>
      );
    case "keys":
      return (
        <p className="report-keys">
          <span className="value">{formatInt(chart.distinct)}</span> distinct pseudonymous keys — still linkable across
          tables, not reversible.
        </p>
      );
  }
}

function HBars({ items, decimals }: { items: ReportBar[]; decimals?: boolean }) {
  const max = Math.max(1e-9, ...items.map((i) => i.value));
  return (
    <ul className="hbars">
      {items.map((i) => (
        <li key={i.label}>
          <span className="hbar-label" title={i.label}>
            {i.label}
          </span>
          <span className="hbar-track">
            <span className="hbar-fill" style={{ width: `${(i.value / max) * 100}%` }} />
          </span>
          <span className="hbar-value">{decimals ? num(i.value) : formatInt(i.value)}</span>
        </li>
      ))}
    </ul>
  );
}

function Columns({ items }: { items: ReportBar[] }) {
  const max = Math.max(1e-9, ...items.map((i) => i.value));
  return (
    <div className="vbars">
      <div className="vbars-plot">
        {items.map((i) => (
          <span
            key={i.label}
            className="vbar"
            style={{ height: `${(i.value / max) * 100}%` }}
            title={`${i.label}: ${num(i.value)}`}
          />
        ))}
      </div>
      {items.length > 0 && (
        <div className="vbars-axis muted small">
          <span>{items[0].label}</span>
          <span>{items[items.length - 1].label}</span>
        </div>
      )}
    </div>
  );
}

const LINE_W = 300;
const LINE_H = 110;

function LineChart({ items }: { items: ReportBar[] }) {
  const [hover, setHover] = useState<number | null>(null);
  if (items.length === 0) return <p className="muted small">No values.</p>;
  const max = Math.max(1e-9, ...items.map((i) => i.value));
  const min = Math.min(0, ...items.map((i) => i.value));
  const x = (i: number) => (items.length === 1 ? LINE_W / 2 : (i / (items.length - 1)) * LINE_W);
  const y = (v: number) => LINE_H - ((v - min) / (max - min || 1)) * (LINE_H - 8) - 4;
  const points = items.map((it, i) => `${x(i)},${y(it.value)}`).join(" ");
  const area = `0,${LINE_H} ${points} ${LINE_W},${LINE_H}`;
  const active = hover == null ? null : items[hover];
  return (
    <div className="line-chart">
      <div className="line-meta muted small">
        <span>max {num(max)}</span>
        <span>{active ? `${active.label}: ${num(active.value)}` : ""}</span>
      </div>
      <svg
        viewBox={`0 0 ${LINE_W} ${LINE_H}`}
        preserveAspectRatio="none"
        onMouseMove={(e) => {
          const box = e.currentTarget.getBoundingClientRect();
          const ratio = (e.clientX - box.left) / box.width;
          setHover(Math.round(ratio * (items.length - 1)));
        }}
        onMouseLeave={() => setHover(null)}
      >
        <polygon className="line-area" points={area} />
        <polyline className="line-path" points={points} vectorEffect="non-scaling-stroke" />
        {hover != null && (
          <line className="line-cursor" x1={x(hover)} x2={x(hover)} y1={0} y2={LINE_H} vectorEffect="non-scaling-stroke" />
        )}
      </svg>
      <div className="vbars-axis muted small">
        <span>{items[0].label}</span>
        <span>{items[items.length - 1].label}</span>
      </div>
    </div>
  );
}

function num(n: number): string {
  return Math.abs(n) >= 100 ? formatInt(Math.round(n)) : n.toFixed(1);
}
