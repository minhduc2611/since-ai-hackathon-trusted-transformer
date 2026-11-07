
Chandra Challagonda
Tệp đính kèm
20:07 (43 phút trước)
đến tôi

So here is the set 

All 264,284 entities validate against the schemas, and every term resolves in the context. Now the loader for health-trusted and a small script that runs each sharing scenario as an NGSI-LD query.

Loader works (dry run, 0 errors). Now the scenario query script. It can also run offline against the JSON files, so you can see exactly what each requester would receive before a broker is involved.

I’ve converted the Aurajoki ED data into 264,284 NGSI-LD entities for the health-trusted tenant, set up like the agrifood project. A dry-run load on your Mac went through with 0 errors. Every entity also checks out against its schema, and every link between entities points to a real record. It hasn’t been loaded into the Coraine broker yet.

The files are in your FIWARE folder under aurajoki-health-ngsi-ld/, with a zip next to it.

Data model. The entity types come from the Smart Data Models HL7/FHIR models (dataModel.Hl7), plus one new type for the weekly table. Patient identity is kept separate from the clinical record:

Type	Entities	Classification
Patient (identity code, name, birth date, phone, address)	26,873	Restricted/DirectIdentifier
Encounter (ED visits, vital signs, diagnoses; patient as a pseudonym)	46,398	Confidential/HealthData
Observation (lab results)	130,341	Confidential/HealthData
DocumentReference (clinical notes, free text)	30,103	Restricted/FreeText
Practitioner (staff)	400	Internal/Staff
EDWeeklyStatistic (published weekly table)	999 / 29,170	Public (≥5 visits) / Confidential/SmallCell
How the classification works. The feature you were thinking of is NGSI-LD Scopes. Every entity carries a scope with its tier, and a requester filters on it with scopeQ. Attribute-level filtering uses the newer pick parameter, which returns only the named attributes. Two visit fields are stricter than the visit itself: the chief complaint (free text) and the ambulance call sign each carry their own classification tag. Every field’s tier is also fixed in the schemas.

classification-policy.json turns the README’s three scenarios into NGSI-LD queries:

Research (S1): pseudonymised visits and labs, but no identities, notes or call signs.
Public dashboard (S2): only the 999 weekly cells with at least 5 visits.
AI vendor (S3): 13 triage-time fields per visit, with no patient link and no diagnoses.
To see what each scenario would receive, without a broker, run python3 scripts/query_scenario.py --all --offline.

Things to know before relying on it:

Filtering is not access control. scopeQ and pick only narrow a query, and a requester can leave them out. Enforcement has to sit in the Data Space Connector, with ODRL policies per scenario.
The AI vendor still gets visit ids. NGSI-LD always returns each entity’s id, so ids like ED25-000002 reach S3. They need re-keying on export.
The public dashboard loses most of the table. With a threshold of 5 visits, 97% of the weekly cells are withheld.
Patient pseudonyms depend on a secret key in scripts/.pseudonym.key. Reuse it on reruns so pseudonyms stay stable, and don’t share it: anyone with it can link pseudonyms back to identity codes.
The research data is not anonymous. It still contains exact times, age and municipality, and I haven’t tested it against the attacker files the source README mentions.
Next step is to run python3 scripts/load_to_broker.py against Coraine. That will show whether Coraine supports scopeQ and pick and can hold about 264,000 entities in memory.
These queries run against the health-trusted tenant on Coraine (localhost:1026). Data loaded with the default inline context needs full IRIs for type and pick; scope values are used as they are. Write # as %23 in a URL.

bash
B=http://localhost:1026/ngsi-ld/v1/entities
T='NGSILD-Tenant: health-trusted'
HL7=https://smartdatamodels.org/dataModel.Hl7/
HED=https://uri.fiware.org/ns/data-models/health-ed/
1. By classification tier (entity level)

bash
# Public only: weekly cells with ≥5 visits (999 entities)
curl -s -H "$T" "$B?type=${HED}EDWeeklyStatistic&scopeQ=/Classification/Public/%23&count=true&limit=5" | jq

# Small cells that must not be published (29,170)
curl -s -H "$T" "$B?type=${HED}EDWeeklyStatistic&scopeQ=/Classification/Confidential/SmallCell&count=true&limit=5" | jq

# Pseudonymised visits
curl -s -H "$T" "$B?type=${HL7}Encounter&scopeQ=/Classification/Confidential/HealthData&limit=2" | jq

# Everything Confidential, any subtype, any entity type
curl -s -H "$T" "$B?type=${HL7}Encounter,${HL7}Observation,${HED}EDWeeklyStatistic&scopeQ=/Classification/Confidential/%23&count=true&limit=1" -D - -o /dev/null | grep -i results-count

# Restricted: direct identifiers and free-text notes (treating unit only)
curl -s -H "$T" "$B?type=${HL7}Patient,${HL7}DocumentReference&scopeQ=/Classification/Restricted/%23&limit=2" | jq
2. By scenario (scope plus pick for attribute level)

bash
# HEALTH-S2 public dashboard
curl -s -H "$T" "$B?type=${HED}EDWeeklyStatistic&scopeQ=/Classification/Public/%23&limit=100" | jq

# HEALTH-S3 AI vendor: triage-time fields only, no patient link, no diagnoses
curl -s -H "$T" "$B?type=${HL7}Encounter&scopeQ=/Classification/Confidential/HealthData&limit=3&pick=${HED}arrivalMode,${HED}triageCategory,${HED}systolicBloodPressure,${HED}diastolicBloodPressure,${HED}heartRate,${HED}respiratoryRate,${HED}bodyTemperature,${HED}oxygenSaturation,${HED}painScore,${HED}ageBand,${HED}sex,${HED}dischargeDisposition,${HED}lengthOfStay" | jq
For HEALTH-S1, the research pick list is 26 attributes long. To print that exact query, run:

bash
python3 scripts/query_scenario.py HEALTH-S1
3. Scope combined with a normal filter

bash
# Public ILI cells for Turku
curl -s -H "$T" "$B?type=${HED}EDWeeklyStatistic&scopeQ=/Classification/Public/%23&q=${HED}municipality==%22Turku%22;${HED}diagnosisGroup==%22ILI%22" | jq
Scope syntax:

Pattern	Matches
/A/B	exactly that scope
/A/%23 (/A/#)	A and everything below it
/A/+	direct children of A only
;	AND
,	OR
For example, scopeQ=/Classification/Public/%23,/Classification/Internal/%23 matches anything Public or Internal.

Short names instead of IRIs: load the entities with --context-mode url --serve-context 8090 and add this header:

bash
-H 'Link: <http://host.docker.internal:8090/context.jsonld>; rel="http://www.w3.org/ns/json-ld#context"; type="application/ld+json"'
Then you can write type=Encounter&pick=triageCategory,ageBand instead of full IRIs.

