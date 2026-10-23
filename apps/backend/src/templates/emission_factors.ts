// Stored emission factors (grid electricity, LPG) with their source note.
export default {
  params: [],
  static: true,
  lightning: `SELECT factor_id, unit, value, source FROM smartflux_pg.emission_factors`,
  sqlite: `SELECT factor_id, unit, value, source FROM emission_factors`,
};
