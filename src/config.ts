import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Config } from "./types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const PKG = path.join(ROOT, "TRUSTED_PETS_PROVING_GROUND_2026");

export const config: Config = {
  model: process.env.OLLAMA_MODEL || "gemma4:12b",
  ollamaUrl: process.env.OLLAMA_URL || "http://127.0.0.1:11434/api/generate",
  dataset: process.env.DATASET || "health",
  scenario: process.env.SCENARIO || "HEALTH-S1",
  packageRoot: PKG,
  dataDir: path.join(PKG, "data"),
  outDir: path.join(ROOT, "solution", "out"),
  secret: process.env.PETS_SECRET || "solution-demo-key-rotate-me",
  gemmaSampleSize: 8,
  gemmaMaxColumns: 40,
  gemmaSelect: process.env.GEMMA_SELECT === "1",
};
