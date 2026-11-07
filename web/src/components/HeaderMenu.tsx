import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useForm } from "react-hook-form";
import type { AuthSession } from "@shared/api";

/** Ids must match GRANTS in aurajoki-health-broker/scripts/key_gate.mjs. */
const DATA_APIS = [
  { id: "Aggregate", label: "Aggregate", hint: "Public weekly cells with at least 5 visits" },
  { id: "HealthData", label: "HealthData", hint: "Pseudonymised ED visits and lab results" },
  { id: "SmallCell", label: "SmallCell", hint: "Weekly cells under 5 visits (disclosive)" },
  { id: "Staff", label: "Staff", hint: "Hospital staff directory" },
  { id: "Restricted", label: "Restricted", hint: "Patient identifiers and clinical notes" },
] as const;

type ApiId = (typeof DATA_APIS)[number]["id"];

const EXPIRIES = [
  { value: "1h", label: "1 hour" },
  { value: "24h", label: "24 hours" },
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "90d", label: "90 days" },
] as const;

const INTENT_MIN = 8;

type ApiKeyForm = {
  scopes: Record<ApiId, boolean>;
  intents: Record<ApiId, string>;
  expire: string;
};

const defaultScopes = Object.fromEntries(DATA_APIS.map((a) => [a.id, false])) as Record<ApiId, boolean>;
const defaultIntents = Object.fromEntries(DATA_APIS.map((a) => [a.id, ""])) as Record<ApiId, string>;

/** Header ⋮ menu with API key request dialog. */
export function HeaderMenu({
  session,
  onLogout,
  onTryKey,
}: {
  session: AuthSession;
  onLogout: () => void;
  onTryKey: (token?: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="header-menu" ref={root}>
      <button
        type="button"
        className="header-menu-btn"
        aria-label="More options"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        ⋯
      </button>
      {open && (
        <div className="header-menu-dropdown" role="menu">
          <div className="header-identity">
            <strong>{session.email}</strong>
            <span className="muted small">
              {session.orgName} · {session.idp}
            </span>
            <span className="muted small">IP {session.ip}</span>
          </div>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              setShowKey(true);
            }}
          >
            API key
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onTryKey();
            }}
          >
            Try API key
          </button>
          <button type="button" role="menuitem" onClick={onLogout}>
            Sign out
          </button>
        </div>
      )}
      {showKey && (
        <ApiKeyModal
          owner={session.email}
          onClose={() => setShowKey(false)}
          onTry={(token) => {
            setShowKey(false);
            onTryKey(token);
          }}
        />
      )}
    </div>
  );
}

function ApiKeyModal({
  owner,
  onClose,
  onTry,
}: {
  owner: string;
  onClose: () => void;
  onTry: (token: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [issued, setIssued] = useState<string | null>(null);
  const [issuedExpiry, setIssuedExpiry] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    getValues,
    clearErrors,
    formState: { errors },
  } = useForm<ApiKeyForm>({
    defaultValues: { scopes: defaultScopes, intents: defaultIntents, expire: "7d" },
    mode: "onSubmit",
    reValidateMode: "onChange",
  });

  const scopes = watch("scopes");

  const close = () => {
    setClosing(true);
    window.setTimeout(onClose, 200);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const toggle = (id: ApiId) => {
    const next = !scopes[id];
    setValue(`scopes.${id}`, next, { shouldDirty: true, shouldValidate: true });
    if (!next) {
      setValue(`intents.${id}`, "", { shouldDirty: true });
      clearErrors(`intents.${id}`);
    }
    setFormError(null);
  };

  const onValid = async (data: ApiKeyForm) => {
    const selected = DATA_APIS.map((a) => a.id).filter((id) => data.scopes[id]);
    setBusy(true);
    setCopied(false);
    setFormError(null);
    try {
      const res = await fetch("/gate/api/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scopes: selected,
          intents: Object.fromEntries(selected.map((id) => [id, data.intents[id]])),
          expire: data.expire,
          owner,
        }),
      });
      const body = (await res.json().catch(() => null)) as
        | { success: true; data: { token: string; expiresAt: string } }
        | { success: false; error: string }
        | null;
      if (!res.ok || !body?.success) {
        setFormError(body && !body.success ? body.error : `Key gate refused the request (${res.status}).`);
        return;
      }
      setIssued(body.data.token);
      setIssuedExpiry(body.data.expiresAt);
    } catch {
      setFormError("Key gate is not running. Start it with node scripts/key_gate.mjs.");
    } finally {
      setBusy(false);
    }
  };

  const onInvalid = () => {
    const selected = DATA_APIS.filter((a) => scopes[a.id]);
    if (!selected.length) setFormError("Select at least one permission.");
    else setFormError("Fix the highlighted intents, then request again.");
  };

  const copyKey = async () => {
    if (!issued) return;
    try {
      await navigator.clipboard.writeText(issued);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setFormError("Could not copy to clipboard.");
    }
  };

  return createPortal(
    <div className={`api-backdrop${closing ? " closing" : ""}`}>
      <div className="api-modal" role="dialog" aria-modal="true" aria-labelledby="api-key-title">
        <header className="api-head">
          <div>
            <h2 id="api-key-title">Request API key</h2>
            <p className="muted small">
              Scoped access to the health-trusted broker by classification tier. Keys expire automatically.
            </p>
          </div>
          <button type="button" className="api-close" aria-label="Close" onClick={close}>
            ×
          </button>
        </header>

        <form
          id="api-key-form"
          className="api-body"
          onSubmit={(e) => {
            e.preventDefault();
            const selected = DATA_APIS.filter((a) => getValues(`scopes.${a.id}`));
            if (!selected.length) {
              setFormError("Select at least one permission.");
              return;
            }
            setFormError(null);
            void handleSubmit(onValid, onInvalid)(e);
          }}
        >
          {!issued ? (
            <>
              <fieldset className="api-scopes">
                <legend>Permissions</legend>
                {DATA_APIS.map((api) => {
                  const on = !!scopes[api.id];
                  const intentErr = errors.intents?.[api.id]?.message;
                  return (
                    <div key={api.id} className={`api-scope-block${on ? " on" : ""}`}>
                      <label className="api-scope">
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={() => toggle(api.id)}
                        />
                        <span>
                          <strong>{api.label}</strong>
                          <span className="muted small">{api.hint}</span>
                        </span>
                      </label>
                      {on && (
                        <label className="field api-intent">
                          Intent for {api.label}
                          <textarea
                            rows={2}
                            placeholder={`Why do you need ${api.label}? (min ${INTENT_MIN} characters)`}
                            aria-invalid={!!intentErr}
                            {...register(`intents.${api.id}`, {
                              validate: (value) => {
                                if (!getValues(`scopes.${api.id}`)) return true;
                                const v = (value ?? "").trim();
                                if (!v) return "Intent is required for this API.";
                                if (v.length < INTENT_MIN) {
                                  return `At least ${INTENT_MIN} characters (you have ${v.length}).`;
                                }
                                return true;
                              },
                            })}
                          />
                          {intentErr && <span className="field-error">{intentErr}</span>}
                        </label>
                      )}
                    </div>
                  );
                })}
              </fieldset>

              <label className="field">
                Expire time
                <select {...register("expire", { required: true })}>
                  {EXPIRIES.map((e) => (
                    <option key={e.value} value={e.value}>
                      {e.label}
                    </option>
                  ))}
                </select>
              </label>

              {formError && <p className="error">{formError}</p>}
            </>
          ) : (
            <div className="api-issued">
              <div className="api-issued-row">
              <div className="api-issued-icon" aria-hidden>
                <KeyIcon />
              </div>
              <span className="muted small">Issued key</span>
              </div>
              <div className="api-issued-row">
                <code title={issued}>{maskKey(issued)}</code>
                <button type="button" className="secondary api-copy" onClick={() => void copyKey()}>
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
              <span className="muted small">
                Shown once — copy it now.
                {issuedExpiry && ` Expires ${new Date(issuedExpiry).toLocaleString()}.`}
              </span>
            </div>
          )}
        </form>

        <footer className="api-actions">
          <button type="button" className="secondary" onClick={close}>
            {issued ? "Done" : "Cancel"}
          </button>
          {issued ? (
            <button type="button" className="primary" onClick={() => onTry(issued)}>
              Try this key
            </button>
          ) : (
            <button type="submit" className="primary" form="api-key-form" disabled={busy}>
              {busy ? "Requesting…" : "Request"}
            </button>
          )}
        </footer>
      </div>
    </div>,
    document.body,
  );
}

function maskKey(key: string): string {
  const keep = Math.min(10, Math.max(4, Math.floor(key.length * 0.28)));
  return `${key.slice(0, keep)}${"•".repeat(Math.max(8, key.length - keep))}`;
}

function KeyIcon() {
  return (
    <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.6">
      <circle cx="8" cy="14" r="4" />
      <path d="M11.5 12.5 20 4l2 2-2 2-2-1-2 2-1-2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
