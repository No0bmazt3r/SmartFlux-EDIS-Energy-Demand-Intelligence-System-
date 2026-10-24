// Live-path tests against fake Nightshift and Zetaris servers: request shapes, model logging, retries,
// fallbacks and guards. The real services are checked by `pnpm smoke`.
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { createServer, type IncomingMessage, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { DatabaseSync } from "node:sqlite";
import { openSampleDb } from "./local-sqlite.ts";
import { loadConfig } from "../config.ts";
import { run } from "../orchestrator/run.ts";
import { bindParams, createZetaris, selectColumns } from "./zetaris.ts";

const servers: Server[] = [];
after(() => servers.forEach((s) => s.close()));
const body = (req: IncomingMessage) => new Promise<any>((r) => { let b = ""; req.on("data", (c) => (b += c)); req.on("end", () => r(b ? JSON.parse(b) : null)); });
async function serve(handler: (req: IncomingMessage, json: any) => { status?: number; json: unknown }) {
  const s = createServer(async (req, res) => {
    const out = handler(req, await body(req));
    res.writeHead(out.status ?? 200, { "Content-Type": "application/json" }).end(JSON.stringify(out.json));
  });
  servers.push(s);
  await new Promise<void>((r) => s.listen(0, "127.0.0.1", r));
  return `http://127.0.0.1:${(s.address() as any).port}`;
}

// Fake Nightshift: answers each role the way a well-behaved Nemotron would, and records what it was sent.
const seen: { headers: IncomingMessage["headers"]; body: any }[] = [];
const MODEL = "nvidia/nemotron-test";
const nightshift = (opts: { fail?: boolean; badNumbers?: boolean; prose?: boolean; planAdd?: string[] } = {}) => serve((req, json) => {
  seen.push({ headers: req.headers, body: json });
  if (opts.fail) return { status: 503, json: { error: "overloaded" } };
  if (opts.prose && json.messages.length === 2) return { json: { model: MODEL, choices: [{ message: { content: "Sure! Here is my answer." } }] } };
  const sys: string = json.messages[0].content, user: string = json.messages[1].content;
  let content: unknown;
  if (sys.startsWith("You are Scout")) content = { intents: /bill|higher/i.test(user.split('"""')[1]) ? ["bill_investigation"] : ["tariff_decision"], lang: "en" };
  else if (sys.startsWith("You are Planner")) content = { add: opts.planAdd ?? ["humidity", "holiday"], reasons: { humidity: "September was humid", holiday: "Malaysia Day fell in the window" } };
  else if (sys.startsWith("You are Skeptic")) content = { verdict: "approve", reason: "Peers barely moved, so the weather is not the cause." };
  else {
    const cards = JSON.parse(user.split("\n").find((l) => l.startsWith("[{"))!);
    content = { cards: cards.map((c: any) => ({ verdict: opts.badNumbers ? `${c.verdict} 999` : `Plainly: ${c.verdict}`, evidence: c.evidence })) };
  }
  return { json: { model: MODEL, choices: [{ message: { content: JSON.stringify(content) } }] } };
});

const tmp = () => { const d = mkdtempSync(join(tmpdir(), "sf-live-")); return { logDir: join(d, "logs"), hmemDir: join(d, "hmem") }; };
const liveLlm = (url: string) => ({ ...loadConfig({ LLM_MODE: "nightshift", METERLESS_BASE_URL: url, METERLESS_RUNTIME_TOKEN: "test-token", MODEL_FAST: "nemotron-fast", MODEL_DEEP: "nemotron-deep" }), ...tmp() });
const events = (path: string) => readFileSync(path, "utf8").trim().split("\n").map((l) => JSON.parse(l));

test("Nightshift: every agent step names the Nemotron model; lanes and Meterless headers are right", async () => {
  seen.length = 0;
  const res = await run({ outlet_id: "OUT-01", as_of: "2026-10-04", question: "Why was my bill higher?" }, liveLlm(await nightshift()), { echo: false });
  assert.match(res.mode, /^live \(data: local sample; reasoning: Nemotron via Nightshift\)/);
  const ev = events(res.log);
  for (const agent of ["Scout", "Planner", "Reporter"]) assert.ok(ev.some((e) => e.agent_name === agent && e.model === MODEL), `${agent} logs the model`);
  assert.ok(ev.some((e) => e.agent_name === "Skeptic" && e.model === MODEL && /Nemotron/.test(e.output_summary)), "Skeptic's causal judgment is logged");
  assert.ok(ev.every((e) => e.mode === "live"));
  assert.ok(res.decisions.every((d) => d.verdict.startsWith("Plainly:")), "Reporter wording used");
  assert.equal(seen[0].headers.authorization, "Bearer test-token");
  assert.equal(seen[0].headers["meterless-app"], "smartflux");
  assert.equal(seen[0].headers["meterless-scope"], "user");
  assert.deepEqual([...new Set(seen.map((s) => s.body.model))].sort(), ["nemotron-deep", "nemotron-fast"]);
  assert.equal(seen.find((s) => s.body.messages[0].content.startsWith("You are Scout"))!.body.model, "nemotron-fast");
  assert.equal(seen.find((s) => s.body.messages[0].content.startsWith("You are Reporter"))!.body.model, "nemotron-deep");
  assert.ok(seen.find((s) => s.body.messages[0].content.startsWith("You are Planner"))!.body.messages[1].content.includes("What we remember"), "H-MEM context reaches the Planner prompt");
});

test("Nightshift down: retries, then the rules twins answer and the run is marked mixed", async () => {
  seen.length = 0;
  const res = await run({ outlet_id: "OUT-01", as_of: "2026-10-18", question: "Should I switch to the ToU tariff?" }, liveLlm(await nightshift({ fail: true })), { echo: false });
  assert.match(res.mode, /^mixed/);
  assert.equal(res.decisions[0].verdict, "Switch to the ToU tariff");
  assert.ok(events(res.log).some((e) => e.status === "fallback" && e.agent_name === "Scout"));
  assert.ok(seen.length >= 3, "each call was retried before falling back");
});

test("Nightshift answers in prose: one repair prompt, then valid JSON, and the run stays live", async () => {
  seen.length = 0;
  const res = await run({ outlet_id: "OUT-01", as_of: "2026-10-18", question: "Should I switch to the ToU tariff?" }, liveLlm(await nightshift({ prose: true })), { echo: false });
  assert.match(res.mode, /^live/);
  assert.ok(seen.some((s) => /not a valid JSON object/.test(s.body.messages.at(-1).content) && s.body.messages.at(-2).role === "assistant"), "repair prompt sent with the bad reply");
  assert.ok(!events(res.log).some((e) => e.status === "fallback"));
});

test("Reporter rewrites that change a number are rejected; the calculator's text stays", async () => {
  const res = await run({ outlet_id: "OUT-01", as_of: "2026-10-18", question: "Should I switch to the ToU tariff?" }, liveLlm(await nightshift({ badNumbers: true })), { echo: false });
  assert.equal(res.decisions[0].verdict, "Switch to the ToU tariff");
  assert.ok(events(res.log).some((e) => e.action === "word" && /kept the template text/.test(e.output_summary)));
});

test("A dryer check the Planner model adds to a tariff question runs, but finding nothing adds no card (seen live in examples 01, 03)", async () => {
  const res = await run({ outlet_id: "OUT-01", as_of: "2026-10-18", question: "Should I switch to the ToU tariff?" }, liveLlm(await nightshift({ planAdd: ["fault"] })), { echo: false });
  assert.deepEqual(res.decisions.map((d) => d.type), ["tariff"]);
  assert.ok(events(res.log).some((e) => e.agent_name === "Planner" && /fault/.test(e.output_summary)));
});

// Fake Zetaris: checks the request the way the real REST API expects it, then answers from the sample data by
// mapping the Lightning names onto the SQLite tables. Rows come back as arrays without names, like the real API.
const db = openSampleDb("data/sample");
const zetaris = (opts: { fail?: boolean } = {}) => serve((req, json) => {
  assert.equal(req.url, "/api/v1.0/sql-editor/sqls/run");
  assert.equal(req.headers.authorization, "Bearer z-key");
  assert.equal(req.headers["x-org-id"], "1");
  assert.match(String(req.headers["x-request-id"]), /^[0-9a-f-]{36}$/);
  assert.equal(json.source, "SqlEditor");
  assert.ok(!/;\s*$/.test(json.sql), "no trailing semicolon");
  if (opts.fail) return { status: 503, json: { error: "driver restarting" } };
  const sql = json.sql.replaceAll("lightning.metastore.smartflux.energy.", "").replaceAll("smartflux_pg.", "");
  return { json: { data: (db as DatabaseSync).prepare(sql).all().map((r: any) => Object.values(r)) } };
});
const liveData = async (fail = false) => ({ ...loadConfig({ DATA_MODE: "zetaris", ZETARIS_REST_URL: (await zetaris({ fail })) + "/api/v1.0", ZETARIS_ORG_ID: "1", ZETARIS_API_KEY: "z-key" }), ...tmp() });

test("Zetaris: every query goes through the REST API and the answer matches sample mode", async () => {
  const q = { outlet_id: "OUT-01", as_of: "2026-10-18", question: "Should I switch to the ToU tariff?" };
  const live = await run(q, await liveData(), { echo: false });
  const sample = await run(q, { ...loadConfig({ SAMPLE_MODE: "true" }), ...tmp() }, { echo: false });
  assert.match(live.mode, /^live \(data: Zetaris;/);
  const ev = events(live.log);
  assert.ok(ev.filter((e) => e.action.endsWith(".query")).every((e) => e.action === "zetaris.query"));
  assert.deepEqual(live.decisions, sample.decisions);
});

test("Zetaris down: one retry, then the same template on local SQLite, logged as fallback (mixed)", async () => {
  const res = await run({ outlet_id: "OUT-01", as_of: "2026-10-18", question: "Should I switch to the ToU tariff?" }, await liveData(true), { echo: false });
  assert.match(res.mode, /^mixed/);
  const ev = events(res.log);
  assert.ok(ev.some((e) => e.action === "zetaris.query" && e.status === "retrying"));
  assert.ok(ev.some((e) => e.action === "sqlite.query" && e.status === "fallback"));
  assert.equal(res.decisions[0].verdict, "Switch to the ToU tariff");
});

test("Zetaris guard: read-only, one statement, parameters cannot break out of a literal", async () => {
  const z = createZetaris({ restUrl: "http://127.0.0.1:9", orgId: "1", apiKey: "k" });
  await assert.rejects(z.exec("DROP TABLE smartflux_pg.outlets"), /Only SELECT/);
  await assert.rejects(z.exec("SELECT 1; SELECT 2"), /One statement/);
  assert.throws(() => bindParams("SELECT * FROM t WHERE id = :id", { id: "x' OR '1'='1" }), /not allowed/);
  assert.equal(bindParams("WHERE a = :a AND b = :b", { a: "OUT-01", b: 3 }), "WHERE a = 'OUT-01' AND b = 3");
  assert.deepEqual(selectColumns("SELECT week, period, SUM(kwh) AS kwh, COUNT(*) AS intervals FROM x"), ["week", "period", "kwh", "intervals"]);
});
