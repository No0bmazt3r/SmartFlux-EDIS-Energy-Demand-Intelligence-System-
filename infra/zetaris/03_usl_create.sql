-- Unified Semantic Layer: the business view every query template reads. The peak/off-peak/holiday rule lives
-- here once (TNB ToU: Mon-Fri 14:00-22:00 is peak, public holidays are off-peak all day).
-- lightning.metastore must already exist (check: SHOW NAMESPACES OR TABLES IN lightning.metastore).
CREATE NAMESPACE IF NOT EXISTS lightning.metastore.smartflux
-- @@
COMPILE USL energy DEPLOY NAMESPACE lightning.metastore.smartflux DDL
CREATE TABLE interval_usage (
  outlet_id varchar(10) NOT NULL,
  interval_start varchar(19) NOT NULL,
  week int,
  kwh double,
  period varchar(8),
  is_holiday int
);
CREATE TABLE weather_hourly (
  outlet_id varchar(10) NOT NULL,
  hour varchar(19) NOT NULL,
  relative_humidity double,
  temperature_c double,
  shortwave_radiation double
)
-- @@
ACTIVATE USL TABLE lightning.metastore.smartflux.energy.interval_usage AS
SELECT m.outlet_id, m.interval_start,
       CAST(FLOOR(DATEDIFF(TO_DATE(m.interval_start), TO_DATE('2026-09-07')) / 7) AS INT) + 1 AS week,
       m.kwh,
       CASE WHEN h.date IS NULL AND DAYOFWEEK(TO_TIMESTAMP(m.interval_start)) BETWEEN 2 AND 6
                 AND HOUR(TO_TIMESTAMP(m.interval_start)) BETWEEN 14 AND 21
            THEN 'peak' ELSE 'offpeak' END AS period,
       CASE WHEN h.date IS NULL THEN 0 ELSE 1 END AS is_holiday
FROM smartflux_pg.meter_readings m
LEFT JOIN smartflux_pg.holidays h ON h.date = SUBSTR(m.interval_start, 1, 10)
-- @@
-- ${WEATHER_SOURCE} is weather_view.hourly (live REST, default) or smartflux_pg.weather (--weather pg).
ACTIVATE USL TABLE lightning.metastore.smartflux.energy.weather_hourly AS
SELECT outlet_id, hour, relative_humidity, temperature_c, shortwave_radiation FROM ${WEATHER_SOURCE}
