// All-in rates in force at as_of for the outlet's tariff. Rates live in one table; every card lists the ones used.
export default {
  params: ["outlet"],
  lightning: `SELECT t.period, t.rate_rm_per_kwh, t.peak_days, t.peak_start, t.peak_end, t.effective_from
              FROM smartflux_pg.tariffs t JOIN smartflux_pg.outlets o ON o.tariff_code = t.tariff_code
              WHERE o.outlet_id = :outlet AND t.effective_from < :as_of_end`,
  sqlite: `SELECT t.period, t.rate_rm_per_kwh, t.peak_days, t.peak_start, t.peak_end, t.effective_from
           FROM tariffs t JOIN outlets o ON o.tariff_code = t.tariff_code
           WHERE o.outlet_id = :outlet AND t.effective_from < :as_of_end`,
};
