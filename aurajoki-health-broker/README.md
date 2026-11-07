# Aurajoki ED – NGSI-LD broker for the data-classification use case

This bundle runs a local NGSI-LD broker (**coraine**) on your laptop, loaded with the synthetic Aurajoki Regional Hospital emergency-department data (2025) in the tenant **`health-trusted`**.

**All data is synthetic.** It still contains realistic-looking identifiers, so use it only for this use case. The ports are bound to `127.0.0.1` only, so the broker is not reachable from your network.

## Start
Requirements: Docker Desktop (or Docker Engine with Compose v2), about 4 GB free RAM, and internet access the first time (to pull the images).
```bash
docker compose up -d
docker compose logs -f loader      # the loader runs once; wait for "Done: 264284 entities loaded"
```

| Service | What it does | Port (localhost only) |
|---|---|---|
| `coraine` | NGSI-LD broker, in memory | 1026 |
| `health-context` | serves `data-model/context.jsonld` | 8090 |
| `loader` | loads `entities/health-trusted/` once, then exits | – |

The broker keeps the data in memory. After `docker compose down`, run `docker compose up -d` again and it reloads.

## What is in the tenant
Every entity has an NGSI-LD **`scope`** with its classification tier:

| Type | Entities | scope |
|---|---:|---|
| Patient (identity) | 26,873 | `/Classification/Restricted/DirectIdentifier` |
| DocumentReference (clinical notes) | 30,103 | `/Classification/Restricted/FreeText` |
| Encounter (ED visits, pseudonymised) | 46,398 | `/Classification/Confidential/HealthData` |
| Observation (lab results) | 130,341 | `/Classification/Confidential/HealthData` |
| EDWeeklyStatistic, cells < 5 visits | 29,170 | `/Classification/Confidential/SmallCell` |
| EDWeeklyStatistic, cells ≥ 5 visits | 999 | `/Classification/Public/Aggregate` |
| Practitioner (staff) | 400 | `/Classification/Internal/Staff` |

The data model is described in `data-model/DATA_MODEL.md`. The rules for who gets what are in `data-model/classification-policy.json`.

## Query by classification (`scopeQ`)
The broker resolves short names through the context server. If short names don't work on your version of coraine, use the full IRIs (see `scripts/query_scenario.py`).
```bash
B=http://localhost:1026/ngsi-ld/v1/entities
T='NGSILD-Tenant: health-trusted'

curl -s -H "$T" "$B?scopeQ=/%23&count=true&limit=1" -D - -o /dev/null | grep -i count        # 264284 (everything scoped)
curl -s -H "$T" "$B?type=EDWeeklyStatistic&scopeQ=/Classification/Public/%23&limit=3" | jq    # public cells (999)
curl -s -H "$T" "$B?scopeQ=/Classification/Confidential/%23&count=true&limit=1" -D - -o /dev/null | grep -i count   # 205909
curl -s -H "$T" "$B?scopeQ=/Classification/%2B/SmallCell&count=true&limit=1" -D - -o /dev/null | grep -i count      # 29170

# AI-vendor view (HEALTH-S3): classification + only the requested attributes (pick)
curl -s -H "$T" "$B?type=Encounter&scopeQ=/Classification/Confidential/HealthData&limit=3&pick=triageCategory,arrivalMode,heartRate,oxygenSaturation,ageBand,sex,dischargeDisposition" | jq
```

**URL encoding:**
- Write `#` as **`%23`**. Otherwise curl or the browser treats it as an anchor and cuts off the query.
- Write `+` as **`%2B`**. A plain `+` in a query string becomes a space.

Wildcards and operators in `scopeQ`:

| Wildcard | Write in the URL as | Matches |
|---|---|---|
| `#` | `%23` | the scope and everything below it |
| `+` | `%2B` | exactly one level (it can sit anywhere in the path) |
| `;` | `;` | AND |
| `,` or `\|` | `,` or `\|` | OR |

## Scenario queries
```bash
python3 scripts/query_scenario.py --all            # prints the request for every scenario
python3 scripts/query_scenario.py HEALTH-S3 --run  # runs one against the broker
```

## Spec references (ETSI GS CIM 009 v1.9.1)
- Scopes: https://cim.etsi.org/NGSI-LD/official/clause-4.html#4.18
- Scope Query Language: https://cim.etsi.org/NGSI-LD/official/clause-4.html#4.19
- Attribute Projection (`pick`): https://cim.etsi.org/NGSI-LD/official/clause-4.html#4.21
- `GET /entities`: https://cim.etsi.org/NGSI-LD/official/clause-6.html#6.4

## Important
- `scopeQ` and `pick` **filter; they do not authorise**. A client that leaves them out gets everything. Access control per scenario comes later, via the FIWARE Data Space Connector or ODRL.
- First check: `scopeQ=/Classification/Public/%23` must return **999**. If it returns 30,169, the broker is ignoring `scopeQ`; report it.
- Do not copy this data into other systems, and do not share the bundle further.
