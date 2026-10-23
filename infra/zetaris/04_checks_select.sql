-- Read-only checks run by `pnpm smoke` after setup (expected values from the seed-1 sample data).
SELECT 1 AS one
-- @@
SHOW LIGHTNING DATABASES
-- @@
SELECT COUNT(*) AS n FROM smartflux_pg.meter_readings
-- @@
SELECT COUNT(*) AS n FROM lightning.metastore.smartflux.energy.weather_hourly
-- @@
-- The federated query: Postgres meter data joined to the live weather REST table and the USL periods.
SELECT u.outlet_id, u.period, ROUND(SUM(u.kwh), 1) AS kwh, ROUND(AVG(w.relative_humidity), 1) AS avg_humidity
FROM lightning.metastore.smartflux.energy.interval_usage u
JOIN lightning.metastore.smartflux.energy.weather_hourly w ON w.outlet_id = u.outlet_id AND w.hour = CONCAT(SUBSTR(u.interval_start, 1, 14), '00:00')
WHERE u.outlet_id = 'OUT-01'
GROUP BY u.outlet_id, u.period
