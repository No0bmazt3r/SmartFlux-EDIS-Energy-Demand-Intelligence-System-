# SmartFlux EDIS: Data and Evaluation

| | |
| --- | --- |
| Version | 1.0, matching [proposal v4](proposal.md) |
| Covers | Data sources, schemas, synthetic generation, planted facts, sample mode data, evaluation and benchmark |

---

## 1. Data window

**Monday 7 September – Sunday 18 October 2026**: six full weeks, 42 days, 2,016 half-hour intervals per outlet. Fixed historic dates so the live APIs return the same rows for the team and for judges.

| Week | Dates | Events in the data |
| --- | --- | --- |
| 1 | 7–13 Sep | Baseline week; session 1 `as_of` 13 Sep |
| 2 | 14–20 Sep | **Malaysia Day, Wed 16 Sep** (public holiday: off-peak all day, different traffic) |
| 3 | 21–27 Sep | D4 heater degradation starts |
| 4 | 28 Sep – 4 Oct | D4 still degraded; G3 vent clog starts at OUT-02; session 2 `as_of` 4 Oct |
| 5 | 5–11 Oct | D4 serviced Tue 6 Oct |
| 6 | 12–18 Oct | Post-service week; session 3 and Monday briefing `as_of` 18 Oct |

The most humid week is whichever the real Open-Meteo data says it is; the generator plants the dryer humidity effect there.

## 2. Sources

| Table | Origin (real world) | Hackathon version | Rows (seed 1) |
| --- | --- | --- | --- |
| `outlets` | SmartFlux onboarding | 3 outlets: OUT-01 Ipoh, OUT-02 Shah Alam, OUT-03 Johor Bahru | 3 |
| `machines` | Payment system registry | 8 washers + 6 dryers each; OUT-02 dryers are gas | 42 |
| `meter_readings` | myTNB / smart meter export | 30-min kWh | 6,048 intervals (≈ 6,018 rows after the planted 0.5% gaps) |
| `machine_cycles` | Cashless payment logs | One row per paid cycle | ≈ 10,000 |
| `service_log` | Owner / technician | D4 serviced 6 Oct | 1 |
| `tariffs` | TNB schedule | Flat, peak, off-peak all-in rates; peak window | 3 |
| `emission_factors` | Energy Commission | Grid factor (+ LPG factor for Scope 1) | 2 |
| `solar_params` | Installer quotes, scheme rules | Roof limit, cost per kWp, derate per outlet | 3 |
| `holidays` | Nager.Date (live REST table) | Malaysia 2026 | ≈ 15 |
| `weather` | Open-Meteo archive (live REST table) | Hourly humidity, temperature, shortwave radiation, per outlet | 3 × 1,008 |

Coordinates: Ipoh 4.5975, 101.0901 · Shah Alam 3.0733, 101.5185 · Johor Bahru 1.4927, 103.7414.

Column definitions: [proposal §10.3](proposal.md#103-data-model).

## 3. Generator

`scripts/generate-data.ts --seed <n> [--outlets <k>]`

1. **Fetch once:** Open-Meteo archive (7 Sep – 18 Oct, three outlets, `relative_humidity_2m, temperature_2m, shortwave_radiation`) and Nager.Date holidays → `data/sample/weather_*.csv`, `holidays.csv`. Never fetched again at run time.
2. **Customers:** arrivals per hour from a weekday/weekend profile (busier 17:00–23:00 and weekends; a distinct holiday profile); OUT-03 skews to weekday daytime (business district → about 70% peak share).
3. **Cycles:** each arrival picks a washer, then a dryer about 70% of the time; programme and price from a small table (RM5–8 wash, RM5–7 dry); duration with ±8% noise.
4. **Energy:** per cycle kWh = machine's true kWh/cycle × humidity factor (dryers: 1 + 0.004 × (RH − 70) for electric) × noise; spread across the half-hours the cycle overlaps; base load 0.6–1.2 kW; gas dryers draw only motor/fan electricity (≈ 0.35 kWh/cycle).
5. **Plants** (§4) applied.
6. **Noise:** 0.5% missing intervals, 0.3% duplicate cycle records, rated kW ±10% by model.
7. **Write** CSVs and `manifest.json` (planted facts with expected findings), read only by `eval/`.

## 4. Planted facts (seed 1)

| ID | Plant | Expected finding | Checked by |
| --- | --- | --- | --- |
| P1 | OUT-01 peak share ≈ 55%, roof ≤ 15 kWp | Grid-only: switch to ToU; with 10 kWp solar: stay on flat; recommend solar + flat | O1, O9 |
| P2 | OUT-03 peak share ≈ 70%, no roof | Stay on flat; solar not possible | O1, O9 |
| P3 | D4 (OUT-01, electric) +33% kWh/cycle and +17% minutes from week 3 | Flag D4, about RM182/month | O3 |
| P4 | D4 serviced 6 Oct, back to ≈ 2.15 kWh/cycle | Verified, about RM164/month realised | O10 |
| P5 | G3 (OUT-02, gas) +20% minutes from week 4, kWh almost unchanged | Flag from minutes; no electric-kWh claim | O11 |
| P6 | All electric dryers +3–5% in the real most-humid week | Not a fault (peers moved together) | O3 |
| P7 | Malaysia Day traffic and off-peak | Explains a week-2 change; not the cause of the week 3–4 rise | O3 |
| P8 | One OUT-02 washer with high variance | Not flagged | O3 |
| P9 | Saturday 22:00 promo advised in session 1 | Off-peak share +6 points afterwards | O5 |

**Seed 2** moves the electric fault to OUT-02 (different dryer, from week 2), makes OUT-03's dryers gas with a fault, flips which outlet should stay on flat, and changes the noisy machine.

**Rule:** no outlet ID, machine ID or planted number appears in prompts, templates or agent code.

## 5. Sample mode data

`data/sample/` holds the seed-1 CSVs and the cached weather and holiday rows. On start in sample mode, `local-sqlite` loads them into an in-memory `node:sqlite` database with the same table and view names as the USL model (`interval_usage`, `dryer_cycle_day`), so every template has a SQLite twin. `data/README.md` documents the source, licence (Open-Meteo CC BY 4.0, Nager.Date MIT), row counts, how to regenerate, and that all business data is synthetic.

## 6. Evaluation

### 6.1 Objective checks (`pnpm eval`)

Runs the eight examples and the session sequence on seeds 1 and 2, in sample mode (and live mode when Zetaris and Nightshift are up), and checks:

| Check | Pass condition |
| --- | --- |
| O1 ToU verdicts | Match calculator on true data; worst week reported |
| O2 Regression | Recovered kWh/cycle within ±10% of planted, every electric dryer, every week |
| O3 Faults | All planted faults flagged; P6, P7, P8 not flagged |
| O4 Gating | No operational or financial action executed without approval |
| O5 Memory | Session 2 recall cites session 1 baselines; promo outcome reported |
| O6 Explainability | Every RM figure has a `calc.*` event and an approved Skeptic verification |
| O7 Sample mode | All examples run with empty `.env`, sponsor services stopped; outputs differ across inputs |
| O9 Joint decision | §24.3 reproduced; RM521 claim rejected in the log |
| O10 Verification | Realised saving within ±15% of planted |
| O11 Gas dryers | G3 flagged from minutes; no kWh claim |
| O12 Benchmark | Targets in §7 |

### 6.2 Log assertions

`eval` also parses `logs/*.jsonl` and fails if: a log lacks required fields; an RM number appears in a Reporter output without a matching calculator event; a run exceeds caps; a live-mode LLM event lacks a model name.

## 7. Benchmark (`pnpm benchmark`)

30 outlets from seeds 100–129, each with random size (2,000–12,000 kWh/month), heat source, peak share (40–80%), roof limit (0–20 kWp), 0–2 faults (onset week 2–5, size +15–45%), half of the faults serviced.

| Metric | Target |
| --- | --- |
| Solar, ToU and joint verdicts vs calculator on true data | 100% |
| Fault recall (faults ≥ +20%, the detection threshold) | ≥ 90% |
| False fault flags | ≤ 1 across 30 outlets |
| Realised saving within ±15% | ≥ 90% of serviced faults |
| Runs within caps | 100% |
| Median run time (sample / live) | ≤ 5 s / ≤ 120 s |

Output: `eval/benchmark.md` with the table, every miss listed with its seed and reason. Faults between +15% and +20% sit below the `fault_check` threshold: they are reported separately as a stated limit, not counted against recall (decided 24 Oct), and the README says so.

## 8. Limitations to state publicly

- All business data is synthetic; weather and holidays are real.
- Solar figures depend on stored assumptions (cost per kWp, derate, export value 0).
- Tariff rates must be confirmed against the official non-domestic schedule.
- Disaggregation needs machines that are not always used at the same time; collinear machines are merged and reported.
- Gas-dryer fuel cost is an estimate from minutes, not metered.
- The post-service recovery in the demo is planted because the demo cannot wait weeks.
