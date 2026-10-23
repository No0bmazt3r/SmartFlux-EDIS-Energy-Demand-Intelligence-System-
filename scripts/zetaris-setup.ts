// Creates SmartFlux's Zetaris objects from infra/zetaris/*_create.sql, one statement per call.
// Run by a person, never by the agent. Dry-run first (Zetaris AGENTS.md):
//   pnpm zetaris:setup --dry-run          print every statement (password masked), send nothing
//   pnpm zetaris:setup                    create everything
//   pnpm zetaris:setup --skip-exists      re-run on an instance that already has some objects
//   pnpm zetaris:setup --weather pg       build weather_hourly from Postgres if the REST unnest fails
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { createZetaris } from "../apps/backend/src/adapters/zetaris.ts";
import { statements } from "./sql.ts";

try { process.loadEnvFile(); } catch { /* env from the shell */ }
const { values } = parseArgs({ options: {
  "dry-run": { type: "boolean", default: false }, "skip-exists": { type: "boolean", default: false },
  weather: { type: "string", default: "rest" }, only: { type: "string" },
} });

const env = process.env;
const vars: Record<string, string> = {
  PG_HOST_FOR_ZETARIS: env.PG_HOST_FOR_ZETARIS ?? "host.docker.internal",
  PGPORT: env.PGPORT ?? "5432", PGDATABASE: env.PGDATABASE ?? "smartflux", PGUSER: env.PGUSER ?? "smartflux",
  PGPASSWORD: env.PGPASSWORD ?? "", WEATHER_SOURCE: values.weather === "pg" ? "smartflux_pg.weather" : "weather_view.hourly",
};

const fill = (s: string, mask: boolean) => s.replace(/\$\{(\w+)\}/g, (_, k) => {
  if (!(k in vars)) throw new Error(`Unknown variable \${${k}}`);
  return mask && k === "PGPASSWORD" ? "********" : vars[k];
});

const dir = "infra/zetaris";
const files = readdirSync(dir).filter((f) => f.endsWith("_create.sql") && (!values.only || values.only.split(",").some((o) => f.startsWith(o)))).sort();
if (values.weather === "pg") files.splice(files.findIndex((f) => f.startsWith("02")), 1); // no REST view needed
const plan = files.flatMap((f) => statements(readFileSync(join(dir, f), "utf8")).map((s) => ({ file: f, sql: s })));

if (values["dry-run"]) {
  for (const [i, p] of plan.entries()) console.log(`-- [${i + 1}/${plan.length}] ${p.file}\n${fill(p.sql, true)}\n`);
  console.log(`${plan.length} statements; nothing was sent. Re-run without --dry-run to create them.`);
  process.exit(0);
}
if (!vars.PGPASSWORD) throw new Error("Set PGPASSWORD in .env (the smartflux-pg password)");
if (!env.ZETARIS_API_KEY || !env.ZETARIS_ORG_ID || !(env.ZETARIS_REST_URL || env.ZETARIS_BASE_URL)) throw new Error("Set ZETARIS_API_KEY, ZETARIS_ORG_ID and ZETARIS_REST_URL in .env");
const z = createZetaris({ restUrl: env.ZETARIS_REST_URL, baseUrl: env.ZETARIS_BASE_URL, orgId: env.ZETARIS_ORG_ID, apiKey: env.ZETARIS_API_KEY, timeoutMs: 600_000 });
for (const [i, p] of plan.entries()) {
  const head = fill(p.sql, true).split("\n")[0].slice(0, 90);
  try {
    await z.exec(fill(p.sql, false), { admin: true });
    console.log(`PASS [${i + 1}/${plan.length}] ${head}`);
  } catch (e) {
    const msg = (e as Error).message;
    if (values["skip-exists"] && /already exist/i.test(msg)) { console.log(`SKIP [${i + 1}/${plan.length}] ${head} (already exists)`); continue; }
    console.error(`FAIL [${i + 1}/${plan.length}] ${head}\n  ${msg.replaceAll(vars.PGPASSWORD, "********")}`);
    if (p.file.startsWith("02")) console.error("  The weather REST unnest is the unconfirmed step: re-run with --weather pg --skip-exists.");
    process.exit(1);
  }
}
console.log("Done. Next: pnpm smoke");
