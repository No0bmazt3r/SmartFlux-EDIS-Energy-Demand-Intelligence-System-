// Weekly autonomous briefing (proposal §11.6): every Monday 08:00 Malaysia time, one run per outlet with
// no owner question. Also callable on demand: pnpm agent --briefing --as-of 2026-10-18.
// ponytail: in-process timer; a production deployment would use a job runner.
import { openSampleDb } from "./adapters/local-sqlite.ts";
import type { Config } from "./config.ts";
import { run } from "./orchestrator/run.ts";
import { WINDOW } from "./orchestrator/state.ts";
import { addDays } from "./orchestrator/windows.ts";

export async function runBriefings(cfg: Config, asOf: string, outlets?: string[]) {
  const ids = outlets ?? (openSampleDb(cfg.dataDir).prepare("SELECT outlet_id FROM outlets ORDER BY outlet_id").all() as { outlet_id: string }[]).map((o) => o.outlet_id);
  const results = [];
  for (const outlet_id of ids) results.push(await run({ outlet_id, as_of: asOf, briefing: true }, cfg, { echo: false }));
  return results;
}

// Malaysia is UTC+8 with no daylight saving.
const myt = (d: Date) => new Date(d.getTime() + 8 * 3600_000);

export function startScheduler(cfg: Config, now = () => new Date()) {
  let lastRun = "";
  const tick = async () => {
    const t = myt(now()), today = t.toISOString().slice(0, 10);
    if (t.getUTCDay() !== 1 || t.getUTCHours() !== 8 || lastRun === today) return;
    lastRun = today;
    const asOf = [addDays(today, -1), WINDOW.end].sort()[0]; // the data window is fixed; never brief past its end
    const results = await runBriefings(cfg, asOf);
    console.log(`Weekly briefing ${today}: ${results.map((r) => `${r.outlet_id} ${r.run_id}`).join(", ")}`);
  };
  const timer = setInterval(() => tick().catch((e) => console.error(`Briefing failed: ${e.message}`)), 60_000);
  timer.unref();
  return { tick, stop: () => clearInterval(timer) };
}
