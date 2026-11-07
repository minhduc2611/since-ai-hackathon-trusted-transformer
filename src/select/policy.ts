import { findScenario } from "../lib/scenarios.js";
import type { FieldLabel, PetAction, TrustLevel } from "../types.js";

const BY_TRUST: Record<TrustLevel, Record<string, PetAction>> = {
  public: {
    direct_identifier: "suppress",
    quasi_identifier: "aggregate_or_generalise",
    sensitive_attribute: "aggregate",
    technical_identifier: "suppress",
    free_text: "suppress",
    record_key: "keep",
    non_sensitive: "keep",
  },
  controlled_research: {
    direct_identifier: "pseudonym_or_suppress",
    quasi_identifier: "generalise",
    sensitive_attribute: "keep",
    technical_identifier: "keep",
    free_text: "redact",
    record_key: "keep",
    non_sensitive: "keep",
  },
  contractual: {
    direct_identifier: "suppress",
    quasi_identifier: "generalise",
    sensitive_attribute: "keep",
    technical_identifier: "pseudonym",
    free_text: "redact",
    record_key: "keep",
    non_sensitive: "keep",
  },
};

const SUBTYPE_OVERRIDE: Record<string, Partial<Record<TrustLevel, PetAction>>> = {
  NATIONAL_ID: { controlled_research: "pseudonym" },
  PERSON_NAME: { controlled_research: "suppress" },
  PHONE: { controlled_research: "suppress" },
  EMAIL: { controlled_research: "suppress" },
  STREET_ADDRESS: { controlled_research: "suppress" },
  POSTCODE: { controlled_research: "generalise" },
  BIRTH_DATE: { controlled_research: "generalise" },
  DIAGNOSIS_CODE: { controlled_research: "generalise" },
  FREE_TEXT: { controlled_research: "redact" },
  EMPLOYEE_ID: { controlled_research: "pseudonym" },
  DEVICE_ID: { controlled_research: "pseudonym" },
  BANK_ACCOUNT: { controlled_research: "pseudonym" },
  PAYMENT_CARD: { controlled_research: "pseudonym" },
  IP_ADDRESS: { controlled_research: "suppress", contractual: "suppress" },
};

/*
Resolve the trust level for a scenario id.
*/
export function trustFromScenario(scenarioId: string): TrustLevel {
  const declared = findScenario(scenarioId)?.trust_level;
  if (declared === "public" || declared === "contractual") return declared;
  if (declared) return "controlled_research";
  if (/-S2$/i.test(scenarioId)) return "public";
  if (/-S3$/i.test(scenarioId)) return "contractual";
  return "controlled_research";
}

/*
Choose a PET action for one labelled column.
*/
export function choosePet(label: FieldLabel, trust: TrustLevel): PetAction {
  const sub = SUBTYPE_OVERRIDE[label.subtype]?.[trust];
  if (sub) return sub;
  return BY_TRUST[trust][label.privacy_role] || "keep";
}

/*
Build a short explanation string for a PET choice.
*/
export function reasonFor(label: FieldLabel, pet: PetAction, trust: TrustLevel): string {
  return `${label.privacy_role}/${label.subtype} → ${pet} under ${trust}`;
}
