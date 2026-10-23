// Hard limits per run (FR-14). When one is hit the Reporter lists the rest as unresolved, never as findings.
import type { RunState } from "./state.ts";

export function capsHit(state: RunState): string | undefined {
  if (state.counters.tool_calls >= state.caps.toolCalls) return `tool-call cap (${state.caps.toolCalls})`;
  return undefined;
}

export function rejectionCapHit(state: RunState, claimId: string) {
  return (state.counters.rejections[claimId] ?? 0) >= state.caps.rejectionsPerClaim;
}
