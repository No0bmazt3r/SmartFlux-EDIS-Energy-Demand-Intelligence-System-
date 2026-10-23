// The outlet's machine registry (from the payment system).
export default {
  params: ["outlet"],
  lightning: `SELECT machine_id, name, type, heat_source FROM smartflux_pg.machines
              WHERE outlet_id = :outlet AND installed_on < :as_of_end ORDER BY machine_id`,
  sqlite: `SELECT machine_id, name, type, heat_source FROM machines
           WHERE outlet_id = :outlet AND installed_on < :as_of_end ORDER BY machine_id`,
};
