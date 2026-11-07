#!/usr/bin/env node
/**
 * Local API-key gate in front of the health-trusted broker.
 *   node scripts/key_gate.mjs            serve on 127.0.0.1:8790
 *   node scripts/key_gate.mjs --selftest
 * Keys live in api-keys.sqlite (only a SHA-256 of each token is stored).
 * A request is allowed only when every scopeQ term sits inside a scope the
 * key was granted. Otherwise 403.
 *
 * shortcut: POST /api/keys is unauthenticated on 127.0.0.1, so anyone on this machine can mint keys. Put it behind the app session before exposing the port.
 */
import crypto from "node:crypto";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const BROKER = process.env.BROKER || "http://127.0.0.1:1026";
const PORT = Number(process.env.KEY_GATE_PORT || 8790);
const TENANT = "health-trusted";
const TYPES = new Set([
  "Patient",
  "Practitioner",
  "Encounter",
  "Observation",
  "DocumentReference",
  "EDWeeklyStatistic",
]);

/** Permission name → scope prefix the key may read. */
const GRANTS = {
  Aggregate: "/Classification/Public/Aggregate",
  HealthData: "/Classification/Confidential/HealthData",
  SmallCell: "/Classification/Confidential/SmallCell",
  Restricted: "/Classification/Restricted",
  Staff: "/Classification/Internal/Staff",
};

const EXPIRES = { "1h": 3600, "24h": 86400, "7d": 7 * 86400, "30d": 30 * 86400, "90d": 90 * 86400 };
const INTENT_MIN = 8;

const SEED = [
  ["hk_aggregate", "Public weekly cells", "Aggregate"],
  ["hk_health", "Pseudonymised visits and labs", "HealthData"],
  ["hk_restricted", "Identifiers and clinical notes", "Restricted"],
  ["hk_staff", "Staff directory", "Staff"],
  ["hk_smallcell", "Small cells", "SmallCell"],
  ["hk_none", "No permissions", ""],
];

export function allowed(scopeQ, names) {
  const grants = names.map((n) => GRANTS[n]).filter(Boolean);
  if (!grants.length || !scopeQ?.trim()) return false;
  const alts = scopeQ.split(",");
  if (alts.some((a) => !a.trim())) return false;
  return alts.every((alt) => {
    const terms = alt.split(";").map((s) => s.trim()).filter(Boolean);
    return terms.length > 0 && terms.every((term) => termAllowed(term, grants));
  });
}

function termAllowed(term, grants) {
  if (!term.startsWith("/")) return false;
  const base = term.endsWith("/#") || term.endsWith("/+") ? term.slice(0, -2) : term;
  if (!base.startsWith("/")) return false;
  return grants.some((g) => base === g || base.startsWith(g + "/"));
}

/** Validate a key request body; returns { scopes, intents, expire, owner } or an error string. */
export function parseKeyRequest(body) {
  if (!body || typeof body !== "object") return "Body must be a JSON object";
  const scopes = Array.isArray(body.scopes) ? [...new Set(body.scopes)] : [];
  if (!scopes.length) return "Select at least one permission";
  if (scopes.some((s) => typeof s !== "string" || !(s in GRANTS))) return "Unknown permission";
  const intents = {};
  for (const s of scopes) {
    const v = typeof body.intents?.[s] === "string" ? body.intents[s].trim() : "";
    if (v.length < INTENT_MIN) return `Intent for ${s} needs at least ${INTENT_MIN} characters`;
    intents[s] = v.slice(0, 500);
  }
  if (!(body.expire in EXPIRES)) return "Unknown expiry";
  const owner = typeof body.owner === "string" ? body.owner.trim().slice(0, 200) : "";
  return { scopes, intents, expire: body.expire, owner };
}

function selftest() {
  const yes = (names, q) => {
    if (!allowed(q, names)) throw new Error(`expected allow ${names} ${q}`);
  };
  const no = (names, q) => {
    if (allowed(q, names)) throw new Error(`expected deny ${names} ${q}`);
  };
  yes(["Aggregate"], "/Classification/Public/Aggregate");
  yes(["Aggregate"], "/Classification/Public/Aggregate/#");
  no(["Aggregate"], "/Classification/Public/#");
  no(["Aggregate"], "/Classification/Confidential/HealthData");
  yes(["HealthData"], "/Classification/Confidential/HealthData");
  no(["HealthData"], "/Classification/Confidential/#");
  yes(["Restricted"], "/Classification/Restricted/DirectIdentifier");
  yes(["Restricted"], "/Classification/Restricted/#");
  no(["Restricted"], "/Classification/Confidential/HealthData");
  no([], "/Classification/Public/Aggregate");
  no(["HealthData"], "");
  no(["Aggregate", "HealthData"], "/Classification/Public/Aggregate,/Classification/Restricted/FreeText");
  yes(["Aggregate", "HealthData"], "/Classification/Public/Aggregate,/Classification/Confidential/HealthData");

  const okReq = parseKeyRequest({ scopes: ["HealthData"], intents: { HealthData: "triage model" }, expire: "7d" });
  if (typeof okReq === "string") throw new Error(`expected valid key request: ${okReq}`);
  for (const bad of [
    { scopes: [], expire: "7d" },
    { scopes: ["Everything"], intents: { Everything: "long enough" }, expire: "7d" },
    { scopes: ["HealthData"], intents: { HealthData: "short" }, expire: "7d" },
    { scopes: ["HealthData"], intents: { HealthData: "long enough" }, expire: "forever" },
  ]) {
    if (typeof parseKeyRequest(bad) !== "string") throw new Error(`expected invalid ${JSON.stringify(bad)}`);
  }
}

const hash = (token) => crypto.createHash("sha256").update(token).digest("hex");

function openDb() {
  const file = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "api-keys.sqlite");
  const db = new DatabaseSync(file);
  db.exec(`DROP TABLE IF EXISTS api_keys;
  CREATE TABLE IF NOT EXISTS keys (
    token_hash TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    scopes TEXT NOT NULL,
    owner TEXT NOT NULL DEFAULT '',
    intents TEXT NOT NULL DEFAULT '{}',
    created_at INTEGER NOT NULL,
    expires_at INTEGER
  )`);
  const insert = db.prepare(
    "INSERT OR IGNORE INTO keys (token_hash, label, scopes, created_at) VALUES (?, ?, ?, unixepoch())",
  );
  for (const [token, label, scopes] of SEED) insert.run(hash(token), label, scopes);
  return db;
}

function send(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  res.end(JSON.stringify(body));
}

/** Returns the key row, or sends 401 and returns null. */
function authenticate(req, res, db) {
  const token = req.headers["x-api-key"];
  if (typeof token !== "string" || !token.trim()) {
    send(res, 401, { success: false, error: "Missing API key" });
    return null;
  }
  const row = db
    .prepare("SELECT label, scopes, owner, created_at, expires_at FROM keys WHERE token_hash = ?")
    .get(hash(token.trim()));
  if (!row) {
    send(res, 401, { success: false, error: "Unknown API key" });
    return null;
  }
  if (row.expires_at != null && row.expires_at <= Math.floor(Date.now() / 1000)) {
    send(res, 401, { success: false, error: "API key expired" });
    return null;
  }
  return row;
}

const scopeList = (row) => String(row.scopes).split(",").map((s) => s.trim()).filter(Boolean);

async function readJson(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 16_384) throw new Error("Body too large");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "null");
}

async function createKey(req, res, db) {
  let body;
  try {
    body = await readJson(req);
  } catch {
    send(res, 400, { success: false, error: "Invalid JSON body" });
    return;
  }
  const parsed = parseKeyRequest(body);
  if (typeof parsed === "string") {
    send(res, 400, { success: false, error: parsed });
    return;
  }
  const token = `hk_live_${crypto.randomBytes(24).toString("base64url")}`;
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + EXPIRES[parsed.expire];
  const label = parsed.owner ? `Issued to ${parsed.owner}` : "Issued key";
  db.prepare(
    "INSERT INTO keys (token_hash, label, scopes, owner, intents, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
  ).run(hash(token), label, parsed.scopes.join(","), parsed.owner, JSON.stringify(parsed.intents), now, expiresAt);
  send(res, 201, {
    success: true,
    data: { token, label, scopes: parsed.scopes, expiresAt: new Date(expiresAt * 1000).toISOString() },
  });
}

async function entities(req, res, db) {
  const row = authenticate(req, res, db);
  if (!row) return;
  const url = new URL(req.url, "http://127.0.0.1");
  const type = url.searchParams.get("type") || "";
  const scopeQ = url.searchParams.get("scopeQ") || "";
  if (!TYPES.has(type)) {
    send(res, 400, { success: false, error: "Unknown type" });
    return;
  }
  if (!allowed(scopeQ, scopeList(row))) {
    send(res, 403, { success: false, error: "API key has no permission for this scope" });
    return;
  }
  const limit = Math.min(20, Math.max(1, Number(url.searchParams.get("limit")) || 5));
  const upstream = new URL("/ngsi-ld/v1/entities", BROKER);
  upstream.searchParams.set("type", type);
  upstream.searchParams.set("scopeQ", scopeQ);
  upstream.searchParams.set("limit", String(limit));
  let broker;
  try {
    broker = await fetch(upstream, { headers: { "NGSILD-Tenant": TENANT, Accept: "application/json" } });
  } catch {
    send(res, 502, { success: false, error: "Broker unreachable" });
    return;
  }
  const text = await broker.text();
  res.writeHead(broker.status, { "Content-Type": broker.headers.get("content-type") || "application/json" });
  res.end(text);
}

if (process.argv.includes("--selftest")) {
  selftest();
  console.log("ok");
  process.exit(0);
}

selftest();
const db = openDb();
const routes = {
  "GET /api/keys": (_req, res) =>
    send(res, 200, { success: true, data: SEED.map(([token, label, scopes]) => ({ token, label, scopes })) }),
  "POST /api/keys": (req, res) => createKey(req, res, db),
  "GET /api/keys/me": (req, res) => {
    const row = authenticate(req, res, db);
    if (!row) return;
    send(res, 200, {
      success: true,
      data: {
        label: row.label,
        scopes: scopeList(row),
        expiresAt: row.expires_at == null ? null : new Date(row.expires_at * 1000).toISOString(),
      },
    });
  },
  "GET /api/entities": (req, res) => entities(req, res, db),
};

http
  .createServer((req, res) => {
    const handler = routes[`${req.method} ${req.url.split("?")[0]}`];
    if (!handler) return send(res, 404, { success: false, error: "Not found" });
    Promise.resolve(handler(req, res)).catch((err) => {
      console.error(err);
      if (!res.headersSent) send(res, 500, { success: false, error: "Gate failed" });
    });
  })
  .listen(PORT, "127.0.0.1", () => {
    console.log(`Key gate http://127.0.0.1:${PORT}/`);
  });
