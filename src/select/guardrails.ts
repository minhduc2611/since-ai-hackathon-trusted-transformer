import type { FieldLabel, PetAction, TrustLevel } from "../types.js";

export interface PetOptions {
  pets: PetAction[];
  /** Allowed generalisation levels; "default" means the subtype's built-in coarsening. */
  levels: string[];
}

export interface Proposal {
  pet?: string;
  level?: string;
  reason?: string;
}

const STRICTNESS: Record<PetAction, number> = {
  keep: 0,
  generalise: 1,
  aggregate_or_generalise: 1,
  redact: 1,
  pseudonym: 2,
  pseudonym_or_suppress: 2,
  aggregate: 3,
  suppress: 3,
};

const LOOSENABLE_ROLES = new Set(["quasi_identifier", "non_sensitive"]);
const TIME_LEVELS = ["time_of_day", "iso_week", "date", "hour"];
const RARE_LEVELS = ["min_count_20", "min_count_100", "min_count_1000"];
const BUILT_IN = new Set(["POSTCODE", "BIRTH_DATE", "DIAGNOSIS_CODE", "AGE"]);

/*
Options Gemma may pick for a column; identifiers and text can never be looser than the rule,
and columns a required task reads cannot be suppressed.
*/
export function allowedOptions(label: FieldLabel, trust: TrustLevel, rulePet: PetAction, needed: boolean): PetOptions {
  const floor = LOOSENABLE_ROLES.has(label.privacy_role) ? 0 : STRICTNESS[rulePet];
  let pets = candidatePets(label, trust).filter((p) => STRICTNESS[p] >= floor);
  if (needed || isHarmless(label, trust)) {
    const kept = pets.filter((p) => p !== "suppress");
    if (kept.length) pets = kept;
  }
  return { pets, levels: pets.includes("generalise") ? levelsFor(label) : [] };
}

/*
Non-identifying columns only need suppression in public releases.
*/
function isHarmless(label: FieldLabel, trust: TrustLevel): boolean {
  const role = label.privacy_role;
  return trust !== "public" && (role === "sensitive_attribute" || role === "non_sensitive");
}

/*
Candidate PETs that make sense for a column's role.
*/
function candidatePets(label: FieldLabel, trust: TrustLevel): PetAction[] {
  switch (label.privacy_role) {
    case "free_text":
      return ["redact", "suppress"];
    case "direct_identifier":
      return trust === "public" ? ["suppress"] : ["pseudonym", "suppress"];
    case "technical_identifier":
      return ["keep", "pseudonym", "suppress"];
    case "record_key":
      return ["keep", "pseudonym"];
    default:
      return canGeneralise(label) ? ["keep", "generalise", "suppress"] : ["keep", "suppress"];
  }
}

/*
Whether generalisation actually changes values for this column.
*/
function canGeneralise(label: FieldLabel): boolean {
  return label.privacy_role === "quasi_identifier" || BUILT_IN.has(label.subtype) || isTime(label);
}

/*
Generalisation levels that the transform step can apply to this subtype.
*/
function levelsFor(label: FieldLabel): string[] {
  if (isTime(label)) return TIME_LEVELS;
  if (BUILT_IN.has(label.subtype)) return ["default"];
  return RARE_LEVELS;
}

/*
Whether a column holds timestamps or dates.
*/
function isTime(label: FieldLabel): boolean {
  return label.subtype === "TIMESTAMP" || label.subtype === "DATE";
}

/*
Accept a Gemma proposal only if it is one of the allowed options.
*/
export function validateProposal(p: Proposal, options: PetOptions): { pet: PetAction; level?: string } | null {
  const pet = options.pets.find((x) => x === p.pet);
  if (!pet) return null;
  if (pet !== "generalise") return { pet };
  const level = options.levels.find((l) => l === p.level) ?? options.levels[0];
  return { pet, level: level === "default" || level === "hour" ? undefined : level };
}
