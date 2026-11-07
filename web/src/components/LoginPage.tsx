import { useEffect, useState } from "react";
import type { AuthOrgsResponse, AuthSession, OrgInfo } from "@shared/api";
import { api } from "../api/client";

const OUTSIDE_IP = "203.0.113.7";

export function LoginPage({ onSignedIn }: { onSignedIn: (s: AuthSession) => void }) {
  const [info, setInfo] = useState<AuthOrgsResponse | null>(null);
  const [orgId, setOrgId] = useState("");
  const [email, setEmail] = useState("");
  const [ip, setIp] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.authOrgs().then(
      (r) => {
        setInfo(r);
        setOrgId(r.orgs[0]?.id ?? "");
        setIp(r.clientIp);
      },
      (e: unknown) => setError(e instanceof Error ? e.message : String(e)),
    );
  }, []);

  const org = info?.orgs.find((o) => o.id === orgId);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!org) return;
    setError(null);
    setStatus(`Redirecting to ${org.idp}…`);
    await new Promise((r) => setTimeout(r, 500));
    setStatus("Verifying organization network…");
    try {
      const [session] = await Promise.all([
        api.login({ orgId: org.id, email, simulatedIp: info?.simulateIp ? ip : undefined }),
        new Promise((r) => setTimeout(r, 500)),
      ]);
      onSignedIn(session);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus(null);
    }
  };

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={(e) => void submit(e)}>
        <div className="login-brand">
          <ShieldIcon />
          <div>
            <h1>TrustED PETs</h1>
            <p className="muted small">Trusted access for registered organizations</p>
          </div>
        </div>

        <label className="field">
          Organization
          <select
            value={orgId}
            onChange={(e) => {
              setOrgId(e.target.value);
              setEmail("");
              setError(null);
            }}
          >
            {info?.orgs.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          Work email
          <input
            type="email"
            required
            value={email}
            placeholder={org ? `name@${org.ssoDomain}` : "name@company"}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>

        {info?.simulateIp && org && (
          <fieldset className="login-sim">
            <legend>Network simulation</legend>
            <label className="field">
              Client IP
              <input value={ip} onChange={(e) => setIp(e.target.value.trim())} />
            </label>
            <div className="login-chips">
              <button type="button" onClick={() => setIp(info.clientIp)}>
                My IP ({info.clientIp})
              </button>
              <button type="button" onClick={() => setIp(insideIp(org))}>
                Inside {org.name.split(" ")[0]}
              </button>
              <button type="button" onClick={() => setIp(OUTSIDE_IP)}>
                Outside network
              </button>
            </div>
            <p className="muted small">Registered network: {org.allowedCidrs.join(", ")}</p>
          </fieldset>
        )}

        {error && <p className="error login-error">{error}</p>}

        <button type="submit" className="primary" disabled={!org || !!status}>
          {status ?? (org ? `Continue with ${org.idp}` : "Loading…")}
        </button>
        <p className="muted small login-foot">
          Sessions are bound to your organization's registered IP range and expire after 8 hours.
        </p>
      </form>
    </div>
  );
}

/*
A sample address inside the org's first IPv4 range.
*/
function insideIp(org: OrgInfo): string {
  const cidr = org.allowedCidrs.find((c) => /^\d+\.\d+\.\d+\.\d+\//.test(c));
  if (!cidr) return "";
  const [base, bits] = cidr.split("/");
  const parts = base.split(".");
  if (Number(bits) < 32) parts[3] = "42";
  return parts.join(".");
}

function ShieldIcon() {
  return (
    <svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M12 3 4 6v6c0 4.5 3.4 8.2 8 9 4.6-.8 8-4.5 8-9V6l-8-3Z" strokeLinejoin="round" />
      <path d="m8.5 12 2.5 2.5 4.5-5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
