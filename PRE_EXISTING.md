# Pre-existing work

Declared for Open Agent Hackathon 2026 (build window 22 Oct 2026, 00:00 UTC to 27 Oct 2026, 23:45 UTC).

## What existed before the window

A SmartFlux UI prototype in a separate repository: a pnpm monorepo with an Express 5 + TypeScript backend and a React 18 + Vite dashboard on mock data (one user, four records, hardcoded forecasts), plus a Gemini chatbot and a ForecastService.

Last commit before the window: `[hash — to fill in from the prototype repository]`

## What this repository contains

**Nothing from the prototype.** On 24 Oct the team decided to build fresh here, not import the prototype. Everything in this repository was written during the build window:

| Part | Where |
| --- | --- |
| Agents (Scout, Planner, Investigator, Skeptic, Reporter; rules and Nemotron versions) | `apps/backend/src/agents/` |
| Orchestrator, caps, memory use, tools | `apps/backend/src/orchestrator/` |
| Meterless H-MEM engine and intent routing | `apps/backend/src/engines/` |
| Calculators and tests | `apps/backend/src/calc/` |
| Query templates (Lightning SQL + SQLite) | `apps/backend/src/templates/` |
| Zetaris, Nightshift and SQLite adapters | `apps/backend/src/adapters/` |
| HTTP API and scheduler | `apps/backend/src/server.ts`, `scheduler.ts`, `server/` |
| Data generator, Zetaris setup, smoke test, examples | `scripts/` |
| Evaluation and benchmark | `eval/` |
| Postgres loader and Zetaris SQL | `infra/` |
| Customer, Owner and Admin web app (React 19 + Vite), written fresh, not taken from the prototype | `apps/frontend/` |
| Design docs | `docs/` |

No prototype component is reused in `apps/frontend`.

## Third-party code and data

No third-party code is copied into the repository. The backend has no runtime dependencies: it uses Node's standard library (`node:http`, `node:sqlite`, `fetch`), with `tsx` and `typescript` as dev tools. The frontend depends on React and React DOM (MIT), built with Vite; fonts and Material Symbols load from Google Fonts (OFL / Apache 2.0). Data: Open-Meteo archive weather (CC BY 4.0) and Malaysian public holiday dates; all business data is synthetic. The H-MEM engine is implemented from Meterless's published engine guide.
