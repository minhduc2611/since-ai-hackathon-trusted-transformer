#!/usr/bin/env python3
"""
load_to_broker.py
=================
Loads the Aurajoki ED (synthetic health) NGSI-LD entities into an NGSI-LD broker
(tested target: the coraine broker from the Since AI / valmet-ngsi-ld setup,
http://localhost:1026) into the tenant "health-trusted". Other tenants (Valmet,
apetit_synth, ...) are not touched.

Every entity carries an NGSI-LD `scope` with its classification tier, so a consumer
can later request only what it is allowed to see (see scripts/query_scenario.py).

Uses the NGSI-LD batch upsert  POST /ngsi-ld/v1/entityOperations/upsert
with the header  NGSILD-Tenant: <tenant>.   Standard library only.

Context handling (--context-mode): inline (default) embeds data-model/context.jsonld in
every entity; url references --context-url (or serves it with --serve-context PORT).

Examples:
  python3 scripts/load_to_broker.py                          # all types, inline context
  python3 scripts/load_to_broker.py --types Encounter,EDWeeklyStatistic
  python3 scripts/load_to_broker.py --purge                  # delete then reload
  python3 scripts/load_to_broker.py --context-mode url --serve-context 8090
  python3 scripts/load_to_broker.py --dry-run
"""
import argparse
import functools
import http.server
import json
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CORE = "https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context-v1.8.jsonld"
_CTX = json.loads((ROOT / "data-model" / "context.jsonld").read_text())["@context"]


def _expand(term):
    pfx, local = _CTX[term].split(":", 1)
    return _CTX[pfx] + local


TYPE_IRI = {t: _expand(t) for t in ("Patient", "Practitioner", "Encounter", "Observation",
                                    "DocumentReference", "EDWeeklyStatistic")}


# ── HTTP helpers ─────────────────────────────────────────────────────────────
def request(method, url, tenant, body=None, ctype="application/ld+json", timeout=120):
    headers = {"Accept": "application/json"}
    if tenant:
        headers["NGSILD-Tenant"] = tenant
    data = None
    if body is not None:
        data = json.dumps(body).encode()
        headers["Content-Type"] = ctype
    req = urllib.request.Request(url, data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, r.read().decode() or "", dict(r.headers)
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode(), dict(e.headers)


def wait_for_broker(broker, retries=20, delay=2.0):
    print(f"Waiting for broker at {broker} ...", end="", flush=True)
    for _ in range(retries):
        try:
            st, _, _ = request("GET", f"{broker}/ngsi-ld/v1/types", None, timeout=3)
            if st < 500:
                print(" ready.")
                return
        except Exception:
            pass
        print(".", end="", flush=True)
        time.sleep(delay)
    sys.exit(f"\nERROR: no NGSI-LD broker answering at {broker}. "
             f"Start it first (in valmet-ngsi-ld: docker compose up -d).")


def serve_context(port):
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(ROOT / "data-model"))
    handler.log_message = lambda *a, **k: None
    srv = http.server.ThreadingHTTPServer(("0.0.0.0", port), handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    print(f"Serving data-model/ on http://0.0.0.0:{port}/ (context.jsonld)")
    return srv


# ── load / purge ─────────────────────────────────────────────────────────────
def with_context(entities, ctx):
    out = []
    for e in entities:
        e = dict(e)
        e["@context"] = ctx
        out.append(e)
    return out


def upsert(broker, tenant, batch, retries=3):
    url = f"{broker}/ngsi-ld/v1/entityOperations/upsert"
    for attempt in range(1, retries + 1):
        try:
            st, body, _ = request("POST", url, tenant, batch)
        except Exception as ex:  # connection reset, timeout
            if attempt == retries:
                return 0, [str(ex)]
            time.sleep(2 * attempt)
            continue
        if st in (200, 201, 204):
            return len(batch), []
        if st == 207:  # partial success: body lists errors
            try:
                errs = json.loads(body).get("errors", [])
            except Exception:
                errs = [body[:300]]
            return len(batch) - len(errs), [json.dumps(x)[:300] for x in errs]
        if st >= 500 and attempt < retries:
            time.sleep(2 * attempt)
            continue
        return 0, [f"HTTP {st}: {body[:400]}"]
    return 0, ["unknown"]


def load_tenant(broker, tenant, folder, manifest, ctx, batch_size, dry_run):
    print(f"\n══ tenant '{tenant}'  ({folder})")
    tot_ok = tot_err = 0
    for m in manifest:
        ents = with_context(json.loads((folder / m["file"]).read_text(encoding="utf-8")), ctx)
        ok = 0
        errors = []
        for i in range(0, len(ents), batch_size):
            chunk = ents[i:i + batch_size]
            if dry_run:
                ok += len(chunk)
            else:
                c_ok, c_err = upsert(broker, tenant, chunk)
                ok += c_ok
                errors += c_err
            if (i // batch_size) % 10 == 0:
                print(f"  {m['file']:<34} {min(i + batch_size, len(ents)):>6}/{len(ents)}", end="\r", flush=True)
        print(f"  {m['file']:<34} {len(ents):>6}/{len(ents)}  ✓ {ok}  ✗ {len(ents) - ok}        ")
        for e in errors[:3]:
            print(f"      error: {e}")
        if len(errors) > 3:
            print(f"      ... {len(errors) - 3} more errors")
        tot_ok += ok
        tot_err += len(ents) - ok
    return tot_ok, tot_err


def purge_tenant(broker, tenant, types):
    print(f"Purging our entity types from tenant '{tenant}' ...")
    for t in types:
        iri = urllib.parse.quote(TYPE_IRI[t], safe="")
        deleted = 0
        while True:
            st, body, _ = request("GET", f"{broker}/ngsi-ld/v1/entities?type={iri}&limit=100&attrs=type",
                                  tenant)
            if st != 200:
                break
            ids = [e["id"] for e in json.loads(body or "[]")]
            if not ids:
                break
            request("POST", f"{broker}/ngsi-ld/v1/entityOperations/delete", tenant, ids,
                    ctype="application/json")
            deleted += len(ids)
        if deleted:
            print(f"  deleted {deleted} {t}")


def verify(broker, tenant, types):
    print(f"\nVerification, tenant '{tenant}':")
    for t in types:
        iri = urllib.parse.quote(TYPE_IRI[t], safe="")
        st, body, hdr = request("GET", f"{broker}/ngsi-ld/v1/entities?type={iri}&count=true&limit=1", tenant)
        cnt = {k.lower(): v for k, v in hdr.items()}.get("ngsild-results-count", "?")
        print(f"  {t:<24} HTTP {st}  count={cnt}")


def main():
    ap = argparse.ArgumentParser(description="Load the Aurajoki ED NGSI-LD entities into a broker")
    ap.add_argument("--broker", default="http://localhost:1026")
    ap.add_argument("--tenant", default="health-trusted")
    ap.add_argument("--entities", default=str(ROOT / "entities" / "health-trusted"))
    ap.add_argument("--types", help="comma-separated subset, e.g. Encounter,EDWeeklyStatistic")
    ap.add_argument("--batch-size", type=int, default=100)
    ap.add_argument("--context-mode", choices=["inline", "url"], default="inline")
    ap.add_argument("--context-url", default=None,
                    help="default with --serve-context: http://host.docker.internal:<port>/context.jsonld")
    ap.add_argument("--serve-context", type=int, metavar="PORT",
                    help="serve data-model/ on this port while loading (and keep serving until Ctrl-C)")
    ap.add_argument("--purge", action="store_true", help="delete existing entities of these types first")
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()

    broker = a.broker.rstrip("/")
    folder = Path(a.entities)
    if a.context_mode == "inline":
        ctx = [CORE, _CTX]
    else:
        url = a.context_url or (f"http://host.docker.internal:{a.serve_context}/context.jsonld"
                                if a.serve_context else None)
        if not url:
            sys.exit("ERROR: --context-mode url needs --context-url or --serve-context PORT")
        ctx = [CORE, url]
        print(f"Entities will reference @context {url}")
    srv = serve_context(a.serve_context) if a.serve_context else None

    manifest = json.loads((folder / "manifest.json").read_text())
    if a.types:
        wanted = set(a.types.split(","))
        manifest = [m for m in manifest if m["type"] in wanted]
    types = list(dict.fromkeys(m["type"] for m in manifest))

    if not a.dry_run:
        wait_for_broker(broker)
        if a.purge:
            purge_tenant(broker, a.tenant, types)
    ok, err = load_tenant(broker, a.tenant, folder, manifest, ctx, a.batch_size, a.dry_run)
    if not a.dry_run:
        verify(broker, a.tenant, types)

    print(f"\n{'DRY RUN — ' if a.dry_run else ''}Done: {ok} entities loaded into '{a.tenant}', {err} errors")
    if not a.dry_run:
        t = urllib.parse.quote(TYPE_IRI["EDWeeklyStatistic"], safe="")
        print("\nTry (public cells only):")
        print(f"  curl -s -H 'NGSILD-Tenant: {a.tenant}' "
              f"'{broker}/ngsi-ld/v1/entities?type={t}&scopeQ=/Classification/Public/%23&limit=2' | jq")
        print("  python3 scripts/query_scenario.py HEALTH-S3   # what the AI vendor would receive")
    if srv:
        print(f"\nKeeping context server on :{a.serve_context} running for Link-header queries. Ctrl-C to stop.")
        try:
            while True:
                time.sleep(3600)
        except KeyboardInterrupt:
            srv.shutdown()


if __name__ == "__main__":
    main()
