// Every outlet in the network (peer control group for promo checks).
export default {
  params: [],
  static: true,
  lightning: `SELECT outlet_id, name FROM smartflux_pg.outlets ORDER BY outlet_id`,
  sqlite: `SELECT outlet_id, name FROM outlets ORDER BY outlet_id`,
};
