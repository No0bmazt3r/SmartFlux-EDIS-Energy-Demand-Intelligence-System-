// Service records for one machine, up to as_of.
export default {
  params: ["machine"],
  lightning: `SELECT serviced_on, work_done FROM smartflux_pg.service_log
              WHERE machine_id = :machine AND serviced_on < :as_of_end ORDER BY serviced_on`,
  sqlite: `SELECT serviced_on, work_done FROM service_log
           WHERE machine_id = :machine AND serviced_on < :as_of_end ORDER BY serviced_on`,
};
