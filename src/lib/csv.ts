import fs from "node:fs";

export type CsvRow = Record<string, string>;
/*
Read a CSV file into headers and row objects.
*/
export function readCsv(filePath: string): { headers: string[]; rows: CsvRow[] } {
  const text = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
  const lines = splitLines(text);
  if (!lines.length) return { headers: [], rows: [] };
  const headers = parseRow(lines[0]);
  const rows = lines.slice(1).filter(Boolean).map((line) => rowToObject(headers, parseRow(line)));
  return { headers, rows };
}

/*
Write headers and rows to a CSV file.
*/
export function writeCsv(
  filePath: string,
  headers: string[],
  rows: Array<Record<string, unknown>>,
): void {
  const lines = [headers.map(escapeCell).join(",")];
  for (const row of rows) {
    lines.push(headers.map((h) => escapeCell(row[h])).join(","));
  }
  fs.writeFileSync(filePath, `${lines.join("\n")}\n`, "utf8");
}

/*
Map a list of cells onto a header-keyed object.
*/
function rowToObject(headers: string[], cells: string[]): CsvRow {
  const obj: CsvRow = {};
  headers.forEach((h, i) => {
    obj[h] = cells[i] ?? "";
  });
  return obj;
}

/*
Split CSV text into lines while respecting quoted newlines.
*/
function splitLines(text: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') inQ = !inQ;
    if ((ch === "\n" || ch === "\r") && !inQ) {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  if (cur) out.push(cur);
  return out;
}

/*
Parse one CSV line into cell strings.
*/
function parseRow(line: string): string[] {
  const cells: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQ && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else inQ = !inQ;
    } else if (ch === "," && !inQ) {
      cells.push(cur);
      cur = "";
    } else cur += ch;
  }
  cells.push(cur);
  return cells;
}

/*
Escape a cell value for CSV output.
*/
function escapeCell(v: unknown): string {
  const s = v == null ? "" : String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
