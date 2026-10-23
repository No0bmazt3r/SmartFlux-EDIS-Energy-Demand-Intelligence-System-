// Half-hourly kWh for one outlet and week (regression and solar inputs).
export default {
  params: ["outlet", "week"],
  lightning: `SELECT interval_start, kwh, period FROM lightning.metastore.smartflux.energy.interval_usage
              WHERE outlet_id = :outlet AND week = :week AND interval_start < :as_of_end ORDER BY interval_start`,
  sqlite: `SELECT interval_start, kwh, period FROM interval_usage
           WHERE outlet_id = :outlet AND week = :week AND interval_start < :as_of_end ORDER BY interval_start`,
};
