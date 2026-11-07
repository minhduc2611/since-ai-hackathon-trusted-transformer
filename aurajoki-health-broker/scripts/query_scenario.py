#!/usr/bin/env python3
"""
query_scenario.py
=================
Shows what a sharing scenario receives from the health-trusted tenant: "share only
what is requested". Each scenario in data-model/classification-policy.json is a list
of NGSI-LD requests that combine
   scopeQ  (entity classification, GS CIM 009 clause 4.19) and
   pick    (attribute projection, clause 4.21).

Modes:
  python3 scripts/query_scenario.py HEALTH-S3              # print the curl commands
  python3 scripts/query_scenario.py HEALTH-S3 --run        # run them against the broker (first page)
  python3 scripts/query_scenario.py HEALTH-S3 --offline    # apply scopeQ+pick to entities/ on disk
  python3 scripts/query_scenario.py --all --offline        # summary for every scenario

Note: scopeQ and pick filter; they do not authorise. In production the same rules
go into the policy decision point in front of the broker (FIWARE Data Space
Connector / ODRL), which rewrites or rejects requests that ask for more.
Standard library only.
"""
import argparse
import json
import sys
import urllib.parse
import urllib.request
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CTX = json.loads((ROOT / "data-model" / "context.jsonld").read_text())["@context"]
POLICY = json.loads((ROOT / "data-model" / "classification-policy.json").read_text())
ENT = ROOT / "entities" / "health-trusted"
ALWAYS = {"id", "type", "scope"}


def iri(term):
    pfx, local = CTX[term].split(":", 1)
    return CTX[pfx] + local


def scope_match(q, scopes):
    """NGSI-LD scopeQ: '/A/#' = A and all descendants, '/A/+' = direct children, else exact. ';' = AND, ',' = OR."""
    scopes = scopes if isinstance(scopes, list) else [scopes]

    def one(term):
        if term.endswith("/#"):
            base = term[:-2]
            return any(s == base or s.startswith(base + "/") for s in scopes)
        if term.endswith("/+"):
            base = term[:-2]
            return any(s.startswith(base + "/") and "/" not in s[len(base) + 1:] for s in scopes)
        return term in scopes
    return any(all(one(t) for t in alt.split(";")) for alt in q.split(","))


def url_for(broker, req, limit):
    p = {"type": iri(req["type"]), "scopeQ": req["scopeQ"], "limit": str(limit), "count": "true"}
    if req.get("pick"):
        p["pick"] = ",".join(iri(a) if a in CTX else a for a in req["pick"])
    return f"{broker}/ngsi-ld/v1/entities?" + urllib.parse.urlencode(p, safe="/:")


def offline(req):
    files = [m["file"] for m in json.loads((ENT / "manifest.json").read_text()) if m["type"] == req["type"]]
    n_type = n_hit = 0
    attrs = Counter()
    sample = None
    for f in files:
        for e in json.loads((ENT / f).read_text(encoding="utf-8")):
            n_type += 1
            if not scope_match(req["scopeQ"], e["scope"]):
                continue
            n_hit += 1
            keep = set(req["pick"]) | ALWAYS if req.get("pick") else set(e)
            out = {k: v for k, v in e.items() if k in keep}
            attrs.update(k for k in out if k not in ALWAYS)
            sample = sample or out
    return n_type, n_hit, attrs, sample


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("scenario", nargs="?", choices=list(POLICY["scenarios"]))
    ap.add_argument("--all", action="store_true")
    ap.add_argument("--run", action="store_true")
    ap.add_argument("--offline", action="store_true")
    ap.add_argument("--broker", default="http://localhost:1026")
    ap.add_argument("--tenant", default=POLICY["tenant"])
    ap.add_argument("--limit", type=int, default=3)
    a = ap.parse_args()
    names = list(POLICY["scenarios"]) if a.all else [a.scenario]
    if names == [None]:
        ap.error("give a scenario or --all")

    for name in names:
        sc = POLICY["scenarios"][name]
        print(f"\n══ {name}: {sc['description']}")
        if sc.get("denied"):
            print(f"   not shared: {', '.join(sc['denied'])}")
        for req in sc["requests"]:
            pick = f"  pick={len(req['pick'])} attrs" if req.get("pick") else "  (all attributes)"
            print(f"\n  ▸ {req['type']}  scopeQ={req['scopeQ']}{pick}")
            if a.offline:
                n_type, n_hit, attrs, sample = offline(req)
                print(f"    {n_hit:,} of {n_type:,} {req['type']} entities match; attributes returned: "
                      f"{', '.join(sorted(attrs)) or '-'}")
                if sample and name != "TREATING-UNIT":
                    print("    sample: " + json.dumps(sample, ensure_ascii=False)[:600])
                continue
            url = url_for(a.broker.rstrip("/"), req, a.limit)
            print(f"    curl -s -H 'NGSILD-Tenant: {a.tenant}' '{url}' | jq")
            if a.run:
                r = urllib.request.Request(url, headers={"NGSILD-Tenant": a.tenant, "Accept": "application/json"})
                try:
                    with urllib.request.urlopen(r, timeout=30) as resp:
                        cnt = resp.headers.get("NGSILD-Results-Count", "?")
                        body = json.loads(resp.read().decode() or "[]")
                    print(f"    HTTP 200, total matching: {cnt}")
                    print("    " + json.dumps(body[:1], ensure_ascii=False)[:800])
                except Exception as ex:  # noqa: BLE001
                    print(f"    request failed: {ex}", file=sys.stderr)


if __name__ == "__main__":
    main()
