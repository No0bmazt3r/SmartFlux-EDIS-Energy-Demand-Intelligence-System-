// Every paid cycle that overlaps a date range, de-duplicated (payment logs contain repeated records).
export default {
  params: ["outlet", "from", "to"],
  maxRows: 20000,
  lightning: `SELECT DISTINCT c.cycle_id, c.machine_id, c.started_at, c.ended_at
              FROM smartflux_pg.machine_cycles c JOIN smartflux_pg.machines m ON m.machine_id = c.machine_id
              WHERE m.outlet_id = :outlet AND c.ended_at > :from AND c.started_at < :to AND c.ended_at < :as_of_end`,
  sqlite: `SELECT DISTINCT c.cycle_id, c.machine_id, c.started_at, c.ended_at
           FROM machine_cycles c JOIN machines m ON m.machine_id = c.machine_id
           WHERE m.outlet_id = :outlet AND c.ended_at > :from AND c.started_at < :to AND c.ended_at < :as_of_end`,
};
