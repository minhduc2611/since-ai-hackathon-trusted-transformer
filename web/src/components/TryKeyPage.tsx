import { useEffect, useState } from "react";

const PRESETS = [
  ["Aggregate cells", "EDWeeklyStatistic", "/Classification/Public/Aggregate"],
  ["HealthData visits", "Encounter", "/Classification/Confidential/HealthData"],
  ["HealthData labs", "Observation", "/Classification/Confidential/HealthData"],
  ["Restricted patients", "Patient", "/Classification/Restricted/DirectIdentifier"],
  ["Restricted notes", "DocumentReference", "/Classification/Restricted/#"],
  ["Staff", "Practitioner", "/Classification/Internal/Staff"],
  ["Small cells", "EDWeeklyStatistic", "/Classification/Confidential/SmallCell"],
  ["Wider than one tier", "Encounter", "/Classification/Confidential/#"],
] as const;

const maskKey = (k: string) => (k.length > 16 ? `${k.slice(0, 12)}…${k.slice(-4)}` : k);

type DemoKey = { token: string; label: string; scopes: string };
type KeyInfo = { label: string; scopes: string[]; expiresAt: string | null };
type Lookup = { state: "idle" | "checking" } | { state: "ok"; info: KeyInfo } | { state: "bad"; error: string };
type Reply = { status: number; statusText: string; body: string; count: number | null };

export function TryKeyPage({ initialKey, onBack }: { initialKey: string; onBack: () => void }) {
  const [demoKeys, setDemoKeys] = useState<DemoKey[]>([]);
  const [token, setToken] = useState(initialKey);
  const [lookup, setLookup] = useState<Lookup>({ state: "idle" });
  const [pick, setPick] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reply, setReply] = useState<Reply | null>(null);
  const key = token.trim();

  useEffect(() => {
    fetch("/gate/api/keys")
      .then((r) => r.json())
      .then((j: { data: DemoKey[] }) => setDemoKeys(j.data))
      .catch(() => setLoadError("Key gate is not running. Start it with node scripts/key_gate.mjs."));
  }, []);

  useEffect(() => {
    if (!key) {
      setLookup({ state: "idle" });
      return;
    }
    setLookup({ state: "checking" });
    const ctrl = new AbortController();
    const t = window.setTimeout(() => {
      fetch("/gate/api/keys/me", { headers: { "X-API-Key": key }, signal: ctrl.signal })
        .then(async (r) => {
          const j = (await r.json()) as { success: boolean; data?: KeyInfo; error?: string };
          setLookup(j.success && j.data ? { state: "ok", info: j.data } : { state: "bad", error: j.error ?? "Invalid key" });
        })
        .catch((e: unknown) => {
          if ((e as Error).name !== "AbortError") setLookup({ state: "bad", error: "Key gate did not answer" });
        });
    }, 250);
    return () => {
      window.clearTimeout(t);
      ctrl.abort();
    };
  }, [key]);

  const [, type, scopeQ] = PRESETS[pick];
  const query = new URLSearchParams({ type, scopeQ, limit: "5" }).toString();

  const send = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/gate/api/entities?${query}`, { headers: { "X-API-Key": key } });
      const text = await res.text();
      let body = text;
      let count: number | null = null;
      try {
        const json: unknown = JSON.parse(text);
        body = JSON.stringify(json, null, 2);
        if (Array.isArray(json)) count = json.length;
      } catch {
        /* non-JSON body is shown as is */
      }
      setReply({ status: res.status, statusText: res.statusText, body, count });
    } catch {
      setReply({ status: 0, statusText: "Network error", body: "The key gate did not answer.", count: null });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="try-key">
      <header className="try-head">
        <button type="button" className="try-back" onClick={onBack}>
          ← Datasets
        </button>
        <h2>Try an API key</h2>
        <p className="muted">
          The key's permissions are checked against the query scope before the broker is called. A scope the key does
          not cover returns 403.
        </p>
      </header>

      {loadError && <p className="error">{loadError}</p>}

      <div className="try-grid">
        <div className="panel try-request">
          <fieldset className="try-group">
            <legend>API key</legend>
            <input
              className="try-key-input"
              type="text"
              placeholder="Paste a key, e.g. hk_live_…"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              spellCheck={false}
              autoComplete="off"
              aria-describedby="try-key-info"
            />
            <div id="try-key-info" className="try-key-info" aria-live="polite">
              {lookup.state === "checking" && <span className="muted small">Checking key…</span>}
              {lookup.state === "bad" && <span className="error small">{lookup.error}</span>}
              {lookup.state === "ok" && (
                <>
                  <span className="small">{lookup.info.label}</span>
                  <span className="try-chips">
                    {lookup.info.scopes.length ? (
                      lookup.info.scopes.map((s) => (
                        <span key={s} className="try-chip">
                          {s}
                        </span>
                      ))
                    ) : (
                      <span className="try-chip none">No permissions</span>
                    )}
                  </span>
                  <span className="muted small">
                    {lookup.info.expiresAt ? `Expires ${new Date(lookup.info.expiresAt).toLocaleString()}` : "No expiry"}
                  </span>
                </>
              )}
            </div>
            {demoKeys.length > 0 && (
              <div className="try-demo">
                <span className="muted small">Demo keys:</span>
                {demoKeys.map((k) => (
                  <button
                    key={k.token}
                    type="button"
                    className={`try-demo-key${k.token === key ? " on" : ""}`}
                    title={k.label}
                    onClick={() => setToken(k.token)}
                  >
                    {k.token}
                  </button>
                ))}
              </div>
            )}
          </fieldset>

          <fieldset className="try-group">
            <legend>Query</legend>
            <div className="try-queries">
              {PRESETS.map(([label, t, q], i) => (
                <label key={label} className={`try-query${i === pick ? " on" : ""}`}>
                  <input type="radio" name="try-query" checked={i === pick} onChange={() => setPick(i)} />
                  <span>
                    <strong>{label}</strong>
                    <span className="muted small">
                      {t} · <code>{q}</code>
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <button type="button" className="primary" onClick={() => void send()} disabled={!key || busy}>
            {busy ? "Sending…" : "Send request"}
          </button>
        </div>

        <div className="panel try-response">
          <div className="try-response-head">
            <h3>Response</h3>
            {reply && (
              <span className={`try-status s${Math.floor(reply.status / 100)}`}>
                {reply.status || "—"} {reply.statusText}
              </span>
            )}
            {reply?.count != null && <span className="muted small">{reply.count} entities</span>}
          </div>
          <code className="try-line">
            GET /api/entities?{decodeURIComponent(query)}
            <br />
            X-API-Key: {key ? maskKey(key) : "—"}
          </code>
          {reply ? (
            <pre className="try-out">{reply.body}</pre>
          ) : (
            <div className="try-empty muted">Paste a key, pick a query, then send the request.</div>
          )}
        </div>
      </div>
    </section>
  );
}
