# SmartFlux EDIS: Product Requirements Document

| | |
| --- | --- |
| Product | SmartFlux EDIS (Energy Demand Intelligence System) |
| Version | PRD v1.0, matching [proposal v4](proposal.md) |
| Date | 24 Oct 2026 |
| Track | Open Agent Hackathon 2026, Track 3: Reasoning Architecture |
| Status | Approved for build |
| Related | [Architecture](architecture.md) · [Implementation](implementation.md) · [Design system](design-system.md) · [Data and evaluation](data-and-evaluation.md) |

This document says **what** SmartFlux does and **why**. How it is built lives in [architecture.md](architecture.md) and [implementation.md](implementation.md). Where a requirement and the proposal disagree, this PRD wins for scope; the proposal wins for maths and rationale.

---

## 1. Summary

SmartFlux is an AI agent for Malaysian self-service laundromat owners. It reads the outlet's half-hourly meter data and the payment system's machine cycle logs together, then:

1. decides how to cut the energy bill (rooftop solar, the Time-of-Use tariff, or both, decided jointly);
2. finds machines that waste energy, for electric and gas dryers;
3. proposes actions, waits for the owner's approval, and later **verifies** whether the action saved money;
4. briefs the owner every Monday without being asked, and prepares Scope 2 emissions figures.

Every answer shows its evidence. A Skeptic agent re-checks every money claim against the data before the owner sees it.

## 2. Problem

| Today | Consequence |
| --- | --- |
| The owner sees one number: the monthly TNB bill | No idea which machine, hour or tariff drives the cost |
| ToU is opt-in since July 2025, peak is weekdays 14:00–22:00 | Owners fear switching and paying more |
| Solar installers size systems from the bill (Solar ATAP since 1 Jan 2026) | Systems are sized without knowing when the load happens; the interaction with ToU is ignored |
| A dryer with a clogged vent or weak heater keeps running | Wastes about RM180/month until it breaks; nobody notices |
| Nobody checks whether a fix worked | Owners cannot tell good advice from bad |
| Larger customers and lenders ask SMEs for emissions figures | Owners have no figures ready |

## 3. Users and personas

| Persona | Who | Goals | Surface |
| --- | --- | --- | --- |
| **Aisyah, absentee owner** (primary) | Owns 1–3 outlets, 8–20 machines each; checks her phone between other work; reads Malay and English | Lower bill, no surprises, decisions she can trust in two minutes | Owner app (mobile) |
| **Raj, franchise operator** (secondary) | Runs SmartFlux for a franchise of 3–30 outlets | See which outlets need attention, whether advice is working, export emissions figures | Admin web (desktop) |
| **Judge** (evaluation user) | Hackathon panelist with limited time and no credentials | Run it, see agents collaborate, see sponsor tech doing real work | `POST /run`, CLI, sample mode |

Walk-in laundromat customers are **not** users. They only see the result of an approved promo.

Personas are working assumptions until confirmed by the owner conversations in [user-research.md](user-research.md).

## 4. Goals and non-goals

### Goals

| # | Goal | Success metric (demo and benchmark) |
| --- | --- | --- |
| G1 | Right energy decision | Solar, ToU and joint verdicts match the calculator on 100% of benchmark outlets |
| G2 | Find wasteful machines | Fault recall ≥ 90%; ≤ 1 false flag across 30 outlets |
| G3 | Prove advice works | Realised saving within ±15% of planted recovery for ≥ 90% of serviced faults |
| G4 | Trustworthy answers | 100% of money claims in an output have an approved Skeptic verification step in the log |
| G5 | Fast to understand | Owner reaches a verdict in ≤ 2 taps from Home; each card readable in ≤ 30 seconds |
| G6 | Runs anywhere | Sample mode runs all 8 examples from a fresh clone with no credentials |

### Non-goals (hackathon scope)

Payments and subscriptions; real authentication (demo login only); multi-tenancy; native mobile apps; live sub-minute monitoring; controlling machines directly; filing ESG reports; light theme; TNB API gateway monitoring; peer ranking; PDF export.

## 5. User stories

### Owner app

| ID | As the owner, I want to… | So that… | Priority |
| --- | --- | --- | --- |
| US-01 | see a Monday briefing when I open the app | I know what changed without asking | Must |
| US-02 | ask "solar, ToU or both?" | I make the biggest energy decision correctly | Must |
| US-03 | ask "should I switch to ToU?" | I don't pay more by switching | Must |
| US-04 | ask "why was my bill higher?" | I learn the real cause, not a guess | Must |
| US-05 | see which machine is wasting money and how much | I service the right machine | Must |
| US-06 | open the evidence behind any card | I can trust or challenge the answer | Must |
| US-07 | approve or reject a proposed action | nothing happens without my say | Must |
| US-08 | see whether an approved action actually saved money | I know the advice works | Must |
| US-09 | see cost vs price per cycle for each machine | I can reprice or retire machines | Should |
| US-10 | ask in Malay and get answers in Malay | I'm comfortable using it | Should |
| US-11 | be told plainly when solar isn't possible (no roof) or when to stay on my tariff | I'm not sold something that doesn't fit | Must |

### Admin web

| ID | As the operator, I want to… | So that… | Priority |
| --- | --- | --- | --- |
| US-20 | see peak vs off-peak kWh for every outlet | I spot outlets that should change tariff or add solar | Must |
| US-21 | see flagged machines across outlets with RM waste | I schedule technicians | Must |
| US-22 | see predicted vs verified savings per outlet | I can show the franchise SmartFlux pays for itself | Must |
| US-23 | see the last runs and briefings with links to their traces | I can audit the agent | Must |
| US-24 | export Scope 2 figures per outlet | owners can answer customer and lender requests | Should |
| US-25 | see KPIs (load, cost, revenue, margin, projection) | I know each outlet's health | Should |
| US-26 | post a banner to all owners | I can announce maintenance | Could |

### Judge

| ID | As a judge, I want to… | So that… | Priority |
| --- | --- | --- | --- |
| US-40 | run the system without credentials | I can score Technical without the team's machines | Must |
| US-41 | call one JSON endpoint or CLI | I don't need the UI | Must |
| US-42 | read logs that show agents disagreeing and revising | I can tell it's not a chain | Must |
| US-43 | see where Zetaris, Meterless, Nightshift and Nemotron did work | I can score Sponsor Tech | Must |

## 6. Functional requirements

### 6.1 Agent and decisions

| ID | Requirement | Acceptance criteria |
| --- | --- | --- |
| FR-01 | Classify every request into intents and a risk level (Scout Intent) | 20-request labelled test passes; out-of-scope requests are refused with a list of what it can do |
| FR-02 | Plan hypotheses and query templates from the request and memory | Log shows a `plan` event naming hypotheses before any query |
| FR-03 | Query data only through Zetaris (live) or local SQLite (sample) via templates | No other data access path exists in the code |
| FR-04 | Compute all money and statistics in deterministic code | Every RM figure in output traces to a `calc.*` log event |
| FR-05 | Skeptic verifies each claim with its own query and can block it | At least one `needs_revision` event in example 02 and 06 logs; Reporter receives only approved claims |
| FR-06 | Reject double-counted savings across interacting decisions | Example 06 log shows the RM521 sum rejected; output recommends solar + flat |
| FR-07 | Decide solar size, ToU, and the combination jointly | Matches [proposal §24.3](proposal.md#243-solar--tou-joint-example-out-01) on the sample data |
| FR-08 | Detect faults for electric dryers (kWh) and gas dryers (minutes) | O3 and O11 pass on both seeds |
| FR-09 | Gate operational and financial actions behind owner approval | `risk.test.ts`: a tariff switch or solar request never auto-executes |
| FR-10 | Remember baselines, advice, approvals, rejections and outcomes across restarts (H-MEM) | `memory.test.ts` passes; rejected advice is not re-proposed |
| FR-11 | Verify approved actions after they happen | Example 07 returns "verified" with a band |
| FR-12 | Run a weekly briefing per outlet without a question | Example 08 produces a briefing card; appears in Admin run log |
| FR-13 | Evaluate every request at an `as_of` date | Data after `as_of` never appears in a log or output |
| FR-14 | Cap work per run | ≤ 14 tool calls, ≤ 3 rejections per claim, ≤ 2 re-plans; unresolved items listed |
| FR-15 | Answer in the request's language (English or Malay) | Example 04 answers in Malay |

### 6.2 Owner app

| ID | Screen | Requirement |
| --- | --- | --- |
| FR-30 | Home | Briefing card on top; alert cards; month kWh, RM, projected bill; verified savings total |
| FR-31 | Energy plan | Solar size options with payback; ToU verdict before and after solar; one recommendation; assumptions listed |
| FR-32 | Ask | Text input (English or Malay), 4 suggested questions, progress state while the agent runs |
| FR-33 | Decision card | Verdict, RM/month, confidence, ruled-out list, "Show evidence" |
| FR-34 | Evidence | Agent timeline (who sent what to whom, status), SQL, calculator inputs and outputs, Skeptic verification, model per step |
| FR-35 | Approvals | Pending actions with risk badge, reason, predicted saving; approve and reject |
| FR-36 | Machines | Per machine: kWh or minutes per cycle with error bar, cost vs price per cycle, trend vs baseline, service date, verified saving |
| FR-37 | Navigation | Bottom navigation: Home, Ask, Machines, Approvals (badge with count) |

### 6.3 Admin web

| ID | Section | Requirement |
| --- | --- | --- |
| FR-50 | Outlet energy | Stacked bars per outlet per week: peak vs off-peak kWh |
| FR-51 | KPIs | Load, cost, revenue, margin, bill projection per outlet, from calculators only |
| FR-52 | Disaggregation | Washers vs dryers kWh per outlet |
| FR-53 | Flagged machines | Table: outlet, machine, type, heat source, delta, RM waste, approval status |
| FR-54 | Advice scoreboard | Approved actions with predicted vs verified RM and verdict |
| FR-55 | Run log | Last 20 runs: time, outlet, intent, verdict, mode (live/sample/fallback), link to trace |
| FR-56 | Scope 2 export | CSV per outlet: kWh, tCO₂e, factor and method note |
| FR-57 | Banner (stretch) | One text field that shows a banner in the Owner app |

### 6.4 API and CLI

| ID | Requirement |
| --- | --- |
| FR-70 | `POST /run` accepts `{outlet_id, as_of, question?, lang?, briefing?}` and returns decisions, actions, unresolved items and the log path |
| FR-71 | `POST /approve` accepts `{action_id, decision}` |
| FR-72 | `GET /runs/:id` returns run state and log events; `GET /admin/overview` returns the Admin web data |
| FR-73 | `pnpm agent --input <file>` and `pnpm agent --briefing --as-of <date>` print log events and the result |
| FR-74 | Invalid requests return `400` with a message; missing live config returns a clear error suggesting `SAMPLE_MODE=true` |

## 7. Non-functional requirements

| ID | Area | Requirement |
| --- | --- | --- |
| NFR-01 | Performance | Live run ≤ 2 minutes typical, hard cap 5 minutes; sample run ≤ 5 seconds |
| NFR-02 | Reliability | Zetaris 30 s timeout, Nightshift 60 s; one retry each, then fallback, all logged |
| NFR-03 | Reproducibility | Fresh clone + `.env.example` + sample mode runs everything; Docker build works |
| NFR-04 | Observability | JSONL logs in `logs/` and stdout with `agent_name`, `action`, `target_agent`, `confidence`, `retry_count`, `status`, `model`, `mode` |
| NFR-05 | Security | No secrets committed; `run_sql` read-only; credentials never logged or put in URLs |
| NFR-06 | Accessibility | WCAG 2.2 AA contrast (text 4.5:1, UI 3:1), 44 px touch targets, keyboard reachable Admin web, never colour alone for status ([design-system.md](design-system.md)) |
| NFR-07 | Mobile | Owner app usable at 360–430 px wide; installable PWA |
| NFR-08 | Honesty | Every assumption (solar cost, LPG cost, tariff rates, synthetic data) labelled in the UI and README |
| NFR-09 | Data | No real personal data; synthetic data labelled; small repo footprint |

## 8. Release scope

| Release | Contents |
| --- | --- |
| **Hackathon submission (MVP)** | Everything marked Must and Should above; FR-57 if time |
| Roadmap 1 | Real cycle-log import (CSV first, then payment-provider partnerships); myTNB export upload |
| Roadmap 2 | Light theme; WhatsApp briefing; per-outlet subscription |
| Roadmap 3 | MD module for medium-voltage sites; Markovian franchise-wide audits |

## 9. Assumptions and dependencies

| Item | Status |
| --- | --- |
| TNB non-domestic LV ToU rates | To confirm ([proposal §23](proposal.md#23-open-questions)) |
| Solar cost per kWp, export credit | Assumptions in `solar_params`; to confirm with installers |
| Payment systems export cycle logs | Telemetry providers exist (payNwash); export format to confirm |
| Zetaris, Nightshift, Nemotron access | Required for live mode only |
| Scout Intent spec | To fetch from Meterless; fallback documented |

## 10. Risks

See [proposal §19](proposal.md#19-risks-and-mitigations). Product-level risks: owners may not trust an AI with money decisions (mitigated by evidence and approvals); solar figures depend on assumptions (mitigated by showing them); gas dryers limit what the meter can see (mitigated by duration-based detection).

## 11. Sources for this document's structure

Problem, goals, user stories, functional and non-functional requirements, scope, out-of-scope and release plan follow common PRD practice ([ChatPRD](https://www.chatprd.ai/learn/prd-template), [Product School](https://productschool.com/blog/product-strategy/product-template-requirements-document-prd), [Kuse](https://www.kuse.ai/blog/tutorials/prd-document-template-in-2025-how-to-write-effective-product-requirements)). The PRD stays on what and why; design lives in the architecture doc.
