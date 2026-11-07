import fs from "node:fs";
import path from "node:path";

/*
Create a directory and parents if missing.
*/
export function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

/*
List CSV table names and paths in a dataset directory.
*/
export function listCsvTables(datasetDir: string): { table: string; file: string }[] {
  return fs
    .readdirSync(datasetDir)
    .filter((f) => f.endsWith(".csv"))
    .map((f) => ({ table: f.replace(/\.csv$/, ""), file: path.join(datasetDir, f) }));
}

/*
Write a value as pretty-printed JSON.
*/
export function writeJson(filePath: string, value: unknown): void {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

/*
Read and parse a JSON file.
*/
export function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
}
