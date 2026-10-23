# Data

**All business data here is synthetic.** Weather and holidays are real.

| Folder | What |
| --- | --- |
| `raw/` | Real data fetched once by the generator and reused: `weather.csv` (Open-Meteo archive, hourly, 7 Sep – 18 Oct 2026, three outlets) and `holidays.csv` (Malaysian public holidays inside that window) |
| `sample/` | Seed 1: what sample mode runs on (the planted story in `docs/data-and-evaluation.md` §4) |
| `seed2/` | Seed 2: the anti-overfitting dataset (fault moved, OUT-03 gas, a different outlet stays on flat) |

Each seed folder has `outlets`, `machines`, `machine_cycles`, `meter_readings`, `service_log`, `tariffs`, `solar_params`, `emission_factors`, `holidays` and `weather` as CSV, plus `manifest.json`, which lists the planted facts. Only `eval/` reads the manifest. The agent never does.

Seed 1 row counts: 6,018 meter readings (0.5% of intervals deliberately missing), 10,020 machine cycles (0.3% deliberately duplicated), 42 machines.

## Regenerate

```bash
pnpm data:generate          # seed 1 -> data/sample, seed 2 -> data/seed2
```

Delete `data/raw/` to re-fetch the real weather and holidays.

## Sources and licences

| Data | Source | Licence |
| --- | --- | --- |
| Hourly humidity, temperature, shortwave radiation | [Open-Meteo](https://open-meteo.com/) historical weather API | CC BY 4.0: "Weather data by Open-Meteo.com" |
| Malaysian public holidays | Google's public "Holidays in Malaysia" calendar (Nager.Date has no Malaysia data) | Public facts; dates only |
| Tariff rates | All-in rates from the SmartFlux brief | **To confirm** against TNB's non-domestic schedule |
| Emission factors | Placeholder values | **To confirm** with the Energy Commission before quoting |
| Everything else | `scripts/generate-data.ts`, seeded | Synthetic, MIT like the rest of the repo |
