import { hmacToken } from "../../lib/hmac.js";

/*
Replace a value with a keyed HMAC token.
*/
export function pseudonymise(value: string, prefix = "t_"): string {
  return hmacToken(value, prefix);
}

/*
Rename a NATIONAL_ID column to the dataset's person pseudonym key.
*/
export function personKeyName(column: string, subtype: string, dataset: string): string {
  if (subtype !== "NATIONAL_ID" && !/hetu/i.test(column)) return column;
  return dataset === "health" ? "patient_pseudonym" : "person_pseudonym";
}
