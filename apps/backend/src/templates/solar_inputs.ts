// Half-hourly load joined to the hour's real solar radiation (federated: meter data + Open-Meteo REST table).
export default {
  params: ["outlet", "from", "to"],
  maxRows: 5000,
  lightning: `SELECT u.interval_start, u.week, u.kwh, u.period, w.shortwave_radiation
              FROM lightning.metastore.smartflux.energy.interval_usage u
              LEFT JOIN weather_view.hourly w ON w.outlet_id = u.outlet_id AND w.hour = date_trunc('HOUR', u.interval_start)
              WHERE u.outlet_id = :outlet AND u.interval_start >= :from AND u.interval_start < :to AND u.interval_start < :as_of_end
              ORDER BY u.interval_start`,
  sqlite: `SELECT u.interval_start, u.week, u.kwh, u.period, w.shortwave_radiation
           FROM interval_usage u
           LEFT JOIN weather w ON w.outlet_id = u.outlet_id AND w.hour = substr(u.interval_start, 1, 14) || '00:00'
           WHERE u.outlet_id = :outlet AND u.interval_start >= :from AND u.interval_start < :to AND u.interval_start < :as_of_end
           ORDER BY u.interval_start`,
};
