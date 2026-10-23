-- SmartFlux synthetic business data: the smartflux-pg container (docker-compose.yml), reached from the
-- Zetaris containers through ${PG_HOST_FOR_ZETARIS}. ${...} values come from .env; the setup script masks
-- the password when it prints statements. One statement per call, no trailing semicolons (Zetaris AGENTS.md).
CREATE DATASOURCE smartflux_pg DESCRIBE BY "SmartFlux synthetic laundromat data" OPTIONS (
  jdbcdriver "org.postgresql.Driver",
  jdbcurl "jdbc:postgresql://${PG_HOST_FOR_ZETARIS}:${PGPORT}/${PGDATABASE}",
  username "${PGUSER}",
  password "${PGPASSWORD}"
)
-- @@
REGISTER DATASOURCE TABLES FROM smartflux_pg
