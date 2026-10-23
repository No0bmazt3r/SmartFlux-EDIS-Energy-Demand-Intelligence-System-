# SmartFlux EDIS: Submission Pack

Everything the HackOS submission form asks for, drafted. Fill the `[ ]` placeholders only with real facts.

| Form item | Section |
| --- | --- |
| Project name and description | [§1](#1-name-and-description) |
| Track | Reasoning Architecture |
| Team members | Confirm the roster before creating the submission (it locks) |
| GitHub repository | Public; README per [§5](#5-readme-outline) |
| Demo video (1–4 min) | Script in [proposal §20](proposal.md#20-demo-script); recording notes [§3](#3-demo-video) |
| Slide deck | [§2](#2-slide-deck) |
| Sponsor technology explanation | [§4](#4-sponsor-technology-explanation) |
| Pre-existing components | [§6](#6-pre-existing-components) |

---

## 1. Name and description

**Name:** SmartFlux EDIS

**One sentence:** An agent that tells a Malaysian laundromat owner whether to install solar, switch tariff or both, finds the machines wasting energy, and proves whether each fix saved money.

**Short paragraph:**
> SmartFlux investigates a laundromat's half-hourly meter data together with the cycle logs its cashless payment system already records. A team of agents on NVIDIA Nemotron (through Meterless Nightshift) plans hypotheses, queries every source through Zetaris, and computes every ringgit in tested code. A Skeptic agent re-checks each claim against the data before the owner sees it, and it rejects savings that are double-counted across decisions that interact, such as solar and the Time-of-Use tariff. Meterless H-MEM remembers each machine's baseline and every piece of advice, so later sessions can verify whether an approved fix actually worked. Owners use a mobile app with Monday briefings and approvals; franchise operators use an admin web view. Judges can run everything with no credentials in sample mode, which runs the real agent logic.

## 2. Slide deck

Ten slides. The eight required topics are marked ★.

| # | Slide | Content |
| --- | --- | --- |
| 1 | ★ Problem and users | Owner quote; one TNB bill; "Solar? ToU? Which machine?"; Track 3 |
| 2 | ★ The solution | One line + the four things SmartFlux does; screenshot of the Energy plan card |
| 3 | The pivot | v1 dashboard + chatbot → v4 agent; three things that didn't hold up (1 Hz API, MD charges, RM456) |
| 4 | ★ Agent workflow | Scout → Planner ↔ Investigator ↔ Skeptic → Reporter; H-MEM; the two loops and the block |
| 5 | ★ Technical stack | Zetaris · H-MEM · Scout Intent · Nightshift · Nemotron lanes · Cursor · TypeScript |
| 6 | ★ How Zetaris and Meterless were used | Federated query (Postgres + 2 live APIs) + USL; H-MEM and Scout Intent features and tests; Nightshift as the only LLM path |
| 7 | ★ What was unique | Skeptic re-derives money claims from Zetaris; solar flips the ToU verdict; advice verified later |
| 8 | ★ Product visuals | Owner app: briefing, Energy plan, Evidence; Admin web scoreboard |
| 9 | Results | Benchmark table (30 outlets); seed 1 and seed 2 checks; limitations |
| 10 | ★ Future enhancements | Real cycle-log import, payment-provider partnerships, WhatsApp briefings, MD module, light theme |

Design: [design-system.md](design-system.md) colours and fonts; one idea per slide; numbers in Plus Jakarta Sans; no screenshots with keys.

## 3. Demo video

- Follow [proposal §20](proposal.md#20-demo-script); rehearse to 3:45; the hard limit is 4:00.
- Record at 1080p (720p minimum), real-time footage, clear narration, no copyrighted music.
- Owner app scenes at phone width; Admin web at desktop width.
- Show the real system: one live run, the log, and one sample-mode run.
- Before upload: scrub frames near terminals and Nightshift's Console/Providers tabs for keys.
- Upload unlisted; test the link in a private window.
- Keep a backup recording of each live segment.

## 4. Sponsor technology explanation

> **Zetaris (data layer).** Every piece of data the agent uses comes through Zetaris. We registered a Postgres datasource (meter readings, machine cycles, machines, tariffs, service log, solar parameters) and two live public APIs as Lightning REST tables: Malaysian public holidays (Nager.Date) and hourly weather and solar radiation (Open-Meteo archive). A Unified Semantic Layer model (`smartflux.energy`) holds the peak/off-peak and holiday rules once, and the agent queries it through named templates. The Skeptic agent also uses Zetaris to verify every money claim before it reaches the owner. If Zetaris is removed, live mode has no data.
>
> **Meterless (build and power).** We implemented two Meterless Engines from the IMPLEMENT prompts. **H-MEM** stores each machine's baseline, every recommendation, the owner's approvals and rejections, and measured outcomes; it powers machine health and advice verification across restarts (`memory.test.ts`). **Scout Intent** classifies every request into intents and a risk level, and blocks operational and financial actions until the owner approves (`routing.test.ts`, `risk.test.ts`). **Meterless Nightshift** is the only AI provider: every model call goes through one OpenAI-compatible client pointed at the Nightshift Runtime.
>
> **NVIDIA.** Nightshift routes to two pinned NVIDIA Nemotron lanes: Nemotron Lightning for Scout, Planner and Investigator (many short tool-calling turns) and Nemotron Super for the Skeptic and Reporter (causal judgment, double-count detection, English and Malay reports). The model is logged on every call.
>
> **Cursor.** The project was built in Cursor. Project rules in `.cursor/rules` encode our constraints (the LLM never computes money; calculators never do I/O; Zetaris SQL rules). We used Composer for scaffolding and tests and Grok for longer refactors.
>
> **What was unique.** No money claim reaches the owner until the Skeptic has re-derived it from Zetaris, and the Skeptic rejects savings summed across interacting decisions. Solar sizing re-decides the tariff on the remaining grid load. H-MEM lets the agent check whether its own advice worked.

Fill in after building: [exact Nemotron route names], [test output lines], [whether the Scout Intent engine or the fallback was used].

## 5. README outline

1. Title, one sentence, track, sponsor badges, run command
2. Problem and user (with owner quote)
3. What it does (four bullets) and one screenshot
4. Agents table: role, lane, authority (can block or send back)
5. Architecture diagram (from [architecture.md](architecture.md))
6. Quick start: sample mode (no credentials), Docker, live mode
7. Usage: `POST /run`, CLI, the eight examples with expected behaviour
8. Sponsor technology (as §4)
9. Logs: where they are, one excerpt showing `needs_revision`
10. Evaluation: `pnpm test`, `pnpm eval`, benchmark table
11. Failure handling table
12. Data and licences: synthetic business data, real weather and holidays (Open-Meteo CC BY 4.0, Nager.Date MIT)
13. Limitations ([data-and-evaluation.md §8](data-and-evaluation.md#8-limitations-to-state-publicly))
14. Pre-existing components
15. Team

## 6. Pre-existing components

Declare in the form and in `PRE_EXISTING.md`:

| Component | Before 22 Oct 00:00 UTC | Built in the window |
| --- | --- | --- |
| Monorepo scaffold (pnpm, Express 5, React 18 + Vite) | Yes | Restructured |
| React dashboard shell | Yes (mock data, hardcoded forecasts) | Reworked into Owner app and Admin web; mock data and hardcoded numbers removed |
| Gemini chatbot, ForecastService | Yes | Deleted |
| Everything else (agents, engines, calculators, templates, adapters, data generator, Zetaris setup, evaluation, tests, logs) | No | All new |

Record the prototype's last pre-window commit hash here: `[hash]`.

## 7. Final validation (one sitting, before submitting)

- [ ] Gates G1–G14 in [judges-validation.md §3](judges-validation.md#3-passfail-gates-check-before-scoring) all pass
- [ ] Clean-clone script in [proposal §22](proposal.md#22-submission-checklist) passes in sample mode and live mode
- [ ] Mock panel median ≥ 85
- [ ] Video ≤ 4:00, link works logged out
- [ ] Deck covers the eight ★ topics
- [ ] Roster confirmed; Track 3 selected
- [ ] Submitted with hours to spare; then improve and resubmit if time allows

## Sources

Form fields from this repo's `Demo and Submission Resources/submission-form-preview.md`. Demo-video practice: [Devfolio](https://guide.devfolio.co/docs/guide/participating-in-hackathons/judging-1), [Colosseum](https://blog.colosseum.com/perfecting-your-hackathon-submission/), [ReSkill](https://blogs.reskilll.com/hackathon-demo-presentation-tips-pitch-3-minutes-win-2026/).
