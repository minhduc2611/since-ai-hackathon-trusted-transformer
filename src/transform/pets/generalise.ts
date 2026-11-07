import { coarsenTimestamp } from "./timestamp.js";

/*
Coarsen a value by subtype, optionally refining timestamps.
*/
export function generalise(value: string, subtype: string, level?: string): string {
  if (!value) return "";
  switch (subtype) {
    case "BIRTH_DATE":
      return birthToAgeBand(value);
    case "POSTCODE":
      return value.length >= 3 ? `${value.slice(0, 3)}**` : value;
    case "TIMESTAMP":
    case "DATE":
      return coarsenTimestamp(value, level);
    case "DIAGNOSIS_CODE":
      return value.slice(0, 3);
    case "AGE":
      return ageBand(Number(value));
    default:
      return value;
  }
}

/*
Convert a birth date into a decade age band.
*/
function birthToAgeBand(isoOrFi: string): string {
  const year = parseBirthYear(isoOrFi);
  if (year == null) return "";
  return ageBand(new Date().getFullYear() - year);
}

/*
Extract a birth year from ISO or Finnish date formats.
*/
function parseBirthYear(v: string): number | null {
  const iso = v.match(/^(\d{4})-/);
  if (iso) return Number(iso[1]);
  const fi = v.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  return fi ? Number(fi[3]) : null;
}

/*
Format an age as a decade band string.
*/
function ageBand(age: number): string {
  if (!Number.isFinite(age) || age < 0) return "";
  if (age >= 80) return "80+";
  const lo = Math.floor(age / 10) * 10;
  return `${lo}-${lo + 9}`;
}
