// Every service record at an outlet in a date range (fallback when no approval is in memory).
export default {
  params: ["outlet", "from", "to"],
  lightning: `SELECT s.machine_id, s.serviced_on, s.work_done FROM smartflux_pg.service_log s JOIN smartflux_pg.machines m ON m.machine_id = s.machine_id
              WHERE m.outlet_id = :outlet AND s.serviced_on >= :from AND s.serviced_on < :to AND s.serviced_on < :as_of_end ORDER BY s.serviced_on`,
  sqlite: `SELECT s.machine_id, s.serviced_on, s.work_done FROM service_log s JOIN machines m ON m.machine_id = s.machine_id
           WHERE m.outlet_id = :outlet AND s.serviced_on >= :from AND s.serviced_on < :to AND s.serviced_on < :as_of_end ORDER BY s.serviced_on`,
};
