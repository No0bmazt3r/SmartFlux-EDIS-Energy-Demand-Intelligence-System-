-- Runs once, on the first start of the smartflux-pg container (docker-compose.yml).
-- Loads the seed-1 CSVs from data/sample (mounted read-only at /data). Timestamps stay as
-- 'YYYY-MM-DD HH:MM:SS' text so Zetaris and the local SQLite path compare them the same way.
CREATE TABLE outlets (outlet_id text PRIMARY KEY, name text, state text, lat double precision, lon double precision, tariff_code text, voltage text, lpg_rm_per_dryer_minute double precision);
CREATE TABLE machines (machine_id text PRIMARY KEY, outlet_id text REFERENCES outlets, name text, type text, heat_source text, rated_kw double precision, installed_on text, last_serviced_on text);
CREATE TABLE machine_cycles (cycle_id text, machine_id text REFERENCES machines, started_at text, ended_at text, program text, price_rm double precision); -- no PK: the payment log has duplicate records, templates use DISTINCT
CREATE TABLE meter_readings (outlet_id text REFERENCES outlets, interval_start text, kwh double precision, PRIMARY KEY (outlet_id, interval_start));
CREATE TABLE service_log (machine_id text REFERENCES machines, serviced_on text, work_done text);
CREATE TABLE solar_params (outlet_id text PRIMARY KEY REFERENCES outlets, roof_kwp_max double precision, cost_rm_per_kwp double precision, derate double precision);
CREATE TABLE tariffs (tariff_code text, period text, rate_rm_per_kwh double precision, peak_days text, peak_start text, peak_end text, effective_from text);
CREATE TABLE emission_factors (factor_id text PRIMARY KEY, unit text, value double precision, source text);
CREATE TABLE holidays (date text PRIMARY KEY, name text);
CREATE TABLE weather (outlet_id text, hour text, lat double precision, lon double precision, relative_humidity double precision, temperature_c double precision, shortwave_radiation double precision);

COPY outlets FROM '/data/outlets.csv' CSV HEADER;
COPY machines FROM '/data/machines.csv' CSV HEADER;
COPY machine_cycles FROM '/data/machine_cycles.csv' CSV HEADER;
COPY meter_readings FROM '/data/meter_readings.csv' CSV HEADER;
COPY service_log FROM '/data/service_log.csv' CSV HEADER;
COPY solar_params FROM '/data/solar_params.csv' CSV HEADER;
COPY tariffs FROM '/data/tariffs.csv' CSV HEADER;
COPY emission_factors FROM '/data/emission_factors.csv' CSV HEADER;
COPY holidays FROM '/data/holidays.csv' CSV HEADER;
COPY weather FROM '/data/weather.csv' CSV HEADER; -- fallback copy; the live source is the Open-Meteo REST table
