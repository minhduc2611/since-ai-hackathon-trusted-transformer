import type { PetDecision } from "../types.js";

/*
Build a human-readable field inventory for the demo.
*/
export function buildInventory(decisions: PetDecision[]): string[] {
  const lines: string[] = ["# Field inventory", ""];
  const tables = [...new Set(decisions.map((d) => d.table))];
  for (const table of tables) {
    lines.push(`## ${table}`);
    for (const d of decisions.filter((x) => x.table === table)) {
      lines.push(`- ${d.column}: ${d.privacy_role}/${d.subtype} → **${d.pet}**`);
    }
    lines.push("");
  }
  return lines;
}

/*
Count how many decisions use each PET action.
*/
export function countByPet(decisions: PetDecision[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const d of decisions) out[d.pet] = (out[d.pet] || 0) + 1;
  return out;
}
