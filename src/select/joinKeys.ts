import type { PetDecision } from "../types.js";

/*
Align PET choices for join keys so joins survive across tables.
*/
export function alignJoinKeys(decisions: PetDecision[]): PetDecision[] {
  const keys = new Set(decisions.filter((d) => d.privacy_role === "record_key").map((d) => d.column));
  const pseudonymised = new Set(
    decisions.filter((d) => keys.has(d.column) && d.pet === "pseudonym").map((d) => d.column),
  );
  return decisions.map((d) => {
    if (!keys.has(d.column)) return d;
    const pet = pseudonymised.has(d.column) ? "pseudonym" : "keep";
    if (pet === d.pet) return d;
    return { ...d, pet, reason: `join key ${d.column} → ${pet} in every table so joins survive` };
  });
}
