// One machine's cycles over a date range; minutes per cycle are computed by the calculator.
export default {
  params: ["machine", "from", "to"],
  maxRows: 5000,
  lightning: `SELECT DISTINCT cycle_id, started_at, ended_at FROM smartflux_pg.machine_cycles
              WHERE machine_id = :machine AND started_at >= :from AND started_at < :to AND ended_at < :as_of_end`,
  sqlite: `SELECT DISTINCT cycle_id, started_at, ended_at FROM machine_cycles
           WHERE machine_id = :machine AND started_at >= :from AND started_at < :to AND ended_at < :as_of_end`,
};
