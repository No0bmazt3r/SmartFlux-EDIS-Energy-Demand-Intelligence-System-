-- Live public API: Open-Meteo archive (no key), fixed dates so every run sees the same rows.
-- Hourly humidity, temperature and shortwave radiation drive the solar yield and the humidity check.
CREATE LIGHTNING DATABASE weather_rest DESCRIBE BY "Open-Meteo archive hourly weather, 7 Sep - 18 Oct 2026"
-- @@
CREATE LIGHTNING REST TABLE out_01 FROM weather_rest REQUEST (
  endpoint "https://archive-api.open-meteo.com/v1/archive?latitude=4.5975&longitude=101.0901&start_date=2026-09-07&end_date=2026-10-18&hourly=relative_humidity_2m,temperature_2m,shortwave_radiation&timezone=Asia%2FKuala_Lumpur",
  method "get", response_type "json", http_encoding "URLENCODED"
) HEADER () BODY ()
-- @@
CREATE LIGHTNING REST TABLE out_02 FROM weather_rest REQUEST (
  endpoint "https://archive-api.open-meteo.com/v1/archive?latitude=3.0733&longitude=101.5185&start_date=2026-09-07&end_date=2026-10-18&hourly=relative_humidity_2m,temperature_2m,shortwave_radiation&timezone=Asia%2FKuala_Lumpur",
  method "get", response_type "json", http_encoding "URLENCODED"
) HEADER () BODY ()
-- @@
CREATE LIGHTNING REST TABLE out_03 FROM weather_rest REQUEST (
  endpoint "https://archive-api.open-meteo.com/v1/archive?latitude=1.4927&longitude=103.7414&start_date=2026-09-07&end_date=2026-10-18&hourly=relative_humidity_2m,temperature_2m,shortwave_radiation&timezone=Asia%2FKuala_Lumpur",
  method "get", response_type "json", http_encoding "URLENCODED"
) HEADER () BODY ()
-- @@
CREATE SCHEMASTORE CONTAINER weather_view
-- @@
-- Open-Meteo returns parallel arrays (hourly.time[], hourly.relative_humidity_2m[], ...). posexplode() pairs
-- them by position. The Lightning SQL companion says this pattern "has not been confirmed in this repo";
-- if it fails, run the setup with --weather pg to build weather_hourly from the Postgres copy instead.
CREATE SCHEMASTORE VIEW hourly WITH CONTAINER weather_view AS
SELECT 'OUT-01' AS outlet_id, CONCAT(REPLACE(t, 'T', ' '), ':00') AS hour, w.hourly.relative_humidity_2m[i] AS relative_humidity,
       w.hourly.temperature_2m[i] AS temperature_c, w.hourly.shortwave_radiation[i] AS shortwave_radiation
FROM weather_rest.out_01 w LATERAL VIEW posexplode(w.hourly.time) p AS i, t
UNION ALL
SELECT 'OUT-02', CONCAT(REPLACE(t, 'T', ' '), ':00'), w.hourly.relative_humidity_2m[i], w.hourly.temperature_2m[i], w.hourly.shortwave_radiation[i]
FROM weather_rest.out_02 w LATERAL VIEW posexplode(w.hourly.time) p AS i, t
UNION ALL
SELECT 'OUT-03', CONCAT(REPLACE(t, 'T', ' '), ':00'), w.hourly.relative_humidity_2m[i], w.hourly.temperature_2m[i], w.hourly.shortwave_radiation[i]
FROM weather_rest.out_03 w LATERAL VIEW posexplode(w.hourly.time) p AS i, t
