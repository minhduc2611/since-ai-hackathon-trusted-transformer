import type { PrivacyRole } from "../types.js";

export interface RuleLabel {
  privacy_role: PrivacyRole;
  subtype: string;
  confidence: number;
  source: string;
  error?: string;
}

type Triple = [RegExp, PrivacyRole, string];

const NAME_RULES: Triple[] = [
  [/hetu|ssn|national|henkilotunnus/i, "direct_identifier", "NATIONAL_ID"],
  [/iban|account_n(o|umber)/i, "direct_identifier", "BANK_ACCOUNT"],
  [/contract_n(o|umber)|customer_n(o|umber)|policy_n(o|umber)|membership_n(o|umber)/i, "direct_identifier", "ACCOUNT_ID"],
  [/card_pan|(^|_)pan$|card_number/i, "direct_identifier", "PAYMENT_CARD"],
  [/ip_addr|(^|_)ip$/i, "technical_identifier", "IP_ADDRESS"],
  [/merchant_name|company_name/i, "non_sensitive", "ORGANISATION"],
  [/(^|_)name$|patient_name|physician_name|author_name|holder/i, "direct_identifier", "PERSON_NAME"],
  [/staff_id|physician_id|employee/i, "technical_identifier", "EMPLOYEE_ID"],
  [/ambulance|device_id|unit$/i, "technical_identifier", "DEVICE_ID"],
  [/e_?mail/i, "direct_identifier", "EMAIL"],
  [/phone|mobile|puhelin/i, "direct_identifier", "PHONE"],
  [/address|street|osoite/i, "direct_identifier", "STREET_ADDRESS"],
  [/birth|dob|syntym/i, "quasi_identifier", "BIRTH_DATE"],
  [/(^|_)sex$|gender/i, "quasi_identifier", "SEX"],
  [/postcode|zip|postal/i, "quasi_identifier", "POSTCODE"],
  [/municipality|city|town/i, "quasi_identifier", "MUNICIPALITY"],
  [/_ts$|timestamp|_at$/i, "quasi_identifier", "TIMESTAMP"],
  [/_mode$|^language$/i, "quasi_identifier", "CATEGORY"],
  [/icd|diagnos/i, "sensitive_attribute", "DIAGNOSIS_CODE"],
  [/note_text|chief_complaint|complaint|message|comment|^description$/i, "free_text", "FREE_TEXT"],
  [/triage|disposition|los_|readmit|heart_rate|temp_c|spo2|pain|bp/i, "sensitive_attribute", "HEALTH_DATA"],
]

const VALUE_RULES: Triple[] = [
  [/^\d{6}[-+A-FU-Y]\d{3}[0-9A-Y]$/, "direct_identifier", "NATIONAL_ID"],
  [/^[\w.+-]+@[\w.-]+$/, "direct_identifier", "EMAIL"],
  [/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/, "direct_identifier", "BANK_ACCOUNT"],
  [/^\d{1,3}(\.\d{1,3}){3}$/, "technical_identifier", "IP_ADDRESS"],
  [/^(?:\+358|0)[\d\s-]{6,}$/, "direct_identifier", "PHONE"],
  [/^\d{5}$/, "quasi_identifier", "POSTCODE"],
  [/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/, "quasi_identifier", "TIMESTAMP"],
];

/*
Classify a column using name and value rules.
*/
export function classifyByRules(column: string, samples: string[], table: string): RuleLabel {
  const byValue = sniffValues(samples);
  if (byValue) return { ...byValue, confidence: 0.9, source: "value" };
  const byNameEarly = sniffName(column);
  if (byNameEarly && (byNameEarly.subtype === "EMPLOYEE_ID" || byNameEarly.subtype === "DEVICE_ID")) {
    return { ...byNameEarly, confidence: 0.85, source: "name" };
  }
  if (/_id$/i.test(column)) return idFallback(column, table);
  if (looksLikeFreeText(samples)) {
    return { privacy_role: "free_text", subtype: "FREE_TEXT", confidence: 0.85, source: "shape" };
  }
  const byName = sniffName(column);
  if (byName) return { ...byName, confidence: 0.8, source: "name" };
  return idFallback(column, table);
}

/*
Infer a privacy role from the column name.
*/
function sniffName(column: string): { privacy_role: PrivacyRole; subtype: string } | null {
  for (const [rx, role, subtype] of NAME_RULES) {
    if (rx.test(column)) return { privacy_role: role, subtype };
  }
  return null;
}

/*
Infer a privacy role from sample value patterns.
*/
function sniffValues(samples: string[]): { privacy_role: PrivacyRole; subtype: string } | null {
  if (!samples.length) return null;
  for (const [rx, role, subtype] of VALUE_RULES) {
    const hit = samples.filter((v) => rx.test(v)).length / samples.length;
    if (hit >= 0.6) return { privacy_role: role, subtype };
  }
  return null;
}

/*
Detect whether samples look like free-text prose.
*/
function looksLikeFreeText(samples: string[]): boolean {
  if (samples.length < 2) return false;
  const avg = samples.reduce((s, v) => s + v.length, 0) / samples.length;
  const spaces = samples.filter((v) => v.includes(" ")).length / samples.length;
  return avg > 40 && spaces > 0.8;
}

/*
Fall back to a record-key or technical-id label for _id columns.
*/
function idFallback(column: string, table: string): RuleLabel {
  if (/_id$/i.test(column) && column.toLowerCase().startsWith(table.slice(0, 4))) {
    return { privacy_role: "record_key", subtype: "RECORD_ID", confidence: 0.7, source: "name" };
  }
  if (/_id$/i.test(column)) {
    return { privacy_role: "technical_identifier", subtype: "RECORD_ID", confidence: 0.55, source: "name" };
  }
  return { privacy_role: "non_sensitive", subtype: "OTHER", confidence: 0.35, source: "fallback" };
}
