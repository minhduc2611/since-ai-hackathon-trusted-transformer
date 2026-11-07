import type { CsvRow } from "../../lib/csv.js";

/** Same code → group map as pets_eval.utility.health.DIAGNOSIS_GROUPS (all codes in the data are exact matches). */
export const DIAGNOSIS_GROUPS: Record<string, string> = {
  "R07.4": "cardiovascular", "I21.4": "cardiovascular", "I48.9": "cardiovascular", "I50.9": "cardiovascular", "I26.9": "cardiovascular",
  "I63.9": "neurological", "G45.9": "neurological", "G40.9": "neurological", R51: "neurological", R55: "other",
  "J18.9": "respiratory", "J44.1": "respiratory", "J45.9": "respiratory", "J10.1": "ILI", "U07.1": "ILI", "J06.9": "ILI",
  "J21.0": "RSV", "H66.9": "other_infection", "R50.9": "other_infection", "A08.4": "gastrointestinal", "R10.4": "gastrointestinal",
  "K35.8": "gastrointestinal", "K80.2": "gastrointestinal", "N20.0": "urological", "N39.0": "urological", "S52.5": "injury",
  "S72.0": "injury", "S93.4": "injury", "S82.6": "injury", "S42.0": "injury", "S06.0": "injury", "S01.8": "injury", "S61.0": "injury",
  "S05.1": "injury", "T23.2": "injury", "F10.0": "intoxication", "T78.2": "allergy", "T63.4": "allergy", "F41.0": "mental_health",
  "F32.9": "mental_health", "F05.9": "mental_health", "F20.0": "mental_health", "E10.1": "endocrine", "E87.1": "endocrine",
  "M54.5": "musculoskeletal", "L03.1": "skin", "O20.0": "pregnancy", "O21.0": "pregnancy", "A41.9": "infection_severe", "Z03.9": "other",
};
export const GROUPS = [...new Set(Object.values(DIAGNOSIS_GROUPS))].sort();
export const AGE_BANDS = ["0-9", "10-19", "20-29", "30-39", "40-49", "50-59", "60-69", "70-79", "80+"];

export interface Visit {
  week: string; month: string; hour: number; age_band: string; diagnosis_group: string;
  municipality: string; triage: string; los: number | null; admitted: number;
}

/*
Derive the analysis fields the scorer uses (pets_eval.utility.health.derive) from raw ed_visits rows.
*/
export function deriveVisits(rows: CsvRow[]): Visit[] {
  return rows.filter((r) => r.disposition !== "cancelled_duplicate").map((r) => {
    const arrival = parseTs(r.arrival_ts);
    const dob = parseTs(r.date_of_birth);
    const los = r.los_minutes === "" ? NaN : Number(r.los_minutes);
    return {
      week: isoWeek(arrival), month: r.arrival_ts.slice(0, 7), hour: arrival.getUTCHours(),
      age_band: isNaN(dob.getTime()) ? "" : ageBand((arrival.getTime() - dob.getTime()) / 86400000 / 365.25),
      diagnosis_group: DIAGNOSIS_GROUPS[r.icd10_primary] ?? "", municipality: r.municipality, triage: r.triage,
      los: Number.isFinite(los) && los >= 0 ? los : null,
      admitted: r.disposition === "admitted_ward" || r.disposition === "icu" ? 1 : 0,
    };
  });
}

export function parseTs(s: string): Date {
  return new Date(s ? `${s.trim().replace(" ", "T")}${s.length > 10 ? "" : "T00:00:00"}Z` : NaN);
}

export function ageBand(age: number): string {
  const lo = Math.min(80, Math.floor(age / 10) * 10);
  return lo >= 80 ? "80+" : `${lo}-${lo + 9}`;
}

/** ISO-8601 week label, e.g. 2025-W01 (matches pandas isocalendar in the scorer). */
export function isoWeek(d: Date): string {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
  const y = t.getUTCFullYear();
  const w = Math.ceil(((t.getTime() - Date.UTC(y, 0, 1)) / 86400000 + 1) / 7);
  return `${y}-W${String(w).padStart(2, "0")}`;
}

/** Thursday of an ISO week (always inside that week and its ISO year). */
export function weekThursday(week: string): Date {
  const [y, w] = week.split("-W").map(Number);
  const jan4 = new Date(Date.UTC(y, 0, 4));
  return new Date(jan4.getTime() + ((w - 1) * 7 + 3 - ((jan4.getUTCDay() || 7) - 1)) * 86400000);
}
