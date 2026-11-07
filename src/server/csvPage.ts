import fs from "node:fs";
import { parse } from "csv-parse";
import type { Row } from "../shared/api.js";
import { HttpError } from "./http.js";

const countCache = new Map<string, { mtimeMs: number; count: number }>();

/*
Create a csv-parse configuration for streaming.
*/
function parser(columns: boolean) {
  return parse({ columns, bom: true, relax_quotes: true, relax_column_count: true, skip_empty_lines: true });
}

/*
Read one page of CSV rows by streaming.
*/
export async function readCsvPage(file: string, offset: number, limit: number): Promise<{ headers: string[]; rows: Row[] }> {
  requireFile(file);
  const stream = openCsv(file);
  try {
    let headers: string[] = [];
    const rows: Row[] = [];
    let index = -1;
    for await (const record of stream.pipe(parser(false)) as AsyncIterable<string[]>) {
      if (index === -1) headers = record;
      else if (index >= offset) rows.push(toRow(headers, record));
      index += 1;
      if (rows.length >= limit) break;
    }
    return { headers, rows };
  } finally {
    stream.destroy();
  }
}

/*
Count data rows in a CSV, cached by modification time.
*/
export async function countCsvRows(file: string): Promise<number> {
  requireFile(file);
  const { mtimeMs } = fs.statSync(file);
  const cached = countCache.get(file);
  if (cached && cached.mtimeMs === mtimeMs) return cached.count;
  const stream = openCsv(file);
  try {
    let count = -1;
    for await (const _ of stream.pipe(parser(false))) count += 1;
    const total = Math.max(0, count);
    countCache.set(file, { mtimeMs, count: total });
    return total;
  } finally {
    stream.destroy();
  }
}

/*
Read only the header row of a CSV file.
*/
export async function readCsvHeaders(file: string): Promise<string[]> {
  return (await readCsvPage(file, 0, 0)).headers;
}

/*
Throw 404 if a CSV file is missing.
*/
function requireFile(file: string): void {
  if (!fs.existsSync(file)) throw new HttpError(404, `CSV not found: ${file}`);
}

/*
Open a CSV read stream that destroys itself on error.
*/
function openCsv(file: string): fs.ReadStream {
  const stream = fs.createReadStream(file);
  stream.on("error", () => stream.destroy());
  return stream;
}

/*
Map a CSV record array onto a header-keyed row.
*/
function toRow(headers: string[], record: string[]): Row {
  const row: Row = {};
  headers.forEach((h, i) => {
    row[h] = record[i] ?? "";
  });
  return row;
}
