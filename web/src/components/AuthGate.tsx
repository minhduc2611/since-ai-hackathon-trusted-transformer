import { useCallback, useEffect, useState } from "react";
import type { AuthSession } from "@shared/api";
import { api, UNAUTHORIZED_EVENT } from "../api/client";
import { App } from "../App";
import { LoginPage } from "./LoginPage";

/** Shows /login until the server confirms an IP-bound SSO session. */
export function AuthGate() {
  const [session, setSession] = useState<AuthSession | null | undefined>(undefined);

  useEffect(() => {
    api.me().then(setSession, () => setSession(null));
    const onUnauthorized = () => setSession(null);
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  }, []);

  useEffect(() => {
    if (session === undefined) return;
    const target = session ? "/" : "/login";
    if (window.location.pathname !== target) window.history.replaceState(null, "", target);
  }, [session]);

  const logout = useCallback(async () => {
    await api.logout().catch(() => undefined);
    setSession(null);
  }, []);

  if (session === undefined) return <p className="muted page">Checking session…</p>;
  if (!session) return <LoginPage onSignedIn={setSession} />;
  return <App session={session} onLogout={() => void logout()} />;
}
