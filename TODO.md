# SmartFlux EDIS: Build TODO

Do these in order, one at a time. Each item has a **done when** check. Tick it only when that check passes, not when the code is written.
Phases follow [implementation.md §4](docs/implementation.md#4-build-order). After phase 1, streams **A** (data), **B** (agent) and **C** (UI) can run in parallel.

Deadline: **27 Oct 2026, 23:45 UTC** (internal target 12:00 UTC). Cut order if behind: [proposal §18.4](docs/proposal.md#184-cut-order).

---

## Phase 0: Blockers and decisions (today, 24 Oct)

- [ ] **0.1** Name Builder 1, who owns data, Zetaris, templates and calculators. *Done when:* a name is in proposal §18.2.
- [ ] **0.2** Confirm the team roster and presenters (the submission locks the roster). *Done when:* submission-pack names everyone.
- [ ] **0.3** Find the Scout Intent engine spec (meterless.ai / Meterless GitHub / sponsor Help). The fallback deadline was 24 Oct 12:00. *Done when:* the spec is saved in the repo, or the "plain intent routing" fallback is chosen and written down.
- [ ] **0.4** Read the Official Rules for an IP or licence clause and confirm that MIT is allowed. *Done when:* noted here.
- [ ] **0.5** Confirm every team member agrees to MIT and the copyright line "SmartFlux EDIS contributors" (or swap in the team name). *Done when:* LICENSE is final.
- [ ] **0.6** Copy the hackathon reference folders ("Rules & Requirements", "Demo and Submission Resources", `zetaris/`, `meterless/`) into the repo or `docs/refs/`, since the docs cite them as "in this repo". Alternatively, drop those claims. *Done when:* no doc links to a missing file.
- [ ] **0.7** Find the prototype's last commit before the window (before 22 Oct 00:00 UTC) and record the hash. *Done when:* submission-pack §6 has the hash.
- [ ] **0.8** Decide whether the prototype code gets imported into this repo or the build starts fresh here. *Done when:* written in implementation.md §2.

## Phase 1: Fix the docs (30 min)

- [ ] **1.1** The example count disagrees: proposal §8 says "5 inputs", §14.3 says 8. *Done when:* every doc says 8.
- [ ] **1.2** The `machine_cycles` row count disagrees: proposal §10.2 says ≈15,000, data-and-evaluation §2 says ≈22,000. *Done when:* one figure everywhere (take it from the generator output).
- [ ] **1.3** The log action names disagree: `zetaris.query` (logs, judges-validation G3), `zetaris.call` (proposal §8), `llm.call`. *Done when:* one naming scheme is in architecture §8 and every doc uses it.
- [ ] **1.4** The repo layouts disagree: proposal §14.4 has `scripts/eval.ts`, implementation §2 has `eval/run-eval.ts` and `eval/benchmark.ts`. *Done when:* the proposal points to the implementation layout.
- [ ] **1.5** The research notes path is wrong: `docs/smartflux/research/` doesn't exist. *Done when:* user-research §4 says `docs/research/`.
- [ ] **1.6** The benchmark and the fault threshold conflict: faults are planted at +15–45%, but `fault_check` flags only at ≥ +20%. About 1 in 6 faults can never be found, so the ≥ 90% recall target is at risk. *Done when:* the planted range starts at +20%, the threshold changes, or the target is restated (see the grilling).
- [ ] **1.7** The Gantt timeline in proposal §18.3 is stale (milestone m1, 24 Oct 00:00, has passed). *Done when:* it's re-planned from now, or replaced with a link to this file.

## Phase 2: Environment and sponsor setup (parallel with phase 3)

- [ ] **2.1** Node 22.13+ and pnpm are installed on every builder's machine. *Done when:* `node -e "require('node:sqlite')"` runs with no error.
- [ ] **2.2** Zetaris: sign up, download, `docker login`, `./preflight.sh`, edit `.env`, `compose up`. *Done when:* `./verify.sh` shows 9/9 and `SELECT 1` works in the UI. Needs 8 GB RAM; if the laptop has less, use the AWS fallback.
- [ ] **2.3** Fetch the Zetaris OpenAPI spec from `/redoc/docs.yaml` and pin the exact SQL run path and body. *Done when:* `adapters/zetaris.ts` has the confirmed path (open question 3).
- [ ] **2.4** Nightshift: install it, add the NVIDIA key in Providers, set up two lanes (Lightning, Super), copy the Runtime URL and token. *Done when:* `curl $METERLESS_BASE_URL/models` from WSL lists the Nemotron routes.
- [ ] **2.5** WSL → Nightshift networking (mirrored networking or the Windows host IP), plus Docker → `host.docker.internal`. *Done when:* both reach `/v1/models`.
- [ ] **2.6** Record the exact Nemotron route names. *Done when:* `MODEL_FAST` and `MODEL_DEEP` are in `.env.example` comments (open question 4).
- [ ] **2.7** A second team member can run live mode with their own credentials. *Done when:* their smoke test passes (avoids the "only one of us can run it" red flag).

## Phase 3: Scaffold (step 0, stream B)

- [ ] **3.1** pnpm workspace: `apps/backend`, `apps/frontend`, root `package.json` with the scripts from implementation §3. *Done when:* `pnpm install` is clean.
- [ ] **3.2** `.gitignore` covering `.env`, `logs/`, `data/hmem/`, `node_modules/` and `dist/`. *Done when:* none of these would be committed.
- [ ] **3.3** `.env.example` exactly as in proposal §18.1, placeholders only. *Done when:* the secret grep finds nothing real.
- [ ] **3.4** `config.ts`: parses env, picks the mode, and in live mode a missing variable gives a clear error suggesting `SAMPLE_MODE=true`. *Done when:* an empty `.env` starts in sample mode and a partial live `.env` fails with the variable's name.
- [ ] **3.5** `log.ts`: `emit()` writes to stdout and `logs/<run_id>.jsonl` with every `LogEvent` field (architecture §8). *Done when:* a test writes an event and reads it back.
- [ ] **3.6** `orchestrator/state.ts` (`RunState`) and `caps.ts` (14 tool calls, 3 rejections per claim, 2 re-plans). *Done when:* the types compile.
- [ ] **3.7** `cli.ts`: `pnpm agent --input <file>`. *Done when:* it prints one JSONL event and an empty result.
- [ ] **3.8** `.cursor/rules/`: TS style, "calculators never do I/O", "LLM never computes money", Zetaris SQL rules, the logging contract. *Done when:* the files are committed.
- [ ] **3.9** Start `docs/cursor-log.md` and take screenshots as you go. *Done when:* the first entry is written.

## Phase 4: Data (steps 1–3, stream A)

- [ ] **4.1** Generator: fetch Open-Meteo archive data (7 Sep – 18 Oct, 3 outlets, humidity, temperature, radiation) and Nager.Date 2026 MY **once** and save them to `data/sample/`. *Done when:* `weather_*.csv` has 1,008 rows per outlet and `holidays.csv` includes 16 Sep.
- [ ] **4.2** Generator: outlets, machines (8 washers + 6 dryers each, OUT-02 gas), arrivals, cycles, meter readings, base load, noise. *Done when:* row counts match data-and-evaluation §2 (6,048 meter rows).
- [ ] **4.3** Generator: plants P1–P9 (data-and-evaluation §4) and `manifest.json`. *Done when:* the manifest lists every plant with its expected finding.
- [ ] **4.4** Generator `--seed 2` variant (fault moves, OUT-03 gas, flipped flat outlet, different noisy machine). *Done when:* seed 2 CSVs are generated.
- [ ] **4.5** `data/README.md`: sources, licences (Open-Meteo CC BY 4.0, Nager.Date MIT), row counts, how to regenerate, "business data is synthetic". *Done when:* it's written.
- [ ] **4.6** `adapters/local-sqlite.ts`: loads the CSVs into in-memory `node:sqlite` with the USL table and view names (`interval_usage`, `dryer_cycle_day`). *Done when:* `SELECT COUNT(*)` matches the CSVs.
- [ ] **4.7** Template framework (`{params, lightning, sqlite}`, bound params, `as_of` filter, 500-row cap) plus `tou_split` and `interval_series`. *Done when:* both return rows and no rows come after `as_of`.
- [ ] **4.8** `calc/tou.ts` and its test. *Done when:* breakeven is 63.6% and proposal §24.1 is reproduced to the sen (RM2,012.85 vs RM2,027.20, saving RM14.35).
- [ ] **4.9** The remaining templates: `cycle_overlap`, `dryer_cycle_day`, `cycle_duration`, `peer_week_delta`, `cycle_prices`, `solar_inputs`, `service_history`. *Done when:* each returns rows on seed 1.

## Phase 5: Agent loop in sample mode (step 4, stream B) ★ first milestone

- [ ] **5.1** Rules twin for Scout: an EN/MS keyword classifier with intents and the risk table (proposal §17.2). *Done when:* "Write me a marketing email" → `out_of_scope`.
- [ ] **5.2** Rules twin for Planner: a fixed hypothesis set and template list per intent. *Done when:* the log shows a `plan` event before any query.
- [ ] **5.3** Rules twin for Investigator: runs the templates and calculators for each open hypothesis. *Done when:* `calc.*` events appear.
- [ ] **5.4** Rules twin for Skeptic: peer delta, timing, ≥ 2 SE, duration change, gas vs electric, interacting decisions. It can send work back. *Done when:* a `needs_revision` event is emitted for a summed saving.
- [ ] **5.5** Rules twin for Reporter: `Decision[]` built from approved claims only, with assumptions and ruled-out items listed. *Done when:* an unapproved claim never reaches the output.
- [ ] **5.6** Orchestrator loop (implementation §5.1) with caps; when a cap is hit, items go to `unresolved`. *Done when:* **example 01 runs end to end in sample mode** with a verdict and a full log.

## Phase 6: Calculators (steps 5–7, stream A). Each one is a pure function with a test

- [ ] **6.1** `regress_machines`: weekly NNLS (336 × 15), R², SE, collinear merge. *Done when:* the planted kWh/cycle is recovered within ±10% for every electric dryer, every week.
- [ ] **6.2** `fault_check` (electric kWh and gas minutes). *Done when:* D4 is flagged at about +33% and RM182; G3 is flagged from minutes with no kWh claim; P6, P7 and P8 are **not** flagged.
- [ ] **6.3** `solar_calc`: sizes 5/10/15/20 up to the roof limit, self-use, exports at 0, payback, post-solar profile. *Done when:* the 10 kWp row of §24.3 is reproduced.
- [ ] **6.4** `joint_decision`: four options on the same post-action load. *Done when:* the result is "solar + flat, RM506.80" and the ToU-after-solar delta is RM1.43.
- [ ] **6.5** `mv_check`: difference-in-differences, a ± 2 SE band, verified / not yet / not achieved. *Done when:* §24.4 is reproduced (0.63 kWh/cycle, about RM164, verified).
- [ ] **6.6** `margin_calc`, `shift_plan`, `co2_calc`. *Done when:* each has a test with a hand-checked number.
- [ ] **6.7** `propose_action`: a pending record with its risk level. *Done when:* a financial action is created as `awaiting_approval`.

## Phase 7: Meterless engines (steps 8–9, stream B)

- [ ] **7.1** H-MEM from the IMPLEMENT prompt: `MemoryStoreService` + `MemoryRetrievalService`, file-backed in `data/hmem/`, `as_of` on each item. *Done when:* `recall`, `write` and `recordOutcome` work.
- [ ] **7.2** `memory.test.ts`: write a baseline, restart, recall it, flag a +33% reading; rejected advice is not re-proposed. *Done when:* it passes.
- [ ] **7.3** Sessions: as_of 13 Sep → restart → 4 Oct → 18 Oct. *Done when:* session 2's log cites the session 1 baseline and the promo outcome (+6 pts).
- [ ] **7.4** Scout Intent engine, or the documented fallback. *Done when:* `routing.test.ts` passes on 20 labelled EN/MS requests.
- [ ] **7.5** Approval gate. *Done when:* `risk.test.ts` shows a tariff switch or a solar request never auto-executes.

## Phase 8: Examples and eval (step 10, A + B)

- [ ] **8.1** `input_examples/01` to `08` as in proposal §14.3. *Done when:* the 8 files exist.
- [ ] **8.2** All 8 run in sample mode and match the expected behaviour (01 switch, 02 D4, 03 stay, 04 Malay G3, 05 refuse, 06 solar + flat with RM521 rejected, 07 verified, 08 briefing). *Done when:* each output is checked by hand once.
- [ ] **8.3** `eval/run-eval.ts`: checks O1–O12 plus the log assertions (data-and-evaluation §6.2). *Done when:* `pnpm eval` is green on seed 1.
- [ ] **8.4** Seed 2 passes the same eval. *Done when:* `pnpm eval` is green on seed 2 (the anti-overfitting check).
- [ ] **8.5** Grep check: no outlet ID, machine ID or planted number in prompts, templates or agent code, and nothing reads `output_examples/`. *Done when:* the grep is empty.
- [ ] **8.6** Save real outputs to `output_examples/`. *Done when:* 8 files exist, copied from real runs.

## Phase 9: Live mode (steps 11–13)

- [ ] **9.1** Postgres 16 in Docker, `scripts/load-data.ts`. *Done when:* the tables are loaded and the row counts match.
- [ ] **9.2** `infra/zetaris/*_create.sql` + `scripts/zetaris-setup.ts --dry-run`, covering the datasource, REST tables (holidays, weather ×3), the weather unnest view and the USL `smartflux.energy`. *Done when:* the federated query (proposal §10.5) and a USL query return rows.
- [ ] **9.3** If the Open-Meteo unnest fails, load the cached weather into Postgres and keep holidays as a REST table. *Done when:* either path works.
- [ ] **9.4** `adapters/zetaris.ts`: read-only guard (SELECT, SHOW, DESCRIBE; USL namespace only), 30 s timeout, 1 retry, typed errors, no credentials in logs. *Done when:* the guard test rejects `DROP` and `INSERT`.
- [ ] **9.5** Template parity test: Lightning vs SQLite give identical rows on the sample data. *Done when:* it passes for all 9 templates.
- [ ] **9.6** `scripts/smoke.ts`: Zetaris (`SELECT 1`, `SHOW LIGHTNING DATABASES`, federated, USL) plus Nightshift (`/v1/models`, one chat). *Done when:* `pnpm smoke` passes every check.
- [ ] **9.7** `adapters/llm.ts`: one OpenAI client on `METERLESS_BASE_URL`, pinned lanes, 60 s timeout, logs the model and run id. *Done when:* every LLM event has `model`.
- [ ] **9.8** Role prompts (implementation §5.2) and LLM-backed roles with tool calling, plus one repair prompt on bad JSON. *Done when:* **example 02 runs live** with Nemotron on every LLM event and a Skeptic `needs_revision`.
- [ ] **9.9** Fallbacks: Zetaris retry → local SQLite; LLM fails twice → the rules twin. *Done when:* killing Zetaris mid-run still completes in `mixed` mode with `fallback` events.
- [ ] **9.10** All 8 examples in live mode. *Done when:* the verdicts match sample mode.

## Phase 10: API and scheduler (step 14)

- [ ] **10.1** `POST /run`, `POST /approve`, `GET /runs/:id`, `GET /admin/overview` on `0.0.0.0:8000`, with 400s on bad input. *Done when:* curl checks pass for each.
- [ ] **10.2** Weekly briefing scheduler (Monday 08:00 MYT) plus `pnpm agent --briefing --as-of`. *Done when:* example 08 appears in the Admin run log.

## Phase 11: Frontend (steps 15–17, stream C)

- [ ] **11.1** `theme/tokens.css` copied exactly from design-system §7, plus the fonts and Material Symbols. *Done when:* it's in use.
- [ ] **11.2** Components and a `/kitchen-sink` page: Card, DecisionCard, Briefing card, Risk and Status badges, Timeline row (normal and sent back), SQL block, KPI tile, Alert card, Machine row, Bottom nav, FAB, Outlet switcher, Language toggle, Mode badge, Toast. *Done when:* all of them render on one page.
- [ ] **11.3** Demo login (Owner, Admin) and routes (implementation §5.5). *Done when:* both roles land on their home screen.
- [ ] **11.4** M-02 Home: briefing, this month, alerts, solar teaser, verified savings. *Done when:* it's wired to the API at 390 px.
- [ ] **11.5** M-04 Energy plan, plus the OUT-03 "no roof" variant. *Done when:* it shows before and after solar, ruled-out RM521 and the assumptions.
- [ ] **11.6** M-05 Ask and M-06 Agent working, including the "Skeptic asked for one more check" note. *Done when:* a question runs and the progress steps update.
- [ ] **11.7** M-07 Decision card (6 variants). *Done when:* the fault, tariff and energy plan variants render from real output.
- [ ] **11.8** M-08 Evidence, rendered from `GET /runs/:id`. *Done when:* the sent-back row is visually distinct with an icon and text, and the SQL, numbers and models are shown.
- [ ] **11.9** M-09 Approvals: approve and reject, toast, history. *Done when:* approving D4 is recorded in H-MEM.
- [ ] **11.10** M-10 Did it work? *Done when:* predicted vs realised plus the weekly chart with the service marker.
- [ ] **11.11** M-11 Machines (plus M-12 detail if time allows). *Done when:* kWh or minutes, status, and cost vs price per cycle are shown.
- [ ] **11.12** Malay toggle (M15) with `lang="ms"`. *Done when:* example 04 reads naturally in Malay.
- [ ] **11.13** PWA manifest. *Done when:* the app installs on a phone.
- [ ] **11.14** Admin web: KPI tiles, outlet energy chart (with a "view as table" option), flagged machines, advice scoreboard, run log (W1–W6). *Done when:* it's wired to `/admin/overview`.
- [ ] **11.15** Admin Should items: outlets table, washer vs dryer split, Scope 2 CSV, as-of picker, run detail. *Done when:* they're done or explicitly cut.
- [ ] **11.16** Accessibility pass against design-system §9, at 360, 390 and 430 px, plus a keyboard pass on the Admin web. *Done when:* every checklist item is ticked.

## Phase 12: Benchmark (step 18)

- [ ] **12.1** `eval/benchmark.ts`: 30 outlets, seeds 100–129. *Done when:* `eval/benchmark.md` is generated with every miss listed and its reason.
- [ ] **12.2** Targets met (verdicts 100%, recall ≥ 90%, ≤ 1 false flag, M&V within ±15% for ≥ 90%, 100% within caps, median ≤ 5 s sample). *Done when:* they're met, or each miss is explained in the README.

## Phase 13: Packaging (step 19)

- [ ] **13.1** Dockerfile + `docker-compose.yml` (app + Postgres, API serves the frontend). *Done when:* `docker compose up --build` gives a working `POST /run`.
- [ ] **13.2** Fill in the README's real sections: logs excerpt with `needs_revision`, test output lines, benchmark table, failure-handling table, the 8 examples. Remove the "Status: in development" banner. *Done when:* every section matches submission-pack §5.
- [ ] **13.3** `PRE_EXISTING.md` (submission-pack §6 plus the hash from 0.7). *Done when:* it's written.
- [ ] **13.4** Fill the submission-pack placeholders: Nemotron route names, test output lines, whether Scout Intent is the engine or the fallback. *Done when:* no `[ ]` placeholders remain.
- [ ] **13.5** Clean-clone check (proposal §22) in a fresh folder with an empty `.env` and the sponsors stopped. *Done when:* `pnpm install && pnpm test && pnpm eval` and all 8 examples pass.

## Phase 14: User research (in parallel, by 26 Oct 06:00)

- [ ] **14.1** Contact at least 2 laundromat owners (family network, nearby outlets, Facebook groups, franchise sales lines). *Done when:* at least 1 interview is booked.
- [ ] **14.2** Run the interview (user-research §3, EN or BM). *Done when:* notes are in `docs/research/` using the template, with no personal data.
- [ ] **14.3** Get one quote with permission. *Done when:* it's in the deck slide 1 and the README, or the deck honestly says "no owner reached" and cites public sources.
- [ ] **14.4** Apply the "if we hear…" changes (user-research §5) and close open questions 6, 7 and 9. *Done when:* the docs are updated.
- [ ] **14.5** Confirm the tariff rates and the solar cost per kWp (open questions 5, 8 and 10). *Done when:* the `tariffs` and `solar_params` sources are cited in the README.

## Phase 15: Demo, deck, submission (step 20)

- [ ] **15.1** Record the demo per proposal §20: 1080p, ≤ 4:00 (rehearse to 3:45), no keys on screen, a backup of each live segment. *Done when:* the video is uploaded unlisted and opens in a private window.
- [ ] **15.2** Slide deck: 10 slides with the 8 ★ topics (submission-pack §2). *Done when:* it's reviewed against proposal §3 so no v1 claims creep back in (1 Hz, MD, RM456).
- [ ] **15.3** Sponsor technology write-up (submission-pack §4) with the real details filled in. *Done when:* it's pasted into the form.
- [ ] **15.4** Secret scan of the repo and the video frames. *Done when:* nothing is found.
- [ ] **15.5** Run `/judge` (the mock panel) and fix the tickets. *Done when:* the median is ≥ 85 and no gate G1–G14 fails.
- [ ] **15.6** Confirm the repo opens logged out (G1). *Done when:* it's checked in a private window.
- [ ] **15.7** Submit on HackOS, Track 3 selected, by 27 Oct 12:00 UTC. *Done when:* the confirmation is received.
- [ ] **15.8** Improve and resubmit before 23:45 UTC if time allows.
