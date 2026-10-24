# SmartFlux EDIS: Implementation Guide

| | |
| --- | --- |
| Version | 1.0, matching [proposal v4](proposal.md), [PRD](prd.md) and [architecture](architecture.md) |
| Audience | The builders (Claude Code; Cursor optional) |
| Rule of thumb | Make the smallest version of each step work end to end before improving any of them |

---

## 1. Tech stack

| Layer | Choice | Notes |
| --- | --- | --- |
| Runtime | Node **22.13+** (24 LTS fine) | `node:sqlite` built in |
| Package manager | pnpm workspaces | Existing monorepo |
| Backend | Express 5, TypeScript, `tsx` for dev | Binds `0.0.0.0:8000` |
| LLM client | `openai` SDK pointed at Nightshift | Only LLM dependency |
| Live data | Zetaris REST (fetch) | JDBC as fallback |
| Source DB | Postgres 16 in Docker | Loaded by script |
| Sample DB | `node:sqlite` | No extra dependency |
| Tests | `node:test` + `tsx` | No test framework to install |
| Frontend | React 19, Vite, a ~30-line router in `src/api.ts` (no React Router) | PWA manifest; one app for the customer, owner and admin roles |
| Charts | Recharts (or the prototype's existing chart library) | Use what is already installed |
| Icons | Material Symbols Rounded | Matches the design reference |
| Fonts | Plus Jakarta Sans, Inter, JetBrains Mono (Google Fonts) | See [design-system.md](design-system.md) |
| Container | Dockerfile + `docker-compose.yml` | App + Postgres |

Do not add an agent framework, a vector database, an ORM or a state library. Nothing in the scope needs them.

## 2. Repository layout

```text
smartflux/
├── apps/
│   ├── backend/src/
│   │   ├── server.ts              # Express app, routes, static frontend in Docker
│   │   ├── cli.ts                 # pnpm agent
│   │   ├── scheduler.ts           # weekly briefing
│   │   ├── config.ts              # env parsing, mode selection, clear errors
│   │   ├── log.ts                 # emit() → stdout + logs/<run_id>.jsonl
│   │   ├── orchestrator/          # run.ts, state.ts (RunState), caps.ts
│   │   ├── agents/                # scout, planner, investigator, skeptic, reporter, prompts/
│   │   │   └── rules/             # deterministic twin of each role
│   │   ├── engines/hmem/          # Meterless H-MEM (store + retrieval) + memory.test.ts
│   │   ├── engines/scout/         # Meterless Scout Intent + routing.test.ts, risk.test.ts
│   │   ├── templates/             # one file per template: { lightning, sqlite, params }
│   │   ├── calc/                  # tou, solar, joint, regress, fault, margin, shift, mv, co2 (+ .test.ts)
│   │   ├── adapters/              # zetaris.ts, local-sqlite.ts, llm.ts
│   │   └── routes/                # run, approve, runs, admin
│   └── frontend/src/
│       ├── theme/tokens.css       # design tokens from design-system.md
│       ├── components/            # Card, DecisionCard, Badge, Button, BottomNav, Timeline, ...
│       ├── pages/owner/           # Home, EnergyPlan, Ask, Decision, Evidence, Approvals, Machines
│       ├── pages/admin/Overview.tsx
│       └── auth.ts                # demo login (owner, admin)
├── scripts/                       # generate-data, load-data, zetaris-setup, smoke
├── eval/                          # run-eval.ts, benchmark.ts, benchmark.md (generated)
├── infra/zetaris/                 # *_create.sql, *_select.sql
├── data/sample/                   # cached CSVs (committed), data/README.md
├── data/hmem/                     # memory store (gitignored)
├── input_examples/  output_examples/  logs/ (gitignored)
├── Dockerfile  docker-compose.yml  .env.example
├── PRE_EXISTING.md  README.md
```

## 3. Scripts

```jsonc
// root package.json "scripts"
{
  "dev": "pnpm -r --parallel dev",
  "agent": "tsx apps/backend/src/cli.ts",
  "test": "node --import tsx --test 'apps/backend/src/**/*.test.ts'",
  "data:generate": "tsx scripts/generate-data.ts --seed 1",
  "data:load": "tsx scripts/load-data.ts",
  "zetaris:setup": "tsx scripts/zetaris-setup.ts",
  "smoke": "tsx scripts/smoke.ts",
  "eval": "tsx eval/run-eval.ts",
  "benchmark": "tsx eval/benchmark.ts"
}
```

## 4. Build order

Each step ends with something that runs. Workstreams A (data), B (agent) and C (UI) can proceed in parallel after step 0.

| # | Step | Stream | Done when |
| --- | --- | --- | --- |
| 0 | Scaffold: `config.ts`, `log.ts`, `RunState`, `cli.ts`, `.env.example` | B | `pnpm agent --input x.json` prints a JSONL event and an empty result |
| 1 | Generator: real weather + holidays fetched once, outlets, machines, cycles, meter readings, plants, manifest | A | `data/sample/*.csv` + `manifest.json`; row counts match [data-and-evaluation.md](data-and-evaluation.md) |
| 2 | `local-sqlite` adapter + first templates (`tou_split`, `interval_series`) | A | Templates return rows from CSVs |
| 3 | `tou_calc` + test | A | Breakeven 63.6%; [proposal §24.1](proposal.md#241-tou-example-out-01) numbers to the sen |
| 4 | Rules twins for all five roles; orchestrator loop with caps | B | **Example 01 runs end to end in sample mode** with a verdict and a full log |
| 5 | `regress_machines`, `fault_check` (electric + gas) + tests | A | Planted kWh/cycle recovered ±10% per week; G3 found from minutes |
| 6 | `solar_calc`, `joint_decision` + tests | A | [proposal §24.3](proposal.md#243-solar--tou-joint-example-out-01) reproduced |
| 7 | `mv_check`, `margin_calc`, `shift_plan`, `co2_calc` + tests | A | [proposal §24.4](proposal.md#244-verification-example-d4) reproduced |
| 8 | H-MEM (IMPLEMENT prompt), `as_of` sessions | B | `memory.test.ts`: recall after restart; rejected advice not re-proposed |
| 9 | Scout Intent (IMPLEMENT prompt) + approval gate | B | 20-request routing test; financial actions never auto-run |
| 10 | All 8 examples pass in sample mode; `run-eval.ts` | A+B | O1–O12 checks green for seed 1 |
| 11 | Zetaris live: install, Postgres, datasource, REST tables, views, USL, `smoke.ts` | A | Federated query and USL query return rows; template parity test passes |
| 12 | Nightshift live: lanes, `llm.ts`, LLM-backed roles with tool calling | B | Example 02 live: Nemotron model on every LLM event; Skeptic `needs_revision` appears |
| 13 | Fallbacks: retry → twin / local, per adapter | B | Kill Zetaris mid-run: run completes in `mixed` mode with `fallback` events |
| 14 | API routes + weekly briefing scheduler | B | `POST /run`, `/approve`, `/runs/:id`, `/admin/overview`; example 08 |
| 15 | Design tokens + components | C | Storybook-free: a `/kitchen-sink` dev page showing every component |
| 16 | Owner app screens wired to the API | C | All Must stories in [PRD §5](prd.md#5-user-stories) work at 390 px |
| 17 | Admin web wired | C | FR-50 to FR-56 |
| 18 | Seed 2 + benchmark | A | `benchmark.md` generated; targets met or misses explained |
| 19 | Docker, README, `PRE_EXISTING.md`, `data/README.md`, output examples | All | Clean-clone checklist in [proposal §22](proposal.md#22-submission-checklist) passes |
| 20 | Demo video, deck, sponsor write-up | C | [submission-pack.md](submission-pack.md) complete |

## 5. Module notes

### 5.1 Orchestrator

```ts
// orchestrator/run.ts (shape)
export async function run(req: RunRequest, ctx: Ctx): Promise<RunResult> {
  const state = initState(req, ctx);                    // mode, as_of, caps
  await scout(state, ctx);                              // intents + risk, or refuse
  if (state.refused) return report(state, ctx);
  state.memory = await hmem.recall(req.outlet_id, req.as_of);
  for (let replan = 0; replan <= MAX_REPLANS; replan++) {
    await planner(state, ctx);
    while (!capsHit(state)) {
      await investigator(state, ctx);                   // templates + calculators
      const verdict = await skeptic(state, ctx);        // verification queries
      if (verdict === "approved" || verdict === "replan") break;
    }
    if (!state.needsReplan) break;
  }
  return report(state, ctx);                            // only approved claims; H-MEM write; gate actions
}
```

Each role function returns a patch to `RunState` and emits at least one log event with `target_agent`.

### 5.2 Role prompts (LLM-backed)

| Role | Prompt must contain | Output contract |
| --- | --- | --- |
| Scout | Intent list, risk table, "answer only JSON" | `{intents[], risk, lang, refuse?}` |
| Planner | Request, memory items, available templates and calculators with one-line descriptions | `{hypotheses[{id, text, templates[], calcs[]}]}` |
| Investigator | Open hypotheses, tool schemas | Tool calls only; never free-text numbers |
| Skeptic | Claims with evidence ids; checklist: peers, timing, ≥ 2 SE, gas vs electric, interacting decisions; may call verification templates | `{verdicts[{claim_id, status, reason, verification_query?}]}` |
| Reporter | Approved claims, calculator outputs, language, card schema | `Decision[]` (see [architecture §8](architecture.md#8-data-view)) |

Prompts never contain outlet or machine IDs from the planted data (anti-overfitting rule).

### 5.3 Template file

```ts
// templates/cycle_duration.ts
export default {
  params: ["machine", "from", "to"],
  lightning: `SELECT week, SUM(cycles) AS cycles, AVG(median_minutes) AS minutes
              FROM lightning.metastore.smartflux.energy.dryer_cycle_day
              WHERE machine_id = :machine AND day BETWEEN :from AND :to GROUP BY week`,
  sqlite:    `SELECT week, SUM(cycles) AS cycles, AVG(median_minutes) AS minutes
              FROM dryer_cycle_day
              WHERE machine_id = :machine AND day BETWEEN :from AND :to GROUP BY week`,
};
```

Templates return source rows; numbers such as kWh per cycle are always computed afterwards by a calculator (for example `peer_week_delta` fetches `interval_series` + `cycle_overlap` for the peers and runs `regress_machines`).

Parameters are bound, never string-concatenated. The parity test runs both versions on the sample data.

### 5.4 Calculators

Pure functions, one file each, each with a test that reproduces a worked example from [proposal §24](proposal.md#24-appendix-worked-examples-and-glossary). Money is rounded only for display.

### 5.5 Frontend

- Tokens in `theme/tokens.css` exactly as [design-system.md §7](design-system.md#7-tokens-css).
- Owner app routes: `/`, `/plan`, `/ask`, `/result/:runId`, `/decision/:runId/:i`, `/evidence/:runId`, `/briefing/:runId`, `/approvals`, `/machines`, `/machines/:id`.
- Customer routes: `/customer`, `/customer/machine/:id`, `/customer/report/:id`; `/customer?outlet=OUT-01` is the QR entry.
- Admin routes: `/admin`, `/admin/run/:runId`.
- Login: `/login` → `POST /login` returns a signed token; the app keeps it in `localStorage` and sends it as `Authorization: Bearer`.
- Evidence timeline renders `GET /runs/:id` log events in order; `needs_revision` events are visually distinct (icon + label, not colour alone).

## 6. Testing

| Level | What | Command |
| --- | --- | --- |
| Unit | Calculators, guards, template parity, Scout routing and risk, H-MEM | `pnpm test` |
| Objective checks | O1–O12 on seeds 1 and 2, sample mode (and live when up) | `pnpm eval` |
| Benchmark | 30 generated outlets | `pnpm benchmark` |
| Clean clone | Fresh clone, empty `.env`, sponsor services stopped | [proposal §22](proposal.md#22-submission-checklist) |
| UI | Manual pass at 360, 390 and 430 px; keyboard pass on Admin web | Checklist in [design-system.md §9](design-system.md#9-accessibility-checklist) |

## 7. AI coding tool usage

Any AI coding tool is allowed (Official Rules §145); Cursor is optional and only matters for the Cursor award. We build with Claude Code. If a team member uses Cursor, add `.cursor/rules/` ("calculators never do I/O", "LLM never computes money", Zetaris SQL rules, logging contract) and note it in the README. Never claim a tool that was not used.

## 8. Definition of done (per feature)

- [ ] Works in sample mode and live mode
- [ ] Emits log events with the required fields
- [ ] Has a test, or is covered by an example and `pnpm eval`
- [ ] No secret, ID or planted fact in prompts or code paths
- [ ] Shown in the UI with its evidence and assumptions
- [ ] README updated if it changes setup or usage
