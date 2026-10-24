# SmartFlux EDIS: Panel and Judges Validation Pack

| | |
| --- | --- |
| Purpose | Let a mock panel (team members, mentors, friends) score SmartFlux the way the real judges will, and find weaknesses before submission |
| Based on | Official Rules §14 (criteria), weak and strong submission examples, mentor playbook, office-hours guide, disqualification checklist, technical execution guide (from the hackathon resource pack, not redistributed here) |
| Version | 1.0, for [proposal v4](proposal.md) |

---

## 1. How to run a validation panel

1. **Three panelists**, as in the real judging (each submission is reviewed by at least three judges). Mix the roles in §2.
2. Each panelist gets only what a judge gets: the **repo link, the README, the demo video and the slide deck**. No verbal pitch first.
3. **15 minutes alone** per panelist: watch the video, skim the README, try `SAMPLE_MODE=true` from a clean clone, open one log.
4. Each fills the **score sheet (§6)** independently.
5. **15 minutes together**: panelists ask the questions in §5; the team answers in 30 seconds or less each.
6. Take the **median** score per criterion. Any criterion where panelists differ by more than 30% of its points gets a fix ticket.
7. Repeat after fixes. Target: median ≥ 85 and no gate failures.

## 2. Panel roles

| Role | Mirrors | Probes |
| --- | --- | --- |
| **Technical judge** | Engineer from GenAI Works | Does it run? Is it really multi-agent? Logs, failure handling, sample mode, hardcoding |
| **Business judge** | Founder or SME advisor | Is the user real? Is the money real? Would an owner pay? Is the demo clear? |
| **Sponsor judge** | Zetaris / Meterless / NVIDIA representative | Is our technology load-bearing or decorative? Which engine, which model, where? |

## 3. Pass/fail gates (check before scoring)

A submission that fails any of these is not competitive regardless of score.

| # | Gate | Where a panelist checks | Pass? |
| --- | --- | --- | --- |
| G1 | Public repo opens while logged out | Private window | ☐ |
| G2 | README covers setup, usage, dependencies | README | ☐ |
| G3 | Zetaris has a real role (removing it breaks live mode) | README sponsor section; `adapters/zetaris.ts`; `zetaris.query` log events | ☐ |
| G4 | At least one Meterless Engine works in a feature, with a passing test | `engines/hmem`, `memory.test.ts` output | ☐ |
| G5 | Meterless Nightshift is the primary AI provider | `adapters/llm.ts`; `model` on LLM log events | ☐ |
| G6 | AI coding tool declared honestly (Cursor optional, award only) | README "Built with" line | ☐ |
| G7 | Sample mode runs **real logic** with no credentials | Run an example with empty `.env`; outputs differ across inputs | ☐ |
| G8 | No hardcoded outputs | Search code for `output_examples` reads or input-to-answer maps | ☐ |
| G9 | Logs show agent-to-agent interaction | `logs/*.jsonl`: `target_agent`, `needs_revision` events | ☐ |
| G10 | No secrets committed or on screen | Secret scan; video frames near terminals and Nightshift | ☐ |
| G11 | Demo video 1–4 minutes, shows a real run | Video length and content | ☐ |
| G12 | Slide deck with all required topics | Deck vs [submission-pack.md §2](submission-pack.md#2-slide-deck) | ☐ |
| G13 | Pre-existing work declared | Form draft, `PRE_EXISTING.md` | ☐ |
| G14 | Track 3 named and clearly answered | README, deck, video | ☐ |

## 4. Scoring rubric with anchors

Score each criterion within its band. Anchors come from the official criteria and the strong/weak examples.

### Impact (30): consistency with the challenge; a meaningful real-world problem for intended users

| Band | Points | Looks like |
| --- | --- | --- |
| Exceptional | 27–30 | Specific real user with evidence of talking to them; money figures grounded and honest; clear Track 3 fit (data + knowledge + memory + reasoning → reliable decisions and actions); usable soon |
| Strong | 21–26 | Clear user and problem, plausible numbers, good track fit, user evidence thin |
| Adequate | 13–20 | Generic user or inflated claims; track fit asserted rather than shown |
| Weak | 0–12 | No clear user, toy problem, or track mismatch |

### Technical (20): implementation, reliability, architecture

| Band | Points | Looks like |
| --- | --- | --- |
| Exceptional | 18–20 | Runs from a clean clone; agents with distinct authority; critique loops visible in logs; retries and fallbacks; tests and a benchmark; sample mode with real logic |
| Strong | 14–17 | Runs; real loops; some failure handling; few tests |
| Adequate | 8–13 | Runs with help; mostly a chain; thin logs |
| Weak | 0–7 | Does not run, or agents are prompt wrappers |

### Innovation (15): originality of the approach

| Band | Points | Looks like |
| --- | --- | --- |
| Exceptional | 14–15 | An approach the panel has not seen, and it matters to the result |
| Strong | 10–13 | A thoughtful pattern or a novel use of data |
| Adequate | 5–9 | Familiar pattern applied competently |
| Weak | 0–4 | Chatbot over a dataset |

### Demo (15): how clearly the demo shows the solution, its functionality and value

| Band | Points | Looks like |
| --- | --- | --- |
| Exceptional | 14–15 | ≤ 4 min; real run; a visible collaboration moment; sponsor tech in action; a clear "so what"; memorable twist |
| Strong | 10–13 | Real run, clear story, one weak segment |
| Adequate | 5–9 | Mostly slides or UI tour |
| Weak | 0–4 | No real run, or over time |

### Product & UX (10): intuitive, accessible, easy for intended users

| Band | Points | Looks like |
| --- | --- | --- |
| Exceptional | 9–10 | The user could act on the output today; plain language; accessible; right device |
| Strong | 7–8 | Clean and usable, small friction |
| Adequate | 4–6 | Works but dense or developer-facing |
| Weak | 0–3 | Hard to use or missing |

### Sponsor Tech (10): how effectively sponsor technology addresses the problem

| Band | Points | Looks like |
| --- | --- | --- |
| Exceptional | 9–10 | Each sponsor load-bearing and visible in logs; unique use explained |
| Strong | 7–8 | Real use of the required sponsors; one is thin |
| Adequate | 4–6 | Present but shallow |
| Weak | 0–3 | Named in README only |

## 5. Questions the panel should ask (with the answers we must be able to give)

### Technical judge

| # | Question | Answer we give (≤ 30 s) | Proof |
| --- | --- | --- | --- |
| T1 | Can I run it without your keys? | Yes. `SAMPLE_MODE=true` runs the full loop on cached data with rule-based twins of each agent | README; clean-clone script |
| T2 | Isn't sample mode just replaying answers? | No. Change the outlet, `as_of` or seed and the answer changes; nothing reads `output_examples/` | Example 03 vs 06; seed 2 |
| T3 | Where does one agent change another's behaviour? | The Skeptic sends work back; for example it rejected "RM521" and forced a joint recomputation | `logs/` example 06 |
| T4 | Does the LLM do the maths? | Never. It picks templates and explains; calculators compute every number | `calc/*.test.ts`; `calc.*` events |
| T5 | What if Zetaris dies mid-run? | Retry, then the same template runs locally; logged as `fallback`, run marked `mixed` | Failure demo; logs |
| T6 | How do you know it's accurate? | 30-outlet benchmark: verdict accuracy, fault recall, false flags, verification error | `eval/benchmark.md` |
| T7 | How do you stop runaway loops? | Caps: 30 tool calls (queries + calculator runs), 3 rejections per claim, 2 re-plans; unresolved items reported | `caps.ts` |
| T8 | Is the regression stable? | Weekly fits with standard errors; collinear machines merged and reported | `regress.test.ts` |

### Business judge

| # | Question | Answer | Proof |
| --- | --- | --- | --- |
| B1 | Who exactly is this for? | Owners of 1–3 self-service laundromats in Malaysia, often absentee | Owner quote; personas in [PRD](prd.md) |
| B2 | Have you talked to one? | [Fill from [user-research.md](user-research.md); never invent] | Interview notes |
| B3 | Where does the cycle data come from in real life? | Cashless payment and telemetry systems already used in Malaysian laundromats (for example payNwash); CSV export first | [proposal §25](proposal.md#25-sources) |
| B4 | Is RM14/month worth anything? | That's why we lead with the joint decision: solar sized to the real load saves about RM507/month for the example outlet, and we show when ToU stops paying | Energy plan card |
| B5 | Aren't solar installers already doing this? | They size from the bill. We size from half-hourly load and real irradiance, and re-decide the tariff after solar | Joint example |
| B6 | Many dryers are gas. Doesn't that break it? | Gas dryers are monitored by cycle minutes; we never claim electric savings from a gas burner | G3 at OUT-02 |
| B7 | How do you know the advice worked? | We measure it: before/after against peers, reported as realised RM with a band | Verification card |
| B8 | What's the business model? | Per-outlet subscription; fault detection and verified savings justify it; franchise operators get the Admin web | Roadmap slide |

### Sponsor judge

| # | Question | Answer | Proof |
| --- | --- | --- | --- |
| S1 | If I removed Zetaris, what breaks? | All live data access: the agent and the Skeptic's verification queries both go through Zetaris, including a live REST API (Open-Meteo) and a semantic layer | `zetaris.query` events; Zetaris UI |
| S2 | Which Meterless Engine, doing what, with which test? | H-MEM: machine baselines, advice and outcomes across restarts (`memory.test.ts`). Plus intent routing and approval gating modelled on Scout Intent (`routing.test.ts`, `risk.test.ts`) | Test output |
| S3 | Is Nightshift really the provider? | Every LLM call goes through one client pointed at the Nightshift Runtime URL | `adapters/llm.ts`; log `model` fields |
| S4 | Where does Nemotron do real work? | Intent classification, hypothesis choice from H-MEM context, the Skeptic's causal judgment (humidity, traffic, holiday), Malay and English wording; models pinned per lane. Numbers and double-count detection stay in tested code by design | Log per step |
| S5 | What was unique about your use? | The Skeptic re-derives every money claim from Zetaris before the owner sees it | Trace scene |
| S6 | Which AI coding tool did you use? | Claude Code (Cursor only if used); any tool is allowed | README |

### Hard questions (any judge)

| # | Question | Answer |
| --- | --- | --- |
| H1 | Your data is synthetic. Why trust the results? | Weather and holidays are real; business data is synthetic by necessity and labelled; a second seed and a 30-outlet benchmark guard against overfitting |
| H2 | What if the owner's tariff rates differ? | Rates live in one table; every card lists the rates used |
| H3 | What can go wrong for the owner? | A wrong solar size or tariff switch; both are financial actions that need approval and show their assumptions |
| H4 | What would you build next? | Real cycle-log import, WhatsApp briefings, MD module for medium-voltage sites |
| H5 | Customer availability already exists in payment apps. Why build it? | Availability is the easy part. What's new: customers only see faults the Skeptic verified and the owner approved, promos reach them only after approval, and the next session measures whether they shifted. Their reports feed back as evidence |
| H6 | Did you talk to users? | No owner reached in the build window (a proof of concept). We say so and cite public sources; the personas are stated assumptions |

## 6. Score sheet (one per panelist)

| Criterion | Max | Score | One-line reason | Biggest fix |
| --- | --- | --- | --- | --- |
| Impact | 30 | | | |
| Technical | 20 | | | |
| Innovation | 15 | | | |
| Demo | 15 | | | |
| Product & UX | 10 | | | |
| Sponsor Tech | 10 | | | |
| **Total** | 100 | | | |

Gates failed (from §3): ______

## 7. Team self-assessment (v4, assuming full execution)

| Criterion | Max | Self-score | Why | What would cost points |
| --- | --- | --- | --- | --- |
| Impact | 30 | 28 | Joint solar/ToU decision worth about RM507/month; verified fault savings; gas dryers handled; Scope 2; data source exists | No real owner conversation (−3 to −4) |
| Technical | 20 | 19 | Loops, caps, fallbacks, real sample mode, tests, benchmark, Docker | Template parity bugs; benchmark misses unexplained |
| Innovation | 15 | 14 | Payment-log disaggregation; solar re-deciding ToU; Skeptic catching double counts; self-verifying advice | Judges unfamiliar with NILM may not see the novelty unless the deck explains it in one line |
| Demo | 15 | 14 | Twist, memory across restart, Skeptic rejection, verified outcome, sample mode on camera | Running over 4 minutes; too many scenes |
| Product & UX | 10 | 9 | Mobile-first cards, Malay, evidence one tap away, approvals, briefings | Dense Evidence screen on small phones |
| Sponsor Tech | 10 | 9 | Every sponsor load-bearing and logged | Scout Intent fallback used instead of the engine (−1, decided 24 Oct) |
| **Total** | 100 | **93** | | |

## 8. Red flags a panelist should report immediately

From the mentor playbook: "only one of us can run it"; logs missing; "the output is fixed for the demo"; partner tech "added later"; manual setup after cloning; secrets anywhere; a demo that is slides only.

## Sources

Real-event rubrics and demo advice used to shape this pack: [Devfolio judging guide](https://guide.devfolio.co/docs/guide/participating-in-hackathons/judging-1), [Colosseum: perfecting your submission](https://blog.colosseum.com/perfecting-your-hackathon-submission/), [AngelHack demo tips](https://angelhack.com/blog/10-tips-to-help-you-rock-your-next-hackathon-demo/), [LexisNexis hackathon scoring criteria](https://hackathon.lexisnexis.com/fall2019/scoringcriteria.html). The official criteria and gates come from the hackathon resource pack's `Rules & Requirements` and `Demo and Submission Resources` folders.
