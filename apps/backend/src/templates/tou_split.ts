// kWh per week and tariff period for one outlet. Feeds tou_calc; the Skeptic re-runs it to verify tariff claims.
export default {
  params: ["outlet", "from", "to"],
  lightning: `SELECT week, period, SUM(kwh) AS kwh, COUNT(*) AS intervals
              FROM lightning.metastore.smartflux.energy.interval_usage
              WHERE outlet_id = :outlet AND interval_start >= :from AND interval_start < :to AND interval_start < :as_of_end
              GROUP BY week, period ORDER BY week, period`,
  sqlite: `SELECT week, period, SUM(kwh) AS kwh, COUNT(*) AS intervals
           FROM interval_usage
           WHERE outlet_id = :outlet AND interval_start >= :from AND interval_start < :to AND interval_start < :as_of_end
           GROUP BY week, period ORDER BY week, period`,
};
