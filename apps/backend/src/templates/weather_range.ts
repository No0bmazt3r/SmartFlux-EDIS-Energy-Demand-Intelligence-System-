// Hourly humidity, temperature and radiation at the outlet (Open-Meteo, a live REST table in Zetaris).
export default {
  params: ["outlet", "from", "to"],
  maxRows: 2000,
  lightning: `SELECT hour, relative_humidity, temperature_c, shortwave_radiation FROM lightning.metastore.smartflux.energy.weather_hourly
              WHERE outlet_id = :outlet AND hour >= :from AND hour < :to AND hour < :as_of_end ORDER BY hour`,
  sqlite: `SELECT hour, relative_humidity, temperature_c, shortwave_radiation FROM weather
           WHERE outlet_id = :outlet AND hour >= :from AND hour < :to AND hour < :as_of_end ORDER BY hour`,
};
