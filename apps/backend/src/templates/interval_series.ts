// Half-hourly kWh for one outlet over a date range (regression and solar inputs).
export default {
  params: ["outlet", "from", "to"],
  maxRows: 5000,
  lightning: `SELECT interval_start, kwh, period FROM lightning.metastore.smartflux.energy.interval_usage
              WHERE outlet_id = :outlet AND interval_start >= :from AND interval_start < :to AND interval_start < :as_of_end
              ORDER BY interval_start`,
  sqlite: `SELECT interval_start, kwh, period FROM interval_usage
           WHERE outlet_id = :outlet AND interval_start >= :from AND interval_start < :to AND interval_start < :as_of_end
           ORDER BY interval_start`,
};
