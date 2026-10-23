// Scope 1 and 2 emissions (proposal §15.8). Factors live in emission_factors and are cited on every export.
export function co2Calc(i: { grid_kwh: number; grid_kg_per_kwh: number; lpg_kg?: number; lpg_kg_co2_per_kg?: number; avoided_kwh?: number }) {
  return {
    scope2_tco2e: (i.grid_kwh * i.grid_kg_per_kwh) / 1000,
    scope1_tco2e: ((i.lpg_kg ?? 0) * (i.lpg_kg_co2_per_kg ?? 0)) / 1000,
    avoided_tco2e: ((i.avoided_kwh ?? 0) * i.grid_kg_per_kwh) / 1000,
  };
}
