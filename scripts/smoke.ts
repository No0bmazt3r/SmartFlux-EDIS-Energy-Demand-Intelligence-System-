// Live checks for the sponsor services, read-only. Run after `pnpm zetaris:setup` and once Nightshift is up:
//   pnpm smoke             Zetaris and Nightshift (whichever is configured in .env)
//   pnpm smoke --zetaris   only Zetaris     pnpm smoke --nightshift   only Nightshift
// Zetaris: SELECT 1, SHOW LIGHTNING DATABASES, row counts, the federated query, and the template parity test
// (each template's Lightning SQL vs its SQLite twin on the same sample data, row for row).
// Nightshift: /models lists the pinned Nemotron routes, and each lane answers a chat call.
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { openSampleDb } from "../apps/backend/src/adapters/local-sqlite.ts";
import { createNightshift } from "../apps/backend/src/adapters/llm.ts";
import { createZetaris } from "../apps/backend/src/adapters/zetaris.ts";
import { prepare, querySqlite, TEMPLATES } from "../apps/backend/src/templates/index.ts";
import { statements } from "./sql.ts";

try { process.loadEnvFile(); } catch { /* env from the shell */ }
const { values } = parseArgs({ options: { zetaris: { type: "boolean" }, nightshift: { type: "boolean" } } });
const env = process.env;
const both = !values.zetaris && !values.nightshift;
let failed = 0;
const check = async (name: string, fn: () => Promise<string>) => {
  try { console.log(`PASS ${name}: ${await fn()}`); } catch (e) { failed++; console.log(`FAIL ${name}: ${(e as Error).message.slice(0, 300)}`); }
};

// Representative parameters for each template on the seed-1 sample data.
const AS_OF = "2026-10-18";
const PARAMS: Record<string, Record<string, string | number>> = {
  tou_split: { outlet: "OUT-01", from: "2026-09-07 00:00:00", to: "2026-10-19 00:00:00" },
  interval_series: { outlet: "OUT-01", from: "2026-09-21 00:00:00", to: "2026-09-28 00:00:00" },
  tariff_rates: { outlet: "OUT-01" },
  cycle_overlap: { outlet: "OUT-01", from: "2026-09-21 00:00:00", to: "2026-09-28 00:00:00" },
  machine_list: { outlet: "OUT-02" },
  cycle_duration: { machine: "OUT-01-D4", from: "2026-09-21 00:00:00", to: "2026-10-05 00:00:00" },
  service_history: { machine: "OUT-01-D4" },
  weather_range: { outlet: "OUT-01", from: "2026-09-21 00:00:00", to: "2026-09-28 00:00:00" },
  outlet_info: { outlet: "OUT-02" },
  holidays_range: { from: "2026-09-07", to: "2026-10-19" },
  solar_inputs: { outlet: "OUT-01", from: "2026-10-05 00:00:00", to: "2026-10-12 00:00:00" },
  solar_params: { outlet: "OUT-01" },
  services_range: { outlet: "OUT-01", from: "2026-09-07", to: "2026-10-19" },
};
const canon = (rows: Record<string, unknown>[]) => rows
  .map((r) => JSON.stringify(Object.keys(r).sort().map((k) => [k, typeof r[k] === "number" ? Math.round((r[k] as number) * 1e4) / 1e4 : String(r[k])])))
  .sort();

if ((both || values.zetaris) && env.ZETARIS_API_KEY) {
  const z = createZetaris({ restUrl: env.ZETARIS_REST_URL, baseUrl: env.ZETARIS_BASE_URL, orgId: env.ZETARIS_ORG_ID ?? "1", apiKey: env.ZETARIS_API_KEY, timeoutMs: 120_000 });
  for (const sql of statements(readFileSync("infra/zetaris/04_checks_select.sql", "utf8")))
    await check(`zetaris ${sql.split("\n")[0].slice(0, 60)}`, async () => JSON.stringify((await z.exec(sql)).slice(0, 3)).slice(0, 160));
  const db = openSampleDb("data/sample");
  for (const name of Object.keys(TEMPLATES)) {
    await check(`parity ${name}`, async () => {
      if (!PARAMS[name]) throw new Error("no smoke parameters for this template; add them to scripts/smoke.ts");
      const { t, bound, cap } = prepare(name, PARAMS[name], AS_OF);
      const live = await z.query(t.lightning, bound, cap + 1), local = querySqlite(db, name, PARAMS[name], AS_OF);
      const a = canon(live), b = canon(local);
      if (a.length !== b.length) throw new Error(`${a.length} rows on Zetaris vs ${b.length} locally`);
      const diff = a.findIndex((x, i) => x !== b[i]);
      if (diff >= 0) throw new Error(`row differs:\n  zetaris ${a[diff]}\n  sqlite  ${b[diff]}`);
      return `${a.length} identical rows`;
    });
  }
} else if (values.zetaris) { failed++; console.log("FAIL zetaris: set ZETARIS_API_KEY, ZETARIS_ORG_ID and ZETARIS_REST_URL in .env"); }

if ((both || values.nightshift) && env.METERLESS_BASE_URL) {
  const base = env.METERLESS_BASE_URL.replace(/\/$/, "");
  await check("nightshift /models", async () => {
    const res = await fetch(`${base}/models`, { headers: { Authorization: `Bearer ${env.METERLESS_RUNTIME_TOKEN}` }, signal: AbortSignal.timeout(15_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status} from ${base}/models (from WSL, 127.0.0.1 may not reach Windows: use the host IP or mirrored networking)`);
    const ids: string[] = ((await res.json()).data ?? []).map((m: any) => m.id);
    for (const [k, v] of [["MODEL_FAST", env.MODEL_FAST], ["MODEL_DEEP", env.MODEL_DEEP]])
      if (!v || !ids.includes(v)) throw new Error(`${k}=${v ?? "(unset)"} is not one of the routes: ${ids.join(", ")}`);
    if (![env.MODEL_FAST, env.MODEL_DEEP].every((m) => /nemotron/i.test(m!))) throw new Error("pin both lanes to Nemotron routes (not meterless/auto) for the NVIDIA award");
    return `${ids.length} routes, both lanes pinned to Nemotron`;
  });
  const gen = createNightshift({ baseUrl: base, token: env.METERLESS_RUNTIME_TOKEN ?? "", models: { fast: env.MODEL_FAST ?? "", deep: env.MODEL_DEEP ?? "" }, retries: 0 });
  for (const lane of ["fast", "deep"] as const)
    await check(`nightshift ${lane} lane`, async () => {
      const g = await gen('Reply with the JSON {"ok": true}.', { lane, json: true, maxTokens: 20 });
      return `${g.model} answered in ${g.ms} ms: ${g.text.slice(0, 40)}`;
    });
} else if (values.nightshift) { failed++; console.log("FAIL nightshift: set METERLESS_BASE_URL, METERLESS_RUNTIME_TOKEN, MODEL_FAST and MODEL_DEEP in .env"); }

if (both && !env.ZETARIS_API_KEY && !env.METERLESS_BASE_URL) { failed++; console.log("Nothing to check: no Zetaris or Nightshift settings in .env"); }
console.log(failed ? `\n${failed} check(s) failed` : "\nAll checks passed");
process.exit(failed ? 1 : 0);
