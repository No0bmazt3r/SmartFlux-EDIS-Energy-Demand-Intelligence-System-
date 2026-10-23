// One emit() for every agent step: stdout + logs/<run_id>.jsonl. The Evidence screen reads the same file.
import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

export type LogStatus = "success" | "needs_revision" | "retrying" | "fallback" | "partial_success" | "error";
export type RunMode = "live" | "sample" | "mixed";

export type LogEvent = {
  ts: string; run_id: string; agent_name: string; action: string;
  input_summary: string; output_summary: string; target_agent?: string;
  confidence?: number; retry_count: number; status: LogStatus;
  model?: string; mode: RunMode; ms?: number;
};

export type EmitInput = Omit<LogEvent, "ts" | "run_id" | "mode" | "retry_count" | "status"> & Partial<Pick<LogEvent, "retry_count" | "status">>;
export type Emit = (e: EmitInput) => LogEvent;

// mode() is read on every event, so the log switches to "mixed" from the moment a live service falls back.
export function createLogger(runId: string, mode: () => RunMode, dir: string, echo = true): { emit: Emit; path: string } {
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `${runId}.jsonl`);
  const emit: Emit = (e) => {
    const event: LogEvent = { ts: new Date().toISOString(), run_id: runId, mode: mode(), retry_count: 0, status: "success", ...e };
    const line = JSON.stringify(event);
    appendFileSync(path, line + "\n");
    if (echo) console.log(line);
    return event;
  };
  return { emit, path };
}
