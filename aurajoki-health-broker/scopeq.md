# scopeQ curls (health-trusted)

Broker: `http://127.0.0.1:1026`, tenant `health-trusted`. Use `127.0.0.1`, not `localhost` (on this Mac `localhost` is IPv6 and the port is published on IPv4 only).

This coraine rejects a query that has only `scopeQ`. Every request needs a `type`. In the URL write `#` as `%23` and `+` as `%2B`. The count is the `NGSILD-Results-Count` response header.

```bash
B=http://127.0.0.1:1026/ngsi-ld/v1/entities
T='NGSILD-Tenant: health-trusted'
```

## Exact label

Public cells are `/Classification/Public/Aggregate`, so the parent path matches nothing.

```bash
curl -s -H "$T" "$B?type=EDWeeklyStatistic&scopeQ=/Classification/Public/Aggregate&limit=2"
# 999

curl -s -H "$T" "$B?type=EDWeeklyStatistic&scopeQ=/Classification/Public&count=true&limit=1" -D - -o /dev/null
# 0
```

## `#` — that node and everything under it

```bash
curl -s -H "$T" "$B?type=EDWeeklyStatistic&scopeQ=/Classification/%23&count=true&limit=1" -D - -o /dev/null
# 30169  (999 public + 29170 small cells)

curl -s -H "$T" "$B?type=EDWeeklyStatistic&scopeQ=/Classification/Public/%23&limit=2&pick=isoWeek,municipality,diagnosisGroup,visitCount"
# 999

curl -s -H "$T" "$B?type=Encounter&scopeQ=/Classification/Confidential/%23&limit=1&pick=triageCategory,arrivalMode,ageBand,sex"
# 46398

curl -s -H "$T" "$B?type=Observation&scopeQ=/Classification/Confidential/HealthData&count=true&limit=1" -D - -o /dev/null
# 130341

curl -s -H "$T" "$B?type=Patient&scopeQ=/Classification/Restricted/DirectIdentifier&limit=1&pick=identifier,gender"
# 26873

curl -s -H "$T" "$B?type=DocumentReference&scopeQ=/Classification/Restricted/FreeText&limit=1&pick=noteType,language"
# 30103

curl -s -H "$T" "$B?type=Practitioner&scopeQ=/Classification/Internal/Staff&limit=1&pick=role"
# 400
```

## `+` — exactly one level

Every label here is three segments deep, so one level under `/Classification` matches nothing. One level that names `SmallCell` matches the small cells.

```bash
curl -s -H "$T" "$B?type=EDWeeklyStatistic&scopeQ=/Classification/%2B&count=true&limit=1" -D - -o /dev/null
# 0

curl -s -H "$T" "$B?type=EDWeeklyStatistic&scopeQ=/Classification/%2B/SmallCell&count=true&limit=1" -D - -o /dev/null
# 29170
```

## OR, and scopeQ together with q

The OR stays inside `EDWeeklyStatistic`, so a staff scope on this type adds nothing. There is no single curl for all 264,284 entities: confidential health data is 46,398 encounters plus 130,341 observations, and restricted data is 26,873 patients plus 30,103 notes.

```bash
curl -s -H "$T" "$B?type=EDWeeklyStatistic&scopeQ=/Classification/Public/%23,/Classification/Confidential/SmallCell&count=true&limit=1" -D - -o /dev/null
# 30169

curl -s -H "$T" "$B?type=EDWeeklyStatistic&scopeQ=/Classification/Public/%23&q=municipality==%22Turku%22;diagnosisGroup==%22ILI%22&limit=2&pick=isoWeek,municipality,diagnosisGroup,visitCount"
# 146
```
