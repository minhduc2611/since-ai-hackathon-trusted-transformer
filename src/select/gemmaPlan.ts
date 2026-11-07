import type { PetDecision } from "../types.js";
import { proposeForTable, type ColumnAsk, type SelectContext } from "./gemmaSelect.js";
import { allowedOptions, validateProposal } from "./guardrails.js";
import { tasksNeeding } from "./scenarioTasks.js";

export interface GemmaPlanStats {
  asked: number;
  accepted: number;
  rejected: number;
  failedTables: string[];
}

/*
Let Gemma refine rule-based decisions table by table, within the guardrails.
*/
export async function refineWithGemma(decisions: PetDecision[], ctx: SelectContext): Promise<{ decisions: PetDecision[]; stats: GemmaPlanStats }> {
  const stats: GemmaPlanStats = { asked: 0, accepted: 0, rejected: 0, failedTables: [] };
  const out = [...decisions];
  for (const table of [...new Set(decisions.map((d) => d.table))]) {
    const asks = openColumns(out, table, ctx);
    if (!asks.length) continue;
    stats.asked += asks.length;
    try {
      const proposals = await proposeForTable(table, asks.map((a) => a.ask), ctx);
      for (const a of asks) applyProposal(out, a.index, a.ask, proposals.get(a.ask.label.column), stats);
    } catch {
      stats.failedTables.push(table);
    }
  }
  return { decisions: out, stats };
}

/*
Columns of a table that Gemma may decide: those with more than one legal option.
*/
function openColumns(decisions: PetDecision[], table: string, ctx: SelectContext): Array<{ index: number; ask: ColumnAsk }> {
  const asks: Array<{ index: number; ask: ColumnAsk }> = [];
  decisions.forEach((d, index) => {
    if (d.table !== table) return;
    const needed = tasksNeeding(ctx.tasks, d.column, d.subtype).length > 0;
    const options = allowedOptions(d, ctx.trust, d.pet, needed);
    if (options.pets.length > 1 || options.levels.length > 1) asks.push({ index, ask: { label: d, options } });
  });
  return asks;
}

/*
Replace one decision with Gemma's proposal if it passes validation.
*/
function applyProposal(
  out: PetDecision[],
  index: number,
  ask: ColumnAsk,
  proposal: Parameters<typeof validateProposal>[0] | undefined,
  stats: GemmaPlanStats,
): void {
  const valid = proposal ? validateProposal(proposal, ask.options) : null;
  if (!valid) {
    stats.rejected += 1;
    return;
  }
  stats.accepted += 1;
  const reason = String(proposal?.reason ?? "").slice(0, 160) || "chosen for this scenario";
  out[index] = { ...out[index], pet: valid.pet, level: valid.level, decided_by: "gemma", reason: `Gemma: ${reason}` };
}
