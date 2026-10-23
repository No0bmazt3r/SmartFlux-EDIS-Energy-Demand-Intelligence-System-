// Shared run state: every agent reads and writes this one object (proposal §11.3).
import type { Config, Mode } from "../config.ts";

export const WINDOW = { start: "2026-09-07", end: "2026-10-18" };

export type Lang = "en" | "ms";
export type Risk = "read_only" | "advisory" | "operational" | "financial";
export type Intent =
  | "energy_plan" | "tariff_decision" | "bill_investigation" | "machine_health"
  | "advice_followup" | "load_shift_plan" | "esg_summary" | "out_of_scope";

export type RunRequest = { outlet_id: string; as_of: string; question?: string; lang?: Lang; briefing?: boolean };

// kind picks the Investigator recipe and the Skeptic check; reason says why a hypothesis was ruled out.
export type HypothesisKind = "tou" | "energy" | "fault" | "humidity" | "traffic" | "holiday" | "bill" | "verify";
export type Hypothesis = { id: string; intent: Intent; kind: HypothesisKind; text: string; status: "open" | "supported" | "rejected" | "unresolved"; reason?: string };
export type Evidence = { id: string; kind: "query" | "calc"; name: string; params: Record<string, unknown>; summary: string; output: unknown };
export type Claim = {
  id: string; hypothesis_id: string; kind: HypothesisKind; text: string;
  data: Record<string, any>; evidence: string[];
  status: "proposed" | "approved" | "rejected"; reason?: string;
};
export type ProposedAction = { id: string; type: string; target: string; reason: string; risk: Risk; status: "awaiting_approval" | "approved" | "rejected" };

export type Decision = {
  type: "briefing" | "energy_plan" | "tariff" | "machine_fault" | "bill_explanation" | "verification" | "load_shift" | "esg";
  verdict: string; rm_per_month?: number; confidence: "high" | "medium" | "low";
  evidence: string[]; ruled_out: string[]; assumptions: string[];
};

export type RunState = {
  run_id: string; as_of: string; outlet_id: string; question: string; lang: Lang;
  intents: Intent[]; risk: Risk; refused: boolean; briefing: boolean;
  hypotheses: Hypothesis[]; evidence: Evidence[]; claims: Claim[]; actions: ProposedAction[];
  decisions: Decision[]; unresolved: string[]; memory: string[]; // H-MEM context reinjected into the Planner
  counters: { tool_calls: number; replans: number; rejections: Record<string, number> };
  caps: Config["caps"]; mode: Mode; needsReplan: boolean;
  analysis?: Record<string, any>; // memo of shared Investigator work (e.g. one machine regression for several hypotheses)
};

export type RunResult = {
  run_id: string; mode: string; outlet_id: string; as_of: string;
  decisions: Decision[]; actions: ProposedAction[]; unresolved: string[]; log: string;
};

export function validateRequest(body: unknown): RunRequest {
  const b = body as Partial<RunRequest> | null;
  if (!b || typeof b !== "object") throw new Error("Request must be a JSON object");
  if (typeof b.outlet_id !== "string" || !/^OUT-\d{2}$/.test(b.outlet_id)) throw new Error("outlet_id must look like OUT-01");
  if (typeof b.as_of !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(b.as_of)) throw new Error("as_of must be a YYYY-MM-DD date");
  if (b.as_of < WINDOW.start || b.as_of > WINDOW.end) throw new Error(`as_of must be within the data window ${WINDOW.start}..${WINDOW.end}`);
  if (b.question !== undefined && typeof b.question !== "string") throw new Error("question must be a string");
  if (!b.question && !b.briefing) throw new Error("Give a question, or set briefing: true");
  if (b.lang !== undefined && b.lang !== "en" && b.lang !== "ms") throw new Error('lang must be "en" or "ms"');
  return { outlet_id: b.outlet_id, as_of: b.as_of, question: b.question, lang: b.lang, briefing: b.briefing };
}
