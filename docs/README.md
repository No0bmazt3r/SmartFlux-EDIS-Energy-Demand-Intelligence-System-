# SmartFlux EDIS: Project Docs

> *"TNB tells you what you spent. SmartFlux tells you what to do about it, and proves it worked."*

SmartFlux EDIS is an agent for Malaysian self-service laundromat owners. It decides between solar, the ToU tariff, or both. It finds machines that waste energy and verifies whether each fix saved money. It is our entry for **Open Agent Hackathon 2026, Track 3: Reasoning Architecture**.

## Read in this order

| # | Doc | What it is | Who it's for |
| --- | --- | --- | --- |
| 1 | [proposal.md](proposal.md) | The full idea (v4): why, what, maths, demo, rubric mapping, sources | Everyone |
| 2 | [prd.md](prd.md) | Product requirements: personas, user stories, functional and non-functional requirements, scope | Whole team |
| 3 | [architecture.md](architecture.md) | System design: C4 context, containers, components, runtime views, deployment, decision records | Builders |
| 4 | [implementation.md](implementation.md) | How to build it: stack, repo layout, build order, module notes, testing, Cursor usage | Builders |
| 5 | [data-and-evaluation.md](data-and-evaluation.md) | Data window, sources, generator, planted facts, sample mode, eval and benchmark | Builders, judges |
| 6 | [design-system.md](design-system.md) | Palette, tokens, typography, components, charts, accessibility, screen blueprints | UI, video, slides |
| 7 | [judges-validation.md](judges-validation.md) | Mock-panel pack: gates, scoring anchors, judge questions with answers, score sheet | Panelists, team |
| 8 | [submission-pack.md](submission-pack.md) | Form answers, deck outline, sponsor write-up, README outline, pre-existing declaration | Whoever submits |
| 9 | [user-research.md](user-research.md) | Owner interview plan and script (English and Malay) | Researcher |
| 10 | [features.md](features.md) | Screen-by-screen features for the mobile app and admin web, sample data, and Stitch prompts for mockups | UI / mockups |

## At a glance

| | |
| --- | --- |
| User | Laundromat owner (Owner app, mobile) and franchise operator (Admin web, desktop) |
| Headline value | Solar sized on the real load, about RM507/month for the example outlet; faults found and **verified** in RM |
| Agents | Scout → Planner ↔ Investigator ↔ Skeptic → Reporter, with H-MEM memory |
| Sponsors | Zetaris (all data), Meterless H-MEM + Scout Intent (engines), Meterless Nightshift → NVIDIA Nemotron (all LLM calls), Cursor (built in) |
| Runs without credentials | `SAMPLE_MODE=true`: the real logic on cached data |
| Self-assessed score | 94/100 if fully built ([judges-validation.md §7](judges-validation.md#7-team-self-assessment-v4-assuming-full-execution)) |

## Colours

Primary `#9D4EDD` · Secondary `#FF9100` · Tertiary `#FFC880` · Neutral `#0F061E` · Deep purples `#5A189A`, `#3C096C`. Fonts: Plus Jakarta Sans (headlines), Inter (body), JetBrains Mono (labels). Details in [design-system.md](design-system.md).

## Which doc wins

When documents disagree: the **Official Rules** win over everything; the **PRD** wins on scope; the **proposal** wins on maths and rationale; **architecture** wins on design. Fix the losing document.
