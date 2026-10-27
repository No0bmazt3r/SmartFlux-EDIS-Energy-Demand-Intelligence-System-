// One outlet's screens: the customer view (FR-38 to FR-41) and the owner's home and machines (FR-30, FR-36).
// Machine state comes from the same templates the agent uses; what the agent advised and the owner decided comes from H-MEM.
import type { SampleDb } from "../adapters/local-sqlite.ts";
import { ratesFromRows } from "../calc/tou.ts";
import type { Config } from "../config.ts";
import { openHmem, type MemoryRecord } from "../engines/hmem/index.ts";
import { WINDOW, type Lang } from "../orchestrator/state.ts";
import { addDays } from "../orchestrator/windows.ts";
import { adminOverview, dataQuery, fitRange, readRuns } from "./admin.ts";

export const REPORT_REASONS = ["wont_start", "not_heating", "too_long", "other"] as const;
const minutesBetween = (from: string, to: string) => {
  const t = (s: string) => Date.parse(`${String(s).replace(" ", "T").replace(/Z$/, "")}Z`);
  return Math.max(0, Math.round((t(to) - t(from)) / 60000));
};
const visible = (cfg: Config, outlet: string, asOf: string) =>
  openHmem(cfg.hmemDir, cfg.logDir).all().filter((m) => m.as_of <= asOf && m.entities.includes(outlet));
const approved = (memory: MemoryRecord[], type: string) =>
  memory.filter((m) => m.tags.includes("decision") && m.tags.includes("approved") && m.data.type === type);

export async function availability(cfg: Config, db: SampleDb, outlet: string, asOf: string, at = `${asOf} 10:30:00`) { // demo "now": a busy mid-morning
  const q = dataQuery(cfg, asOf, db);
  const rows = await q("machine_status", { outlet, at });
  const services = await q("services_range", { outlet, from: WINDOW.start, to: addDays(asOf, 1) });
  const memory = visible(cfg, outlet, asOf);
  // Maintenance gate (FR-39): only a service the owner approved, and the agent only proposes one for a fault the Skeptic
  // approved. Shown until the service log records the work. An unapproved flag never reaches customers.
  const maintenance = new Set(approved(memory, "schedule_service")
    .filter((d) => !services.some((s) => s.machine_id === d.data.target && s.serviced_on >= d.as_of)).map((d) => d.data.target));
  return {
    outlet_id: outlet, as_of: asOf, at, mode: cfg.mode.data === "zetaris" ? "live" : "sample",
    machines: rows.map((r) => ({
      machine_id: r.machine_id, name: r.name, type: r.type, heat_source: r.heat_source,
      price_from_rm: r.price_from_rm, price_to_rm: r.price_to_rm,
      status: maintenance.has(r.machine_id) ? "maintenance" : r.busy_until ? "in_use" : "free",
      minutes_left: !maintenance.has(r.machine_id) && r.busy_until ? minutesBetween(at, r.busy_until) : null,
      cycle_minutes: !maintenance.has(r.machine_id) && r.busy_until ? minutesBetween(r.busy_from, r.busy_until) : null,
    })),
    // FR-40: a promo reaches customers only once the owner approved it.
    promos: approved(memory, "run_promo").map((d) => ({ slot: d.data.target, approved_as_of: d.as_of })),
  };
}

export function recordReport(cfg: Config, outlet: string, asOf: string, machine: { machine_id: string; name: string }, reason: string) {
  return openHmem(cfg.hmemDir, cfg.logDir).write({
    content: `Customer reported ${machine.name}: ${reason.replace("_", " ")}`, type: "factual", layer: "working", as_of: asOf,
    tags: ["customer_report", reason], entities: [outlet, machine.machine_id], agentId: "Customer", runId: "-", confidence: 0.5,
    data: { machine_id: machine.machine_id, reason },
  });
}

export async function ownerView(cfg: Config, db: SampleDb, outlet: string, asOf: string, lang: Lang = "en") {
  const o = await adminOverview(cfg, asOf, db, outlet, lang);
  const q = dataQuery(cfg, asOf, db);
  const rates = ratesFromRows(await q("tariff_rates", { outlet }) as any);
  const lpg = Number((await q("outlet_info", { outlet }))[0].lpg_rm_per_dryer_minute);
  const status = await availability(cfg, db, outlet, asOf);
  const hmem = openHmem(cfg.hmemDir, cfg.logDir);
  const baselines = hmem.recall({ asOf, tags: ["baseline", "machine"], entities: [outlet], topN: 100 }, "Owner app").memories.map((m) => m.memory);
  const reports = visible(cfg, outlet, asOf).filter((m) => m.tags.includes("customer_report"));
  const machines = status.machines.map((m) => {
    const b = baselines.find((x) => x.data.machine_id === m.machine_id);
    const flag = o.flagged_machines.find((f) => f.machine_id === m.machine_id);
    const kwh = b?.data.kwh?.value, minutes = b?.data.minutes?.value;
    return {
      ...m,
      normal: b ? { kwh_per_cycle: kwh ?? null, kwh_se: b.data.kwh?.se ?? null, minutes_per_cycle: minutes ?? null, learned_as_of: b.as_of } : null,
      cost_per_cycle_rm: m.heat_source === "gas" ? (minutes ? minutes * lpg : null) : (kwh ? kwh * rates.flat : null),
      health: !flag ? "ok" : /verified: verified/.test(flag.status) ? "serviced_verified" : flag.status === "approved" ? "service_approved" : "flagged",
      flag: flag ?? null,
      customer_reports: reports.filter((r) => r.data.machine_id === m.machine_id).map((r) => ({ reason: r.data.reason, as_of: r.as_of })),
    };
  });
  // Week-by-week reading per machine (weeks start Mon 7 Sep; a partial last week counts from 3 days), plus service dates.
  const machineRows = await q("machine_list", { outlet }) as any[];
  const weeks: { week: number; from: string; fit: Awaited<ReturnType<typeof fitRange>> }[] = [];
  for (let from = WINDOW.start, w = 1; from <= asOf; from = addDays(from, 7), w++) {
    const to = addDays(from, 7) <= addDays(asOf, 1) ? addDays(from, 7) : addDays(asOf, 1);
    if ((Date.parse(to) - Date.parse(from)) / 86400000 >= 3) weeks.push({ week: w, from, fit: await fitRange(q, cfg, asOf, outlet, from, to, machineRows) });
  }
  const services = await q("services_range", { outlet, from: WINDOW.start, to: addDays(asOf, 1) });
  for (const m of machines as any[]) {
    m.weekly = weeks.map((w) => ({ week: w.week, from: w.from, ...(w.fit?.readings[m.machine_id] ?? { value: null }) }));
    m.serviced_on = services.filter((s) => s.machine_id === m.machine_id).map((s) => s.serviced_on);
  }
  const briefing = readRuns(cfg.logDir, 500).find((r) => r.outlet_id === outlet && r.briefing && r.as_of <= asOf) ?? null;
  return {
    as_of: asOf, outlet: o.outlets[0], rates, machines, briefing, advice: o.advice_scoreboard,
    verified_savings_rm_per_month: o.verified_savings_rm_per_month, run_log: o.run_log,
  };
}

// GET /outlets/:id/day?as_of&date: one day of half-hourly meter readings, the peak window and a typical day, for the
// HQ "Daily load" chart. Only what the meter recorded: the typical line is the average of the same half-hour on the
// same kind of day (working day vs weekend/holiday) over the 4 weeks before. Default date: the latest working day
// (one with peak half-hours) up to as_of, since a Sunday has no peak window to show.
export async function dayLoad(cfg: Config, db: SampleDb, outlet: string, asOf: string, date?: string) {
  const q = dataQuery(cfg, asOf, db);
  const from = addDays(asOf, -35) < WINDOW.start ? WINDOW.start : addDays(asOf, -35);
  const rows = await q("interval_series", { outlet, from: `${from} 00:00:00`, to: `${addDays(asOf, 1)} 00:00:00` }) as { interval_start: string; kwh: number; period: string }[];
  const byDay = new Map<string, { t: string; kwh: number; peak: boolean }[]>();
  for (const r of rows) {
    const d = r.interval_start.slice(0, 10);
    if (!byDay.has(d)) byDay.set(d, []);
    byDay.get(d)!.push({ t: r.interval_start.slice(11, 16), kwh: Number(r.kwh), peak: r.period === "peak" });
  }
  const dates = [...byDay.keys()].sort();
  const working = (d: string) => byDay.get(d)!.some((x) => x.peak);
  const day = date && byDay.has(date) ? date : [...dates].reverse().find(working) ?? dates.at(-1);
  if (!day) return { outlet_id: outlet, as_of: asOf, date: null, dates, slots: [], summary: null };
  const kind = working(day);
  const peers = dates.filter((d) => d < day && d >= addDays(day, -28) && working(d) === kind);
  const slots = byDay.get(day)!.map((s) => {
    const same = peers.map((d) => byDay.get(d)!.find((x) => x.t === s.t)?.kwh).filter((v): v is number => v != null);
    return { ...s, typical: same.length ? same.reduce((a, b) => a + b, 0) / same.length : null };
  });
  const rates = ratesFromRows(await q("tariff_rates", { outlet }) as any);
  const kwh = slots.reduce((a, s) => a + s.kwh, 0), peakKwh = slots.filter((s) => s.peak).reduce((a, s) => a + s.kwh, 0);
  const busiest = slots.reduce((m, s) => (s.kwh > m.kwh ? s : m), slots[0]);
  return {
    outlet_id: outlet, as_of: asOf, date: day, dates, working_day: kind, typical_days: peers.length, rates,
    slots, // 48 half-hours: t (HH:MM), kwh, peak, typical
    summary: { kwh, peak_kwh: peakKwh, peak_share: kwh ? peakKwh / kwh : 0, cost_flat_rm: kwh * rates.flat,
      cost_tou_rm: peakKwh * rates.peak + (kwh - peakKwh) * rates.offpeak, busiest: { t: busiest.t, kw: busiest.kwh * 2 } },
  };
}
