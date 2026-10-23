// Roof limit, installed cost and derate per outlet (installer quotes and Solar ATAP rules; shown as assumptions).
export default {
  params: ["outlet"],
  static: true,
  lightning: `SELECT roof_kwp_max, cost_rm_per_kwp, derate FROM smartflux_pg.solar_params WHERE outlet_id = :outlet`,
  sqlite: `SELECT roof_kwp_max, cost_rm_per_kwp, derate FROM solar_params WHERE outlet_id = :outlet`,
};
