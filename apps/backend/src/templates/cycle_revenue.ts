// Paid cycles and revenue per machine type over a date range (duplicates in the payment log removed).
export default {
  params: ["outlet", "from", "to"],
  lightning: `SELECT m.type, COUNT(DISTINCT c.cycle_id) AS cycles, SUM(c.price_rm) AS revenue_rm
              FROM (SELECT DISTINCT cycle_id, machine_id, price_rm, started_at FROM smartflux_pg.machine_cycles) c
              JOIN smartflux_pg.machines m ON m.machine_id = c.machine_id
              WHERE m.outlet_id = :outlet AND c.started_at >= :from AND c.started_at < :to AND c.started_at < :as_of_end
              GROUP BY m.type`,
  sqlite: `SELECT m.type, COUNT(DISTINCT c.cycle_id) AS cycles, SUM(c.price_rm) AS revenue_rm
           FROM (SELECT DISTINCT cycle_id, machine_id, price_rm, started_at FROM machine_cycles) c
           JOIN machines m ON m.machine_id = c.machine_id
           WHERE m.outlet_id = :outlet AND c.started_at >= :from AND c.started_at < :to AND c.started_at < :as_of_end
           GROUP BY m.type`,
};
