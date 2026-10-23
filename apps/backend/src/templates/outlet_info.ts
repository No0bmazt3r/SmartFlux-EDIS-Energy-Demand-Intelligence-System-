// The outlet record: location, tariff code, supply voltage and stored cost assumptions.
export default {
  params: ["outlet"],
  static: true,
  lightning: `SELECT outlet_id, name, state, tariff_code, voltage, lpg_rm_per_dryer_minute FROM smartflux_pg.outlets WHERE outlet_id = :outlet`,
  sqlite: `SELECT outlet_id, name, state, tariff_code, voltage, lpg_rm_per_dryer_minute FROM outlets WHERE outlet_id = :outlet`,
};
