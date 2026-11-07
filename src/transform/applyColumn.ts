import type { PetDecision } from "../types.js";
import { generalise } from "./pets/generalise.js";
import { personKeyName, pseudonymise } from "./pets/pseudonym.js";
import { redactText, type RedactionDict } from "./pets/redact.js";
import { suppressColumn } from "./pets/suppress.js";

/*
Apply one PET decision to a mutable row.
*/
export function applyColumn(
  row: Record<string, string>,
  decision: PetDecision,
  dict?: RedactionDict,
): string | null {
  const { column, pet, subtype } = decision;
  const value = row[column] ?? "";

  if (pet === "suppress" || pet === "aggregate") {
    suppressColumn(row, column);
    return null;
  }
  if (pet === "pseudonym" || (pet === "pseudonym_or_suppress" && isLinkableId(subtype))) {
    return writePseudonym(row, decision, value);
  }
  if (pet === "pseudonym_or_suppress") {
    suppressColumn(row, column);
    return null;
  }
  if (pet === "generalise" || pet === "aggregate_or_generalise") {
    row[column] = generalise(value, subtype, decision.level);
    return renameIfBirth(row, column, subtype);
  }
  if (pet === "redact") {
    row[column] = redactText(value, dict);
    return column;
  }
  return column;
}

/*
Check whether a subtype should be treated as a linkable id.
*/
function isLinkableId(subtype: string): boolean {
  return ["NATIONAL_ID", "PATIENT_ID", "CUSTOMER_ID", "CARD_ID", "EMPLOYEE_ID", "RECORD_ID"].includes(
    subtype,
  );
}

/*
Write a pseudonymised value, renaming NATIONAL_ID columns when needed.
*/
function writePseudonym(row: Record<string, string>, decision: PetDecision, value: string): string {
  const { column, subtype, dataset } = decision;
  const outName = personKeyName(column, subtype, dataset);
  row[outName] = pseudonymise(value, outName === column ? "t_" : "p_");
  if (outName !== column) delete row[column];
  return outName;
}

/*
Rename a generalised birth-date column to age.
*/
function renameIfBirth(row: Record<string, string>, column: string, subtype: string): string {
  if (subtype !== "BIRTH_DATE") return column;
  row.age = row[column];
  delete row[column];
  return "age";
}
