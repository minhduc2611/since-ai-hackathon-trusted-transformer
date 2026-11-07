import path from "node:path";
import { readCsv } from "../lib/csv.js";
import { listCsvTables } from "../lib/fsutil.js";
import { datasetDir } from "../lib/paths.js";
import type { PetDecision } from "../types.js";
import { makeDict, phraseKey, type RedactionDict } from "./pets/redact.js";

const STOP = new Set(
  "a an the and or of to for in on at is it jag det är och med till från hej hei hello hi yes no".split(" "),
);

const LABEL_FOR: Record<string, string> = {
  PERSON_NAME: "[PERSON]",
  NATIONAL_ID: "[NATIONAL_ID]",
  EMAIL: "[EMAIL]",
  PHONE: "[PHONE]",
  STREET_ADDRESS: "[ADDRESS]",
  BANK_ACCOUNT: "[IBAN]",
  ACCOUNT_ID: "[ACCOUNT_NUMBER]",
  CUSTOMER_ID: "[ACCOUNT_NUMBER]",
  PAYMENT_CARD: "[PAYMENT_CARD]",
};

/*
Collect identifier values for free-text redaction.
*/
export function buildRedactionDict(dataset: string, decisions: PetDecision[]): RedactionDict {
  const entries = new Map<string, string>();
  const idCols = decisions.filter((d) => LABEL_FOR[d.subtype] || d.privacy_role === "direct_identifier");
  for (const { table } of listCsvTables(datasetDir(dataset))) {
    addTable(entries, dataset, table, idCols.filter((d) => d.table === table));
  }
  return makeDict(entries);
}

/*
Add identifier values from one table into the redaction map.
*/
function addTable(
  entries: Map<string, string>,
  dataset: string,
  table: string,
  cols: PetDecision[],
): void {
  if (!cols.length) return;
  const { rows } = readCsv(path.join(datasetDir(dataset), `${table}.csv`));
  for (const d of cols) {
    const label = LABEL_FOR[d.subtype] || "[REDACTED]";
    for (const row of rows) addValue(entries, row[d.column] ?? "", label);
  }
}

/*
Add a raw value and its tokens to the redaction map.
*/
function addValue(entries: Map<string, string>, raw: string, label: string): void {
  const value = raw.trim();
  if (value.length < 3) return;
  entries.set(value, label);
  if (!/[A-Za-zÀ-öø-ÿ]/.test(value)) return;
  for (const part of phraseKey(value).split(" ")) {
    if (part.length >= 4 && !STOP.has(part)) entries.set(part, label);
  }
}
