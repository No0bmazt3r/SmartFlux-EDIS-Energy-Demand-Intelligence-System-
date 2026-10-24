// Customer view: each machine at a moment `at` on the as_of day. busy_until is set when a paid cycle spans `at`;
// the price range comes from cycles up to `at` (duplicates in the payment log removed).
export default {
  params: ["outlet", "at"],
  lightning: `SELECT m.machine_id, m.name, m.type, m.heat_source,
                     MAX(CASE WHEN c.ended_at > :at THEN c.ended_at END) AS busy_until,
                     MIN(c.price_rm) AS price_from_rm, MAX(c.price_rm) AS price_to_rm
              FROM smartflux_pg.machines m
              LEFT JOIN (SELECT DISTINCT cycle_id, machine_id, price_rm, started_at, ended_at FROM smartflux_pg.machine_cycles) c
                ON c.machine_id = m.machine_id AND c.started_at <= :at AND c.started_at < :as_of_end
              WHERE m.outlet_id = :outlet AND m.installed_on < :as_of_end
              GROUP BY m.machine_id, m.name, m.type, m.heat_source ORDER BY m.machine_id`,
  sqlite: `SELECT m.machine_id, m.name, m.type, m.heat_source,
                  MAX(CASE WHEN c.ended_at > :at THEN c.ended_at END) AS busy_until,
                  MIN(c.price_rm) AS price_from_rm, MAX(c.price_rm) AS price_to_rm
           FROM machines m
           LEFT JOIN (SELECT DISTINCT cycle_id, machine_id, price_rm, started_at, ended_at FROM machine_cycles) c
             ON c.machine_id = m.machine_id AND c.started_at <= :at AND c.started_at < :as_of_end
           WHERE m.outlet_id = :outlet AND m.installed_on < :as_of_end
           GROUP BY m.machine_id, m.name, m.type, m.heat_source ORDER BY m.machine_id`,
};
