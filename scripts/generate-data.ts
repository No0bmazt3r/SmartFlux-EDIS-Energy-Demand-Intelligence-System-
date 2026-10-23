// Seeded synthetic data generator. Real weather and holidays are fetched once into data/raw/
// and reused; everything else (outlets, machines, cycles, meter readings) is synthetic.
// Usage: tsx scripts/generate-data.ts --seed 1 --out data/sample
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";

const START = "2026-09-07"; // Monday, week 1
const DAYS = 42;
const RAW = "data/raw";

type Heat = "electric" | "gas";
type Fault = { machine: string; onsetWeek: number; pct: number; durPct: number; serviceDay?: string; postKwh?: number };
type OutletCfg = {
  id: string; name: string; state: string; lat: number; lon: number; heat: Heat;
  roofKwp: number; dailyCustomers: number; profile: "residential" | "business";
  baseKw: number; faults: Fault[]; noisyWasher?: string;
};

// Seed 1: the planted story in docs/data-and-evaluation.md §4.
// Seed 2: the fault moves, OUT-03 dryers become gas with a fault, the flat-tariff outlet flips, the noisy machine changes.
const SCENARIOS: Record<number, OutletCfg[]> = {
  1: [
    { id: "OUT-01", name: "Ipoh", state: "Perak", lat: 4.5975, lon: 101.0901, heat: "electric", roofKwp: 15, dailyCustomers: 50, profile: "residential", baseKw: 0.9,
      faults: [{ machine: "D4", onsetWeek: 3, pct: 0.33, durPct: 0.17, serviceDay: "2026-10-06", postKwh: 2.15 }] },
    { id: "OUT-02", name: "Shah Alam", state: "Selangor", lat: 3.0733, lon: 101.5185, heat: "gas", roofKwp: 12, dailyCustomers: 55, profile: "residential", baseKw: 1.1,
      faults: [{ machine: "G3", onsetWeek: 4, pct: 0.02, durPct: 0.2 }], noisyWasher: "W5" },
    { id: "OUT-03", name: "Johor Bahru", state: "Johor", lat: 1.4927, lon: 103.7414, heat: "electric", roofKwp: 0, dailyCustomers: 45, profile: "business", baseKw: 0.7,
      faults: [] },
  ],
  2: [
    { id: "OUT-01", name: "Ipoh", state: "Perak", lat: 4.5975, lon: 101.0901, heat: "electric", roofKwp: 15, dailyCustomers: 45, profile: "business", baseKw: 0.9,
      faults: [], noisyWasher: "W2" },
    { id: "OUT-02", name: "Shah Alam", state: "Selangor", lat: 3.0733, lon: 101.5185, heat: "electric", roofKwp: 12, dailyCustomers: 55, profile: "residential", baseKw: 1.1,
      faults: [{ machine: "D2", onsetWeek: 2, pct: 0.28, durPct: 0.14, serviceDay: "2026-10-07", postKwh: 2.1 }] },
    { id: "OUT-03", name: "Johor Bahru", state: "Johor", lat: 1.4927, lon: 103.7414, heat: "gas", roofKwp: 10, dailyCustomers: 50, profile: "residential", baseKw: 0.7,
      faults: [{ machine: "G5", onsetWeek: 3, pct: 0.02, durPct: 0.22 }] },
  ],
};

// Relative customer arrivals per hour (0–23). Scaled to dailyCustomers.
const PROFILES = {
  residential: {
    weekday: [0.4, 0.2, 0.1, 0.1, 0.1, 0.2, 0.6, 1.2, 1.6, 1.8, 1.8, 1.8, 1.8, 1.8, 2.0, 2.4, 3.0, 4.0, 4.6, 4.6, 4.2, 3.4, 2.2, 1.0],
    weekend: [0.6, 0.3, 0.2, 0.1, 0.1, 0.2, 0.8, 2.0, 3.2, 4.0, 4.2, 4.0, 3.6, 3.4, 3.4, 3.4, 3.6, 3.8, 3.8, 3.6, 3.0, 2.4, 1.8, 1.0],
  },
  business: {
    weekday: [0.1, 0.1, 0.0, 0.0, 0.0, 0.1, 0.3, 0.8, 1.2, 1.4, 1.6, 2.0, 2.6, 3.0, 4.2, 4.6, 4.8, 5.0, 4.8, 4.4, 3.8, 2.6, 0.6, 0.2],
    weekend: [0.1, 0.1, 0.0, 0.0, 0.0, 0.1, 0.2, 0.4, 0.6, 0.8, 0.9, 0.9, 0.9, 0.9, 0.9, 0.9, 0.9, 0.8, 0.8, 0.7, 0.6, 0.4, 0.2, 0.1],
  },
};

const WASH_PROGRAMS = [
  { program: "quick", minutes: 25, kwh: 0.25, price: 5 },
  { program: "normal", minutes: 32, kwh: 0.32, price: 6 },
  { program: "heavy", minutes: 40, kwh: 0.45, price: 8 },
];
const DRY = { minutes: 52, kwh: 2.1, gasKwh: 0.35, prices: [5, 6, 7] };

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pad = (n: number) => String(n).padStart(2, "0");
const dayStr = (d: number) => new Date(Date.UTC(2026, 8, 7 + d)).toISOString().slice(0, 10);
const tsStr = (min: number) => {
  const d = Math.floor(min / 1440), m = Math.round(min % 1440);
  return `${dayStr(d)} ${pad(Math.floor(m / 60))}:${pad(m % 60)}:00`;
};
const weekOf = (day: number) => Math.floor(day / 7) + 1;
const csv = (rows: Record<string, unknown>[]) =>
  rows.length ? [Object.keys(rows[0]).join(","), ...rows.map((r) => Object.values(r).join(","))].join("\n") + "\n" : "";

function readCsv(path: string) {
  const [head, ...lines] = readFileSync(path, "utf8").trim().split("\n");
  const keys = head.split(",");
  return lines.map((l) => Object.fromEntries(l.split(",").map((v, i) => [keys[i], v])));
}

async function fetchRaw(outlets: OutletCfg[]) {
  mkdirSync(RAW, { recursive: true });
  const wPath = join(RAW, "weather.csv"), hPath = join(RAW, "holidays.csv");
  if (!existsSync(wPath)) {
    const rows: Record<string, unknown>[] = [];
    for (const o of outlets) {
      const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${o.lat}&longitude=${o.lon}&start_date=${START}&end_date=${dayStr(DAYS - 1)}` +
        `&hourly=relative_humidity_2m,temperature_2m,shortwave_radiation&timezone=Asia%2FKuala_Lumpur`;
      const h = (await (await fetch(url)).json()).hourly;
      h.time.forEach((t: string, i: number) => rows.push({
        outlet_id: o.id, hour: t.replace("T", " ") + ":00", lat: o.lat, lon: o.lon,
        relative_humidity: h.relative_humidity_2m[i], temperature_c: h.temperature_2m[i], shortwave_radiation: h.shortwave_radiation[i],
      }));
    }
    writeFileSync(wPath, csv(rows));
  }
  if (!existsSync(hPath)) {
    // Nager.Date has no Malaysia data, so holidays come from Google's public Malaysia holiday calendar (fetched once).
    const ics = await (await fetch("https://calendar.google.com/calendar/ical/en.malaysia%23holiday%40group.v.calendar.google.com/public/basic.ics")).text();
    const rows = [...ics.matchAll(/DTSTART;VALUE=DATE:(\d{4})(\d{2})(\d{2})[\s\S]*?SUMMARY:([^\r\n]+)/g)]
      .map((m) => ({ date: `${m[1]}-${m[2]}-${m[3]}`, name: m[4].trim() }))
      .filter((r) => r.date >= START && r.date <= dayStr(DAYS - 1))
      .sort((a, b) => a.date.localeCompare(b.date));
    writeFileSync(hPath, csv(rows));
  }
  return { weather: readCsv(wPath), holidays: readCsv(hPath) };
}

function poisson(r: () => number, lambda: number) {
  let k = 0, p = 1;
  const l = Math.exp(-lambda);
  do { k++; p *= r(); } while (p > l);
  return k - 1;
}
const gauss = (r: () => number) => Math.sqrt(-2 * Math.log(r() || 1e-12)) * Math.cos(2 * Math.PI * r());

export async function generate(seed: number, out: string) {
  const outlets = SCENARIOS[seed];
  if (!outlets) throw new Error(`No scenario for seed ${seed}`);
  const r = rng(seed);
  const { weather, holidays } = await fetchRaw(SCENARIOS[1]);
  const holidaySet = new Set(holidays.map((h) => h.date));

  const humidity = new Map<string, number[]>(); // outlet -> RH per hour index
  for (const w of weather) {
    if (!humidity.has(w.outlet_id)) humidity.set(w.outlet_id, []);
    humidity.get(w.outlet_id)!.push(Number(w.relative_humidity));
  }

  const rows = { outlets: [] as any[], machines: [] as any[], cycles: [] as any[], meter: [] as any[], service: [] as any[], solar: [] as any[] };
  const plants: any[] = [];

  for (const o of outlets) {
    rows.outlets.push({ outlet_id: o.id, name: o.name, state: o.state, lat: o.lat, lon: o.lon, tariff_code: "LV-COM", voltage: "LV" });
    rows.solar.push({ outlet_id: o.id, roof_kwp_max: o.roofKwp, cost_rm_per_kwp: 3500, derate: 0.8 });

    // Planted humidity effect: electric dryers draw more in humid hours, with an extra bump in the real most-humid week.
    const rh = humidity.get(SCENARIOS[1].find((s) => s.lat === o.lat)!.id)!;
    const meanRh = rh.reduce((a, b) => a + b, 0) / rh.length;
    const weekRh = [0, 1, 2, 3, 4, 5].map((w) => rh.slice(w * 168, w * 168 + 168).reduce((a, b) => a + b, 0) / 168);
    const humidWeek = weekRh.indexOf(Math.max(...weekRh)) + 1;

    const dryPrefix = o.heat === "gas" ? "G" : "D";
    const machines = [
      ...Array.from({ length: 8 }, (_, i) => ({ name: `W${i + 1}`, type: "washer" as const, factor: 0.9 + 0.2 * r() })),
      ...Array.from({ length: 6 }, (_, i) => ({ name: `${dryPrefix}${i + 1}`, type: "dryer" as const, factor: 0.95 + 0.1 * r() })),
    ];
    for (const f of o.faults) machines.find((m) => m.name === f.machine)!.factor = 1; // baseline exactly 2.1 kWh/cycle for the faulty dryer
    for (const m of machines) {
      rows.machines.push({
        machine_id: `${o.id}-${m.name}`, outlet_id: o.id, name: m.name, type: m.type,
        heat_source: m.type === "dryer" ? o.heat : "electric",
        rated_kw: m.type === "dryer" ? (o.heat === "gas" ? 0.5 : 5.5) * (0.9 + 0.2 * r()) : 1.2 * (0.9 + 0.2 * r()),
        installed_on: "2023-03-01", last_serviced_on: "2026-06-15",
      });
    }

    const busy = new Map<string, number>(machines.map((m) => [m.name, -1]));
    const minuteKwh = new Float64Array(DAYS * 1440);
    const pickFree = (type: "washer" | "dryer", at: number) => {
      const free = machines.filter((m) => m.type === type && busy.get(m.name)! <= at);
      return free.length ? free[Math.floor(r() * free.length)] : undefined;
    };
    const addEnergy = (start: number, minutes: number, kwh: number) => {
      const s = Math.floor(start), e = Math.min(DAYS * 1440, Math.ceil(start + minutes));
      for (let t = s; t < e; t++) minuteKwh[t] += kwh / (e - s);
    };
    let cycleNo = 0;
    const runCycle = (m: (typeof machines)[number], start: number) => {
      const day = Math.floor(start / 1440), week = weekOf(day);
      let minutes: number, kwh: number, program: string, price: number;
      if (m.type === "washer") {
        const p = WASH_PROGRAMS[Math.floor(r() * 3)];
        minutes = p.minutes * (1 + 0.08 * gauss(r) * 0.5);
        const noise = m.name === o.noisyWasher ? 0.4 : 0.05;
        kwh = Math.max(0.05, p.kwh * m.factor * (1 + noise * gauss(r)));
        program = p.program; price = p.price;
      } else {
        const hourIdx = Math.min(rh.length - 1, Math.floor(start / 60));
        const fault = o.faults.find((f) => f.machine === m.name);
        const faulty = fault && week >= fault.onsetWeek && (!fault.serviceDay || dayStr(day) < fault.serviceDay);
        const serviced = fault?.serviceDay && dayStr(day) >= fault.serviceDay;
        minutes = DRY.minutes * (1 + (faulty ? fault!.durPct : 0)) * (1 + 0.04 * gauss(r));
        if (o.heat === "gas") {
          kwh = DRY.gasKwh * m.factor * (minutes / DRY.minutes) * (1 + 0.03 * gauss(r));
        } else {
          const humid = 1 + 0.004 * (rh[hourIdx] - meanRh) + (week === humidWeek ? 0.04 : 0);
          const base = serviced ? fault!.postKwh! : DRY.kwh * m.factor * (faulty ? 1 + fault!.pct : 1);
          kwh = base * humid * (1 + 0.05 * gauss(r));
        }
        program = "dry"; price = DRY.prices[Math.floor(r() * 3)];
      }
      busy.set(m.name, start + minutes + 2);
      addEnergy(start, minutes, kwh);
      const cycle = { cycle_id: `${o.id}-C${++cycleNo}`, machine_id: `${o.id}-${m.name}`, started_at: tsStr(start), ended_at: tsStr(start + minutes), program, price_rm: price };
      rows.cycles.push(cycle);
      if (r() < 0.003) rows.cycles.push({ ...cycle }); // planted duplicate record
      return start + minutes;
    };

    const prof = PROFILES[o.profile];
    const totalWeekday = prof.weekday.reduce((a, b) => a + b, 0), totalWeekend = prof.weekend.reduce((a, b) => a + b, 0);
    for (let day = 0; day < DAYS; day++) {
      const dow = (day % 7) + 1; // 1 = Monday … 7 = Sunday
      const offDay = dow >= 6 || holidaySet.has(dayStr(day));
      const shape = offDay ? prof.weekend : prof.weekday, total = offDay ? totalWeekend : totalWeekday;
      for (let h = 0; h < 24; h++) {
        let mult = 1;
        if (seed === 1 && o.id === "OUT-01" && day >= 7) { // P9: Saturday 22:00 promo advised in session 1
          if (dow === 6 && h >= 22) mult = 2.2;
          if (dow <= 5 && h >= 18 && h <= 20) mult = 0.93;
        }
        const n = poisson(r, (o.dailyCustomers * shape[h] * mult) / total);
        for (let k = 0; k < n; k++) {
          const at = day * 1440 + h * 60 + r() * 60;
          const w = pickFree("washer", at);
          if (!w) continue;
          const end = runCycle(w, at);
          if (r() < 0.7) {
            const dAt = end + 2 + 6 * r();
            const d = pickFree("dryer", dAt);
            if (d && dAt < DAYS * 1440 - DRY.minutes * 1.5) runCycle(d, dAt);
          }
        }
      }
    }

    for (let i = 0; i < DAYS * 48; i++) {
      const hour = Math.floor(i / 2) % 24;
      const baseKw = o.baseKw + (hour >= 19 || hour < 7 ? 0.2 : 0) + 0.05 * gauss(r);
      let kwh = baseKw * 0.5;
      for (let t = i * 30; t < i * 30 + 30; t++) kwh += minuteKwh[t];
      if (r() < 0.005) continue; // planted missing interval
      rows.meter.push({ outlet_id: o.id, interval_start: tsStr(i * 30), kwh: kwh.toFixed(4) });
    }

    for (const f of o.faults) {
      if (f.serviceDay) rows.service.push({ machine_id: `${o.id}-${f.machine}`, serviced_on: f.serviceDay, work_done: o.heat === "gas" ? "vent cleaned" : "heater element replaced" });
      plants.push({ outlet_id: o.id, machine: f.machine, heat_source: o.heat, onset_week: f.onsetWeek, kwh_pct: f.pct, minutes_pct: f.durPct, serviced_on: f.serviceDay ?? null,
        expected: o.heat === "gas" ? "flag from cycle minutes; no electric-kWh claim" : "flag from kWh per cycle" });
    }
    if (o.noisyWasher) plants.push({ outlet_id: o.id, machine: o.noisyWasher, kind: "noisy_washer", expected: "not flagged" });
    if (o.heat === "electric") plants.push({ outlet_id: o.id, kind: "humid_week", week: humidWeek, expected: "not a fault: peers move together" });
    plants.push({ outlet_id: o.id, kind: "roof", roof_kwp_max: o.roofKwp, expected: o.roofKwp ? "solar options up to roof limit" : "solar not possible" });
  }

  mkdirSync(out, { recursive: true });
  const write = (name: string, data: Record<string, unknown>[]) => writeFileSync(join(out, name), csv(data));
  write("outlets.csv", rows.outlets);
  write("machines.csv", rows.machines);
  write("machine_cycles.csv", rows.cycles);
  write("meter_readings.csv", rows.meter);
  write("service_log.csv", rows.service);
  write("solar_params.csv", rows.solar);
  // ponytail: rates are the brief's all-in rates; confirm against TNB's non-domestic schedule (open question 5/10).
  write("tariffs.csv", [
    { tariff_code: "LV-COM", period: "flat", rate_rm_per_kwh: 0.5068, peak_days: "Mon-Fri", peak_start: "14:00", peak_end: "22:00", effective_from: "2025-07-01" },
    { tariff_code: "LV-COM", period: "peak", rate_rm_per_kwh: 0.5217, peak_days: "Mon-Fri", peak_start: "14:00", peak_end: "22:00", effective_from: "2025-07-01" },
    { tariff_code: "LV-COM", period: "offpeak", rate_rm_per_kwh: 0.4808, peak_days: "Mon-Fri", peak_start: "14:00", peak_end: "22:00", effective_from: "2025-07-01" },
  ]);
  // ponytail: placeholder factors, flagged in the method note; confirm with the Energy Commission before quoting.
  write("emission_factors.csv", [
    { factor_id: "grid_peninsular", unit: "kgCO2e_per_kWh", value: 0.758, source: "TO CONFIRM: Energy Commission grid emission factor" },
    { factor_id: "lpg", unit: "kgCO2e_per_kg", value: 2.983, source: "TO CONFIRM: IPCC LPG default" },
  ]);
  write("holidays.csv", holidays);
  write("weather.csv", weather);
  writeFileSync(join(out, "manifest.json"), JSON.stringify({ seed, window: { start: START, days: DAYS }, plants }, null, 2) + "\n");
  return { cycles: rows.cycles.length, meter: rows.meter.length };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { values } = parseArgs({ options: { seed: { type: "string", default: "1" }, out: { type: "string", default: "data/sample" } } });
  const res = await generate(Number(values.seed), values.out!);
  console.log(`seed ${values.seed} -> ${values.out}: ${res.meter} meter rows, ${res.cycles} cycles`);
}
