# Health ED data model with built-in classification (proposal)

Synthetic Aurajoki Regional Hospital emergency-department data (2025) as NGSI-LD, tenant **`health-trusted`**.
The use case is **data classification**: each entity, and each attribute where it matters, carries its
classification tier, so a requester gets only what its scenario allows.

## 1. Entity types

The types come from Smart Data Models **dataModel.Hl7** (derived from HL7 FHIR R4B). Element names follow FHIR, flattened to NGSI-LD
Properties and Relationships (the SDM Hl7 schemas keep FHIR's nested structures). One new type covers the published table.

| Type | Namespace | FHIR resource | Source | Entities | Entity scope |
|---|---|---|---|---:|---|
| `Patient` | SDM Hl7 | Patient | `ed_visits.csv` identity columns | 26,873 | `/Classification/Restricted/DirectIdentifier` |
| `Practitioner` | SDM Hl7 | Practitioner | physicians in visits, note authors | 400 | `/Classification/Internal/Staff` |
| `Encounter` | SDM Hl7 | Encounter | `ed_visits.csv` (one per visit) | 46,398 | `/Classification/Confidential/HealthData` |
| `Observation` | SDM Hl7 | Observation (laboratory) | `lab_results.csv` | 130,341 | `/Classification/Confidential/HealthData` |
| `DocumentReference` | SDM Hl7 | DocumentReference | `clinical_notes.csv` | 30,103 | `/Classification/Restricted/FreeText` |
| `EDWeeklyStatistic` | new, `health-ed` | MeasureReport (stratified count) | `published_weekly_stats.csv` | 999 + 29,170 | `/Classification/Public/Aggregate` when visits ≥ 5, else `/Classification/Confidential/SmallCell` |

```
Patient ◄─subject── Encounter ──attendingPractitioner──► Practitioner
   ▲                  ▲     ▲
   │subject  encounter│     │encounter
Observation ──────────┘   DocumentReference ──author──► Practitioner
```

The split is the core design choice: **identity and record are separate entities**.
- `Patient` holds only direct identifiers: identity code, name, birth date, phones, address.
- The clinical record (`Encounter`, `Observation`) points to the patient through a pseudonymous id: `urn:ngsi-ld:Patient:aurajoki:P-<HMAC-SHA256>`.
- Free text, which the README warns contains identifiers, is in its own type (`DocumentReference`).

As a result, most of the classification is decided by **which entity type** a request touches.

## 2. Classification: three levels

**Entity level: NGSI-LD Scopes (GS CIM 009, clauses 4.18 and 4.19).** Every entity has `scope`. Scopes are hierarchical:
```
/Classification/Public/Aggregate
/Classification/Internal/Staff
/Classification/Confidential/{HealthData, QuasiIdentifier, Pseudonym, SmallCell}
/Classification/Restricted/{DirectIdentifier, FreeText, QuasiIdentifier}
```
A requester asks with `scopeQ`:
- `scopeQ=/Classification/Public/#` matches Public and everything below it.
- `scopeQ=/Classification/Confidential/HealthData` matches exactly that scope.

**Attribute level, in the data.** An attribute that is *stricter* than its entity carries a `classification` sub-property. Two attributes of `Encounter` do:
- `chiefComplaint` is free text: `/Classification/Restricted/FreeText`.
- `ambulanceUnit` is a call sign: `/Classification/Restricted/QuasiIdentifier`.

**Attribute level, in the model.** Every property in `schemas/<Type>.schema.json` has `x-ngsi-ld-classification` (and `x-fhir-r4b`, its FHIR source element). For example, in `Encounter`:
- `arrivalDateTime`, `ageAtArrival` and `residenceMunicipality` are `Confidential/QuasiIdentifier`;
- `subject` is `Confidential/Pseudonym`.

A requester gets only the attributes it may see with **`pick`** (Attribute Projection Language, clause 4.21).

## 3. Sharing scenarios → NGSI-LD requests

These are defined in `classification-policy.json`. Run `scripts/query_scenario.py <scenario> --offline` to see the actual result.

| Scenario | Request | Gets | Does not get |
|---|---|---|---|
| Treating unit | all types, `scopeQ=/Classification/#` | everything | — |
| **HEALTH-S1** research (controlled environment) | `Encounter` + `Observation` with `scopeQ=…/Confidential/HealthData`, `pick` = Confidential attributes; `EDWeeklyStatistic` Public | pseudonymised visits and labs, the pseudonym (for 30-day revisits), exact times | Patient, notes, staff names, `chiefComplaint`, `ambulanceUnit` |
| **HEALTH-S2** public dashboard | `EDWeeklyStatistic`, `scopeQ=/Classification/Public/#` | 999 cells with ≥ 5 visits | 29,170 small cells (97% of the table) |
| **HEALTH-S3** AI vendor | `Encounter`, `pick` = 13 triage-time attributes + label | triage, vitals, pain, age band, sex, arrival mode, disposition, length of stay | patient link, exact times, exact age, municipality, diagnoses (label leakage), labs, notes |

## 4. What this does and does not do
- **`scopeQ` and `pick` filter; they do not authorise.** A requester can simply leave them out. The rules in `classification-policy.json` must be enforced by the policy decision point in front of the broker, which rewrites or rejects requests that ask for more. In the FIWARE stack that is the Data Space Connector with ODRL policies, one per scenario.
- **`id` is always returned.** Visit ids (`ED25-…`) and the `Encounter` URNs still reach HEALTH-S3. For an external party, re-key ids in the connector or export step.
- **Classification is not anonymisation.** The HEALTH-S1 record is still personal data: it is pseudonymised and contains quasi-identifiers (exact times, age, municipality), which can be linked to the attacker files in the source package. HEALTH-S3 is coarser, but it is *not* tested against those files. The PETs evaluation (k-anonymity, DP on `dp_query_workload_health.json`) is a separate step.
- **Small cells:** the "official" table is unsuppressed on purpose. At k = 5, only 3% of its cells are public, which is a large utility cost for H-U1. Coarser cells (e.g. hospital district × week) would keep more of the table.

## 5. Conversion choices
- **Timestamps** are local Finnish time in the CSVs and are stored as UTC NGSI-LD `DateTime`. Convert back to Europe/Helsinki for the hour-of-day curve (H-U8).
- **Vital signs** are Properties of the `Encounter`. In FHIR they would be separate Observations; keeping them on the `Encounter` keeps one row per visit, and their LOINC codes are listed in `x-fhir-r4b`.
- **Missing values** are omitted, because NGSI-LD has no null, and listed in `missingAttributes` (the same pattern as the agrifood project).
- **Lab results:** numeric values go in `valueQuantity` + `unitText`; others (POS/NEG) go in `valueString`. When the source has no flag, `interpretation` is omitted.
- **Patients:**
  - Patients are keyed by identity code when it exists, otherwise by name + birth date.
  - Each "Tuntematon mies/nainen" (unidentified) arrival is its own Patient.
  - Phones are normalised to E.164, all distinct values are kept, and the latest address is used.
- **Birth date:** if `date_of_birth` is missing, it is derived from the identity code.
- **Pseudonym key:** `scripts/.pseudonym.key`, or `$HEALTH_PSEUDONYM_KEY`. Keep it with the data controller only.

## 6. Namespaces (`context.jsonld`)
- `hl7:` = `https://smartdatamodels.org/dataModel.Hl7/` (types and FHIR elements)
- `sdm:` = `https://smartdatamodels.org/` (`name`, `address`, `telephone`, `dataProvider`, `unitText`)
- `hed:` = `https://uri.fiware.org/ns/data-models/health-ed/` (new terms; proposal, not yet hosted)
