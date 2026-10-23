// Malaysian public holidays in a date range (off-peak all day under ToU; different customer traffic).
export default {
  params: ["from", "to"],
  lightning: `SELECT date, name FROM smartflux_pg.holidays WHERE date >= :from AND date < :to AND date < :as_of_end ORDER BY date`,
  sqlite: `SELECT date, name FROM holidays WHERE date >= :from AND date < :to AND date < :as_of_end ORDER BY date`,
};
