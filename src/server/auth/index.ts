import crypto from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Router, type NextFunction, type Request, type Response } from "express";
import { config } from "../../config.js";
import type { AuthOrgsResponse, AuthSession, OrgInfo, SsoLoginRequest } from "../../shared/api.js";
import { HttpError, ok } from "../http.js";

const ORGS_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), "organizations.json");
const AUDIT_FILE = path.join(config.outDir, "auth_audit.jsonl");
const COOKIE = "pets_session";
const SESSION_SECONDS = 8 * 60 * 60;
const SIMULATE_IP = process.env.AUTH_SIMULATE_IP !== "0";
// Without AUTH_SECRET every restart invalidates existing sessions.
const SECRET = process.env.AUTH_SECRET || crypto.randomBytes(32).toString("hex");

interface SessionPayload {
  email: string;
  orgId: string;
  /** IP checked against the org registry (simulated or real). */
  ip: string;
  /** Real socket/proxy IP at login; the session only works from it. */
  peer: string;
  exp: number;
}

declare module "express-serve-static-core" {
  interface Request {
    session?: SessionPayload;
  }
}

let orgCache: { mtime: number; orgs: OrgInfo[] } | null = null;

function loadOrgs(): OrgInfo[] {
  const mtime = fs.statSync(ORGS_FILE).mtimeMs;
  if (orgCache?.mtime !== mtime) {
    orgCache = { mtime, orgs: JSON.parse(fs.readFileSync(ORGS_FILE, "utf8")) as OrgInfo[] };
  }
  return orgCache.orgs;
}

function normalizeIp(ip: string | undefined): string {
  const v = (ip ?? "").trim();
  return v.startsWith("::ffff:") && net.isIPv4(v.slice(7)) ? v.slice(7) : v;
}

function ipAllowed(ip: string, org: OrgInfo): boolean {
  const family = net.isIPv4(ip) ? "ipv4" : net.isIPv6(ip) ? "ipv6" : null;
  if (!family) return false;
  const list = new net.BlockList();
  for (const cidr of org.allowedCidrs) {
    const [base, bits] = cidr.split("/");
    const type = net.isIPv4(base) ? "ipv4" : "ipv6";
    list.addSubnet(base, Number(bits ?? (type === "ipv4" ? 32 : 128)), type);
  }
  return list.check(ip, family);
}

function sign(payload: SessionPayload): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const mac = crypto.createHmac("sha256", SECRET).update(body).digest("base64url");
  return `${body}.${mac}`;
}

function verify(token: string): SessionPayload | null {
  const [body, mac] = token.split(".");
  if (!body || !mac) return null;
  const expected = crypto.createHmac("sha256", SECRET).update(body).digest();
  const given = Buffer.from(mac, "base64url");
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;
  const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as SessionPayload;
  return payload.exp > Date.now() / 1000 ? payload : null;
}

function readCookie(req: Request, name: string): string | null {
  for (const part of (req.headers.cookie ?? "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

function setSessionCookie(req: Request, res: Response, value: string, maxAge: number): void {
  const secure = req.secure ? "; Secure" : "";
  res.setHeader("Set-Cookie", `${COOKIE}=${value}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}${secure}`);
}

function audit(event: Record<string, unknown>): void {
  fs.mkdirSync(path.dirname(AUDIT_FILE), { recursive: true });
  fs.appendFileSync(AUDIT_FILE, `${JSON.stringify({ at: new Date().toISOString(), ...event })}\n`);
}

function toSession(p: SessionPayload, org: OrgInfo): AuthSession {
  return {
    email: p.email,
    orgId: org.id,
    orgName: org.name,
    idp: org.idp,
    ip: p.ip,
    expiresAt: new Date(p.exp * 1000).toISOString(),
  };
}

/*
Resolve and re-validate the caller's session: signature, expiry, same client IP as at login,
and the org's IP allow-list (which may have changed since login).
*/
function currentSession(req: Request): { payload: SessionPayload; org: OrgInfo } | null {
  const token = readCookie(req, COOKIE);
  const payload = token ? verify(token) : null;
  if (!payload || payload.peer !== normalizeIp(req.ip)) return null;
  const org = loadOrgs().find((o) => o.id === payload.orgId);
  if (!org || !ipAllowed(payload.ip, org)) return null;
  return { payload, org };
}

export const authRouter = Router();

authRouter.get("/orgs", (req, res) => {
  const body: AuthOrgsResponse = { orgs: loadOrgs(), clientIp: normalizeIp(req.ip), simulateIp: SIMULATE_IP };
  ok(res, body);
});

authRouter.post("/sso", (req, res) => {
  const { orgId, email, simulatedIp } = (req.body ?? {}) as Partial<SsoLoginRequest>;
  const peer = normalizeIp(req.ip);
  const ip = SIMULATE_IP && simulatedIp ? normalizeIp(simulatedIp) : peer;
  const org = loadOrgs().find((o) => o.id === orgId);
  const addr = String(email ?? "").trim().toLowerCase();
  const deny = (status: number, reason: string): never => {
    audit({ outcome: "denied", orgId, email: addr, ip, peer, reason });
    throw new HttpError(status, reason);
  };

  if (!org) deny(400, "Unknown organization.");
  const o = org as OrgInfo;
  if (!net.isIP(ip)) deny(400, `Invalid IP address: ${ip || "(empty)"}`);
  const domain = /^[^\s@]+@([^\s@]+)$/.exec(addr)?.[1];
  if (domain !== o.ssoDomain) deny(401, `${o.idp} rejected the sign-in: use your @${o.ssoDomain} account.`);
  if (!ipAllowed(ip, o)) {
    deny(403, `Access denied: ${ip} is outside ${o.name}'s registered network (${o.allowedCidrs.join(", ")}).`);
  }

  const payload: SessionPayload = { email: addr, orgId: o.id, ip, peer, exp: Math.floor(Date.now() / 1000) + SESSION_SECONDS };
  setSessionCookie(req, res, sign(payload), SESSION_SECONDS);
  audit({ outcome: "granted", orgId: o.id, email: addr, ip, peer });
  ok(res, toSession(payload, o));
});

authRouter.get("/me", (req, res) => {
  const s = currentSession(req);
  if (!s) throw new HttpError(401, "Not signed in.");
  ok(res, toSession(s.payload, s.org));
});

authRouter.post("/logout", (req, res) => {
  const s = currentSession(req);
  if (s) audit({ outcome: "logout", orgId: s.org.id, email: s.payload.email, ip: s.payload.ip });
  setSessionCookie(req, res, "", 0);
  ok(res, { signedOut: true });
});

/*
Gate every other /api route behind a valid, IP-bound session.
*/
export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const s = currentSession(req);
  if (!s) return next(new HttpError(401, "Not signed in or session no longer valid from this network."));
  req.session = s.payload;
  next();
}
