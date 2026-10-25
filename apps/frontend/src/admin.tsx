// HQ: the super admin's web console, laid out like the team's admin design (sidebar, scope picker, alert strip, panels),
// with every figure from the API. Pages: overview, machine energy, tariff and peak, agent interventions, data and AI
// pipeline, audit log. People (people.tsx) sits in the same shell.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { api, linkProps, match, navigate, setPref, usePath, usePrefs, useApi, type Lang } from "./api.ts";
import { DatePicker, Dropdown, Failed, Icon, Loading, ModeBadge, Sparkline, StatusBadge, day, rm, short, useToast, type LogEvent, type Week } from "./ui.tsx";
import { Evidence } from "./owner.tsx";

type Outlet = { outlet_id: string; name: string; kpis: Record<string, number>; weekly: { week: number; peak_kwh: number; offpeak_kwh: number }[];
  tariff: { peak_share: number; breakeven: number; verdict: string; tou_saving_rm_per_month: number };
  split: { washers_kwh: number; dryers_kwh: number; base_kwh: number; total_kwh: number } | null };
type Advice = { action_id: string; outlet_id: string; type: string; target: string; advised_as_of: string; risk: string; reason?: string; run_id: string;
  predicted_rm_per_month: number | null; status: string; verified: { verdict: string; realised_rm_per_month: number } | null };
type Overview = { as_of: string; outlets: Outlet[]; verified_savings_rm_per_month: number;
  flagged_machines: { outlet_id: string; machine_id: string; verdict?: string; evidence?: string; rm_per_month?: number; status: string; run_id: string }[];
  advice_scoreboard: Advice[];
  run_log: { run_id: string; created_at: string; outlet_id: string; as_of: string; kind: string; question?: string; intents: string[]; verdicts: string[]; mode: string }[] };

const sum = (o: Outlet[], k: string) => o.reduce((s, x) => s + x.kpis[k], 0);
const ACTION: Record<string, string> = { schedule_service: "Service", run_promo: "Happy hour", request_solar_quote: "Solar quote" };
const actionLabel = (a: Advice) => a.type === "switch_tariff" ? "Switch to ToU" : `${ACTION[a.type] ?? a.type.replace(/_/g, " ")} ${a.type === "schedule_service" ? short(a.target) : a.target.replace(/^OUT-\d+ ?/, "")}`;
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const when = (ts: string) => new Date(ts).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

// Stacked weekly bars, peak on top (design-system §8): direct labels, 2 px gap between segments, text summary above.
function EnergyChart({ outlets }: { outlets: Outlet[] }) {
  const [table, setTable] = useState(false);
  const max = Math.max(...outlets.flatMap((o) => o.weekly.map((w) => w.peak_kwh + w.offpeak_kwh)));
  const top = [...outlets].sort((a, b) => b.tariff.peak_share - a.tariff.peak_share)[0];
  const bw = 14, gap = 4, group = outlets[0].weekly.length * (bw + gap) + 28, h = 180;
  return (
    <section className="card">
      <div className="row between wrap"><h3>Peak vs off-peak kWh by outlet, by week</h3><button className="textlink" onClick={() => setTable(!table)}>{table ? "View as chart" : "View as table"}</button></div>
      <p className="sm">{top.outlet_id} {top.name} uses the most peak energy ({(top.tariff.peak_share * 100).toFixed(0)}%).</p>
      {table ? (
        <div className="table-wrap"><table><thead><tr><th>Outlet</th><th className="n">Week</th><th className="n">Peak kWh</th><th className="n">Off-peak kWh</th></tr></thead>
          <tbody>{outlets.flatMap((o) => o.weekly.map((w) => <tr key={o.outlet_id + w.week}><td>{o.outlet_id}</td><td className="n">{w.week}</td><td className="n">{w.peak_kwh.toFixed(0)}</td><td className="n">{w.offpeak_kwh.toFixed(0)}</td></tr>))}</tbody></table></div>
      ) : (
        <svg className="chart" viewBox={`0 0 ${outlets.length * group + 10} ${h + 40}`} role="img" aria-label="Stacked bar chart of weekly peak and off-peak kWh per outlet" style={{ width: "100%", maxHeight: 280 }}>
          <line x1="0" x2={outlets.length * group} y1={h} y2={h} stroke="var(--chart-grid)" />
          {outlets.map((o, oi) => (
            <g key={o.outlet_id} transform={`translate(${oi * group + 10},0)`}>
              {o.weekly.map((w, i) => {
                const off = (w.offpeak_kwh / max) * (h - 20), peak = (w.peak_kwh / max) * (h - 20), x = i * (bw + gap);
                return <g key={w.week}><title>{`${o.outlet_id} week ${w.week}: peak ${w.peak_kwh.toFixed(0)} kWh, off-peak ${w.offpeak_kwh.toFixed(0)} kWh`}</title>
                  <rect x={x} y={h - off} width={bw} height={off} fill="var(--chart-offpeak)" rx="2" />
                  <rect x={x} y={h - off - 2 - peak} width={bw} height={peak} fill="var(--chart-peak)" rx="2" /></g>;
              })}
              <text x="0" y={h + 18}>{o.outlet_id}</text><text x="0" y={h + 34}>{o.name}</text>
            </g>
          ))}
        </svg>
      )}
      <div className="row wrap sm"><span className="row"><svg width="12" height="12" aria-hidden><rect width="12" height="12" rx="2" fill="var(--chart-peak)" /></svg>Peak (top)</span>
        <span className="row"><svg width="12" height="12" aria-hidden><rect width="12" height="12" rx="2" fill="var(--chart-offpeak)" /></svg>Off-peak</span></div>
    </section>
  );
}

// W-07: where each outlet's energy goes, from the agent's regression (base = what machines don't explain).
const PARTS = [["washers_kwh", "Washers", "var(--primary-soft)"], ["dryers_kwh", "Dryers", "var(--tertiary)"], ["base_kwh", "Base load", "var(--chart-baseline)"]] as const;
function SplitChart({ outlets }: { outlets: Outlet[] }) {
  const rows = outlets.filter((o) => o.split);
  const share = (o: Outlet, k: (typeof PARTS)[number][0]) => (o.split![k] / o.split!.total_kwh) * 100;
  const top = [...rows].sort((a, b) => share(b, "dryers_kwh") - share(a, "dryers_kwh"))[0];
  return (
    <section className="card"><h3>Washers vs dryers</h3>
      {top && <p className="sm">Dryers use the largest share at {top.outlet_id} ({share(top, "dryers_kwh").toFixed(0)}% of the month's kWh).</p>}
      {rows.map((o) => (
        <div key={o.outlet_id} className="stack tight">
          <span className="sm">{o.outlet_id} {o.name}</span>
          <div className="row" style={{ gap: 2, height: 16 }} aria-hidden>
            {PARTS.map(([k, , c]) => <span key={k} style={{ width: `${share(o, k)}%`, height: "100%", background: c, borderRadius: 3 }} />)}
          </div>
          <span className="sm muted num">{PARTS.map(([k, l]) => `${l} ${share(o, k).toFixed(0)}%`).join(" · ")}</span>
        </div>
      ))}
      <div className="sr-only"><table><caption>kWh by machine type, month to date</caption><thead><tr><th>Outlet</th>{PARTS.map(([, l]) => <th key={l}>{l} kWh</th>)}</tr></thead>
        <tbody>{rows.map((o) => <tr key={o.outlet_id}><td>{o.outlet_id}</td>{PARTS.map(([k]) => <td key={k}>{o.split![k].toFixed(0)}</td>)}</tr>)}</tbody></table></div>
      <div className="row wrap sm">{PARTS.map(([, l, c]) => <span key={l} className="row"><svg width="12" height="12" aria-hidden><rect width="12" height="12" rx="2" fill={c} /></svg>{l}</span>)}</div>
      <p className="sm muted">From the same regression the agent uses to check machines.</p>
    </section>
  );
}

function RunLog({ runs, limit = 6 }: { runs: Overview["run_log"]; limit?: number }) {
  const [all, setAll] = useState(false);
  return (
    <section className="card"><div className="row between"><h3>Run log <span className="sm muted num count-inline">{runs.length}</span></h3>
      {runs.length > limit && <button className="textlink" onClick={() => setAll(!all)}>{all ? "Show fewer" : "View all"}</button>}</div>
      {runs.length ? <div className="list flush">{(all ? runs : runs.slice(0, limit)).map((x) => (
        <a key={x.run_id} className="mrow" {...linkProps(`/franchise/run/${x.run_id}`)}>
          <span className="sm grow">{day(x.as_of)} · {x.outlet_id} · {x.kind}<br /><span className="muted">{x.verdicts[0] ?? x.question}</span></span><ModeBadge mode={x.mode} /></a>
      ))}</div> : <p className="sm muted">No runs yet.</p>}
    </section>
  );
}

const Panel = ({ title, sub, icon, right, children }: { title: string; sub?: string; icon?: string; right?: ReactNode; children: ReactNode }) => (
  <section className="card panel">
    <div className="panel-head">{icon && <span className="app-tile"><Icon name={icon} /></span>}<div className="grow"><h2 className="h3">{title}</h2>{sub && <p className="mono-label">{sub}</p>}</div>{right}</div>
    {children}
  </section>
);

function Kpis({ items }: { items: [string, string, string?, string?][] }) {
  return <dl className="kpis">{items.map(([l, v, c, note]) => <div key={l}><dt className="mono-label">{l}</dt><dd className={`kpi num ${c ?? ""}`}>{v}</dd>{note && <span className="sm muted">{note}</span>}</div>)}</dl>;
}

// Daily load: one day of half-hourly meter readings with the TNB peak window shaded and a typical-day line
// (the same half-hour on the same kind of day, 4-week average). Only measured data; a text summary and a table view too.
type Day = { date: string | null; dates: string[]; working_day: boolean; typical_days: number; rates: { flat: number; peak: number; offpeak: number };
  slots: { t: string; kwh: number; peak: boolean; typical: number | null }[];
  summary: { kwh: number; peak_kwh: number; peak_share: number; cost_flat_rm: number; cost_tou_rm: number; busiest: { t: string; kw: number } } | null };
const weekday = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
function DailyLoad({ outlets, breakeven }: { outlets: Outlet[]; breakeven: number }) {
  const { asOf } = usePrefs();
  const [outlet, setOutlet] = useState(outlets[0].outlet_id), [date, setDate] = useState<string | null>(null), [table, setTable] = useState(false);
  useEffect(() => setDate(null), [asOf, outlet]);
  const r = useApi<Day>(`/outlets/${outlet}/day?as_of=${asOf}${date ? `&date=${date}` : ""}`);
  const d = r.data, name = outlets.find((o) => o.outlet_id === outlet)?.name ?? "";
  const step = (n: number) => { if (!d?.date) return; const i = d.dates.indexOf(d.date) + n; if (i >= 0 && i < d.dates.length) setDate(d.dates[i]); };
  const W = 720, H = 220, L = 34, B = 26, n = d?.slots.length || 48;
  const kw = (kwh: number) => kwh * 2; // a half-hour's kWh × 2 = average kW in that half-hour
  const top = d ? Math.max(4, ...d.slots.map((s) => kw(Math.max(s.kwh, s.typical ?? 0)))) : 4;
  const tick = [1, 2, 5, 10, 20, 50].find((t) => top / t <= 4) ?? 100; // about four round gridlines
  const ticks = Array.from({ length: Math.ceil(top / tick) }, (_, i) => (i + 1) * tick), max = ticks.at(-1)! * 1.12;
  const x = (i: number) => L + (i / n) * (W - L), y = (v: number) => H - B - (v / max) * (H - B - 10);
  const peakIdx = d ? d.slots.map((s, i) => (s.peak ? i : -1)).filter((i) => i >= 0) : [];
  const line = (vals: (number | null)[]) => vals.map((v, i) => (v == null ? "" : `${i && vals[i - 1] != null ? "L" : "M"}${(x(i) + x(i + 1)) / 2},${y(v)}`)).join("");
  const actual = d ? line(d.slots.map((s) => kw(s.kwh))) : "";
  const area = d ? `${actual}L${(x(n - 1) + x(n)) / 2},${y(0)}L${(x(0) + x(1)) / 2},${y(0)}Z` : "";
  const busiestI = d?.summary ? d.slots.findIndex((s) => s.t === d.summary!.busiest.t) : -1;
  const s = d?.summary;
  return (
    <Panel title="Daily load" sub="Half-hourly meter readings · TNB peak window shaded · no sub-meters" icon="monitoring"
      right={<button className="textlink" onClick={() => setTable(!table)}>{table ? "View as chart" : "View as table"}</button>}>
      <div className="row between wrap">
        <Dropdown label="Outlet" value={outlet} options={outlets.map((o) => ({ value: o.outlet_id, label: `${o.outlet_id} ${o.name}` }))} onChange={setOutlet} />
        {d?.date && <div className="row">
          <button className="btn secondary sm-btn" onClick={() => step(-1)} disabled={d.dates.indexOf(d.date) <= 0} aria-label="Previous day"><Icon name="chevron_left" /></button>
          <span className="mono-label num nowrap" aria-live="polite">{weekday(d.date)}</span>
          <button className="btn secondary sm-btn" onClick={() => step(1)} disabled={d.dates.indexOf(d.date) >= d.dates.length - 1} aria-label="Next day"><Icon name="chevron_right" /></button>
        </div>}
      </div>
      {!d ? (r.error ? <Failed error={r.error} /> : <Loading />) : !s ? <p className="sm muted">No meter readings up to this date.</p> : <>
        <p className="sm">{d.working_day
          ? <>On {weekday(d.date!)}, <b className="num">{pct(s.peak_share)}</b> of {outlet} {name}'s energy fell in the 14:00–22:00 peak window, busiest at {s.busiest.t} ({s.busiest.kw.toFixed(1)} kW). The ToU break-even is {pct(breakeven)} over a month; weekends and holidays are off-peak all day, which pulls the monthly share down.</>
          : <>{weekday(d.date!)} is a weekend or public holiday: off-peak all day under ToU, so there is no peak window to shade.</>}</p>
        {table ? (
          <div className="table-wrap" style={{ maxHeight: 320, overflow: "auto" }}><table><thead><tr><th>Time</th><th>Period</th><th className="n">kWh</th><th className="n">Typical kWh</th></tr></thead>
            <tbody>{d.slots.map((x) => <tr key={x.t}><td className="num">{x.t}</td><td>{x.peak ? "Peak" : "Off-peak"}</td><td className="n">{x.kwh.toFixed(2)}</td><td className="n">{x.typical?.toFixed(2) ?? "—"}</td></tr>)}</tbody></table></div>
        ) : (
          <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" style={{ width: "100%", maxHeight: 300 }}
            aria-label={`Half-hourly load for ${outlet} on ${weekday(d.date!)}: ${s.kwh.toFixed(0)} kWh, ${pct(s.peak_share)} in the peak window`}>
            <defs><linearGradient id="dl-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="var(--chart-offpeak)" stopOpacity="0.45" /><stop offset="1" stopColor="var(--chart-offpeak)" stopOpacity="0.02" /></linearGradient></defs>
            {peakIdx.length > 0 && <g>
              <rect x={x(peakIdx[0])} y={6} width={x(peakIdx.at(-1)! + 1) - x(peakIdx[0])} height={H - B - 6} fill="var(--chart-peak)" opacity="0.12" rx="6" />
              <text x={x(peakIdx[0]) + 8} y={H - B - 8} style={{ fill: "var(--chart-peak)" }}>Peak 14:00–22:00 · RM{d.rates.peak.toFixed(4)}/kWh</text></g>}
            {ticks.map((v) => <g key={v}><line x1={L} x2={W} y1={y(v)} y2={y(v)} stroke="var(--chart-grid)" />
              <text x={L - 6} y={y(v) + 4} textAnchor="end">{v}</text></g>)}
            <text x={2} y={14}>kW</text>
            <path d={area} fill="url(#dl-fill)" />
            <path d={actual} fill="none" stroke="var(--primary-text)" strokeWidth="2.5" strokeLinejoin="round" />
            <path d={line(d.slots.map((s) => (s.typical == null ? null : kw(s.typical))))} fill="none" stroke="var(--chart-baseline)" strokeWidth="1.5" strokeDasharray="5 4" />
            {busiestI >= 0 && <g><circle cx={(x(busiestI) + x(busiestI + 1)) / 2} cy={y(kw(d.slots[busiestI].kwh))} r="4.5" fill="var(--chart-peak)" stroke="var(--bg, #0F061E)" strokeWidth="2" />
              <text x={(x(busiestI) + x(busiestI + 1)) / 2} y={y(kw(d.slots[busiestI].kwh)) - 10} textAnchor="middle" style={{ fill: "var(--text)" }}>{s.busiest.kw.toFixed(1)} kW</text></g>}
            {[0, 12, 24, 36, n - 1].map((i, k, all) => <text key={i} x={k === 0 ? x(0) : k === all.length - 1 ? W : (x(i) + x(i + 1)) / 2} y={H - 6}
              textAnchor={k === 0 ? "start" : k === all.length - 1 ? "end" : "middle"}>{d.slots[i]?.t}</text>)}
          </svg>
        )}
        <div className="row wrap sm">
          <span className="row"><svg width="18" height="10" aria-hidden><line x1="0" x2="18" y1="5" y2="5" stroke="var(--primary-text)" strokeWidth="2.5" /></svg>This day</span>
          <span className="row"><svg width="18" height="10" aria-hidden><line x1="0" x2="18" y1="5" y2="5" stroke="var(--chart-baseline)" strokeWidth="1.5" strokeDasharray="5 4" /></svg>Typical {d.working_day ? "working day" : "weekend day"} ({d.typical_days}-day average)</span>
          {peakIdx.length > 0 && <span className="row"><svg width="12" height="12" aria-hidden><rect width="12" height="12" rx="2" fill="var(--chart-peak)" opacity="0.35" /></svg>ToU peak window</span>}
        </div>
        <dl className="kpis compact">
          <div><dt className="mono-label">Day total</dt><dd className="num">{s.kwh.toFixed(0)} kWh</dd></div>
          <div><dt className="mono-label">In peak window</dt><dd className="num">{s.peak_kwh.toFixed(0)} kWh · {pct(s.peak_share)}</dd></div>
          <div><dt className="mono-label">Cost on flat</dt><dd className="num">{rm(s.cost_flat_rm, 2)}</dd></div>
          <div><dt className="mono-label">Same day on ToU</dt><dd className={`num ${s.cost_tou_rm < s.cost_flat_rm ? "save" : ""}`}>{rm(s.cost_tou_rm, 2)}</dd></div>
        </dl>
      </>}
    </Panel>
  );
}

// Agent trace: one real run, stage by stage, read from its log. The loop is the point: the Skeptic re-derives each
// claim from the data and can send work back; nothing runs until a person approves. Stages show what each agent did,
// whether a model or plain code did it, and the send-backs in full.
type TraceRun = { result: { run_id: string; outlet_id: string; as_of: string; question?: string; mode: string; actions: { id: string; type: string; target: string; reason: string; risk: string; status?: string }[] }; events: LogEvent[] };
// "nvidia/nemotron-3.5-lightning-30b-a3b (replayed)" → "Nemotron 3.5 Lightning · replayed"
const modelName = (m?: string) => m ? m.replace(/^nvidia\//, "").replace(/ \(replayed\)$/, "").split("-").filter((w) => !/^\d+b$|^a\d+b$/.test(w))
  .map((w) => w[0].toUpperCase() + w.slice(1)).join(" ") + (m.endsWith("(replayed)") ? " · replayed" : "") : null;
const count = (summary: string | undefined, one: string, many: string) => {
  const m = summary?.match(/^(\d+) \w+: (.*)$/); if (!m) return null;
  return { n: Number(m[1]), word: Number(m[1]) === 1 ? one : many, rest: m[2] };
};
function AgentTrace({ runs }: { runs: Overview["run_log"] }) {
  const usable = runs.filter((x) => x.verdicts.length && !x.intents.includes("out_of_scope"));
  const preferred = usable.find((x) => x.intents.includes("energy_plan")) ?? usable.find((x) => x.intents.includes("bill_investigation")) ?? usable[0];
  const [pick, setPick] = useState<string | null>(null);
  const id = pick && usable.some((x) => x.run_id === pick) ? pick : preferred?.run_id;
  const r = useApi<TraceRun>(id ? `/runs/${id}` : null);
  if (!preferred) return null;
  const ev = r.data?.events ?? [];
  const by = (agent: string) => ev.filter((e) => e.agent_name === agent);
  const first = (agent: string, action: string) => ev.find((e) => e.agent_name === agent && e.action === action);
  const scout = first("Scout", "classify"), ground = first("Scout", "ground_intents"), plan = first("Planner", "plan");
  const recalls = ev.filter((e) => e.action === "hmem.recall" && !/^no /.test(e.output_summary));
  const inv = by("Investigator"), sk = by("Skeptic"), report = first("Reporter", "report"), word = first("Reporter", "word");
  const queries = ev.filter((e) => e.action.endsWith(".query")), source = queries.some((e) => e.action === "zetaris.query") ? "Zetaris" : "SQLite";
  const calcs = [...new Set(inv.filter((e) => e.action.startsWith("calc.")).map((e) => e.action.slice(5)))];
  const sentBack = sk.filter((e) => e.status === "needs_revision"), approved = sk.filter((e) => e.action === "approve").length;
  const judge = sk.find((e) => e.model), waiting = (r.data?.result.actions ?? []).filter((a) => a.status !== "approved");
  const intents = scout?.output_summary.match(/intents=\[([^\]]*)\]/)?.[1].split(",").map((x) => x.replace(/_/g, " ")) ?? [];
  const stages: { n: number; agent: string; icon: string; did: ReactNode; who: string | null; warn?: boolean }[] = [
    { n: 1, agent: "Scout", icon: "travel_explore", who: modelName(scout?.model),
      did: <>Read the question as <b>{intents.join(" + ") || "—"}</b>.{ground?.output_summary.includes("dropped") && <> Dropped what the owner didn't ask: {ground.output_summary.split("dropped ")[1]?.split(":")[0]}.</>}</> },
    { n: 2, agent: "Planner", icon: "account_tree", who: modelName(plan?.model),
      did: (() => { const c = count(plan?.output_summary, "hypothesis", "hypotheses"); const kinds = c?.rest.split(", ").map((k) => k.split(" (")[0]).join(", ");
        return <>Chose {c ? <><b>{c.n} {c.word}</b> to test ({kinds})</> : "what to test"}{recalls.length ? <>, using {recalls.length} memor{recalls.length === 1 ? "y" : "ies"} from earlier sessions</> : null}.</>; })() },
    { n: 3, agent: "Investigator", icon: "query_stats", who: "code · no model",
      did: <>Ran {queries.filter((e) => e.agent_name === "Investigator").length} queries on {source} and {calcs.length} calculator{calcs.length === 1 ? "" : "s"} ({calcs.join(", ").replace(/_/g, " ")}). Every RM figure comes from here.</> },
    { n: 4, agent: "Skeptic", icon: "fact_check", who: judge ? `${modelName(judge.model)} + re-checks in code` : "re-checks in code", warn: sentBack.length > 0,
      did: <>Re-derived each claim from the data: {approved} approved{sentBack.length ? <>, <b className="peak">{sentBack.length} sent back</b></> : null}.</> },
    { n: 5, agent: "Reporter", icon: "edit_note", who: modelName(word?.model) ?? "templates",
      did: (() => { const c = count(report?.output_summary?.split(";")[0], "decision card", "decision cards");
        return <>Wrote {c ? <b>{c.n} {c.word}</b> : "the answer"} from approved claims only.{word ? " Reworded in plain language; a rewrite that changes a number is rejected." : ""}</>; })() },
  ];
  return (
    <Panel title="How the agents reached it" sub="One real run, step by step · read from its log" icon="hub"
      right={id && <a className="btn secondary sm-btn" {...linkProps(`/franchise/run/${id}`)}>Full evidence</a>}>
      <Dropdown label="Run" value={id!} onChange={setPick}
        options={usable.map((x) => ({ value: x.run_id, label: `${day(x.as_of)} · ${x.outlet_id} · ${x.verdicts.at(-1) ?? x.question ?? x.kind}` }))} />
      {r.error ? <Failed error={r.error} /> : !r.data ? <Loading /> : <>
        {r.data.result.question && <p className="sm">Owner asked: <q>{r.data.result.question}</q></p>}
        <ol className="trace" aria-label="Agent stages">
          {stages.map((st) => (
            <li key={st.agent} className={`trace-step ${st.warn ? "sent" : ""}`}>
              <span className="mono-label">0{st.n} · {st.agent}</span>
              <Icon name={st.icon} className={st.warn ? "peak" : "info"} />
              <p className="sm">{st.did}</p>
              <span className="pill">{st.who ?? "code"}</span>
            </li>
          ))}
          <li className="trace-step end">
            <span className="mono-label">Then · you</span>
            <Icon name="front_hand" className="peak" />
            <p className="sm">{waiting.length ? <><b>{waiting.length} action{waiting.length === 1 ? "" : "s"} waiting for approval.</b> Nothing has run.</> : "No action needed from this run."}</p>
            <span className="pill">{waiting.length ? "awaiting approval" : "read-only"}</span>
          </li>
        </ol>
        {sentBack.map((e, i) => (
          <div key={i} className="sentback" role="note">
            <Icon name="undo" className="peak" />
            <div className="grow"><span className="mono-label">Skeptic → {e.target_agent ?? "Investigator"} · sent back</span>
              <p className="sm">{e.output_summary.split(" · Nemotron:")[0]}</p>
              {e.output_summary.includes(" · Nemotron:") && <p className="sm muted">Nemotron agreed: {e.output_summary.split(" · Nemotron:")[1].replace(/^ ?(rule_out|approve), ?/, "")}</p>}</div>
          </div>
        ))}
      </>}
    </Panel>
  );
}

// --- Pages ---

function OverviewPage({ o, all }: { o: Overview; all: Overview }) {
  const cost = sum(o.outlets, "cost_rm_month_to_date"), rev = sum(o.outlets, "revenue_rm_month_to_date");
  const plans = new Map(o.run_log.filter((x) => x.intents?.includes("energy_plan")).map((x) => [x.outlet_id, x.verdicts[0]]));
  const pending = o.advice_scoreboard.filter((a) => a.status === "awaiting_approval");
  const open = o.flagged_machines.filter((f) => !f.status.startsWith("verified"));
  return (
    <div className="stack">
      <Kpis items={[
        ["Load, month to date", `${(sum(o.outlets, "kwh_month_to_date") / 1000).toFixed(1)} MWh`, undefined, `${o.outlets.length} outlet${o.outlets.length === 1 ? "" : "s"}`],
        ["Energy cost", rm(cost), undefined, `projected ${rm(sum(o.outlets, "projected_bill_rm"))} for the month`],
        ["Revenue", rm(rev), undefined, `${sum(o.outlets, "cycles_month_to_date").toLocaleString()} cycles`],
        ["Margin after energy", `${rev ? Math.round(((rev - cost) / rev) * 100) : 0}%`],
        ["Verified savings", `${rm(o.verified_savings_rm_per_month, 2)}/mo`, o.verified_savings_rm_per_month > 0 ? "save" : "muted", "measured after a fix, not predicted"],
      ]} />
      <div className="grid">
        <div className="span-8 col">
          <DailyLoad outlets={o.outlets} breakeven={o.outlets[0]?.tariff.breakeven ?? 0.636} />
          <EnergyChart outlets={o.outlets} />
          <Panel title="Outlets" sub="Tariff verdict and energy plan per outlet">
            <div className="table-wrap"><table><thead><tr><th>Outlet</th><th className="n">kWh (month)</th><th className="n">Peak share</th><th>Tariff verdict</th><th>Energy plan</th><th className="n">Open flags</th></tr></thead>
              <tbody>{o.outlets.map((x) => (
                <tr key={x.outlet_id}><td><span className="nowrap mono-id">{x.outlet_id}</span> {x.name}</td><td className="n">{Math.round(x.kpis.kwh_month_to_date).toLocaleString()}</td><td className="n">{pct(x.tariff.peak_share)}</td>
                  <td>{x.tariff.verdict === "stay" ? "Stay on flat" : `Switch to ToU (${rm(x.tariff.tou_saving_rm_per_month, 2)}/mo)`}</td><td className="sm">{plans.get(x.outlet_id) ?? <span className="muted">Not asked yet</span>}</td>
                  <td className="n">{open.filter((f) => f.outlet_id === x.outlet_id).length}</td></tr>
              ))}</tbody></table></div>
          </Panel>
        </div>
        <div className="span-4 col">
          <Panel title="Needs you" sub={`${pending.length} awaiting approval · ${open.length} open flag${open.length === 1 ? "" : "s"}`}
            right={<a className="btn secondary sm-btn" {...linkProps("/franchise/agent")}>Open</a>}>
            {pending.length || open.length ? <div className="list flush">
              {pending.map((a) => <a key={a.action_id} className="mrow" {...linkProps("/franchise/agent")}><Icon name="task_alt" className="warm" /><span className="grow sm">{a.outlet_id} · {actionLabel(a)}{a.predicted_rm_per_month != null && <><br /><span className="muted num">predicted {rm(a.predicted_rm_per_month, 2)}/mo</span></>}</span></a>)}
              {open.filter((f) => !pending.some((a) => a.target === f.machine_id)).map((f) => <a key={f.machine_id} className="mrow" {...linkProps(`/franchise/run/${f.run_id}`)}><Icon name="build" className="peak" /><span className="grow sm">{f.outlet_id} · {f.verdict ?? short(f.machine_id)}<br /><span className="muted">{f.evidence}</span></span></a>)}
            </div> : <p className="sm muted">Nothing waiting. The agent proposes, you approve, the next session checks it worked.</p>}
          </Panel>
          <RunLog runs={all.run_log.filter((r) => o.outlets.some((x) => x.outlet_id === r.outlet_id))} />
        </div>
      </div>
    </div>
  );
}

type Machine = { machine_id: string; name: string; type: string; heat_source: string; price_from_rm: number | null; price_to_rm: number | null; status: string;
  normal: { kwh_per_cycle: number | null; kwh_se: number | null; minutes_per_cycle: number | null; learned_as_of: string } | null; cost_per_cycle_rm: number | null;
  health: string; flag: { verdict?: string; run_id: string } | null; customer_reports: unknown[]; weekly: Week[] };
type OwnerView = { rates: { flat: number; peak: number; offpeak: number }; machines: Machine[] };

function MachinesPage({ o, outlet }: { o: Overview; outlet: string }) {
  const { asOf } = usePrefs();
  const r = useApi<OwnerView>(`/outlets/${outlet}/owner?as_of=${asOf}`);
  const name = o.outlets.find((x) => x.outlet_id === outlet)?.name ?? "";
  const latest = (m: Machine) => { const w = m.weekly.filter((x) => x.value != null).at(-1); return w ? `${w.value!.toFixed(w.unit === "min" ? 0 : 2)} ${w.unit}` : "—"; };
  const normalOf = (m: Machine) => (m.heat_source === "gas" ? m.normal?.minutes_per_cycle : m.normal?.kwh_per_cycle) ?? null;
  return (
    <div className="stack">
      <Panel title="Virtual sub-metering" sub="One TNB meter · no sub-meters · per-machine energy from the cycle log" icon="device_hub">
        <p>Each outlet has one meter. SmartFlux regresses the 30-minute meter readings on the cycle log the payment system already keeps, which gives every electric machine its own kWh per cycle. Gas dryers burn LPG, so they are tracked by minutes per cycle instead. The Skeptic re-runs the same regression before any fault reaches you.</p>
      </Panel>
      <div className="grid">
        <div className="span-8 col">
          <Panel title={`Machines · ${outlet} ${name}`} sub="Normal level learned per machine · last weeks against it">
            {r.error ? <Failed error={r.error} /> : !r.data ? <Loading /> : (
              <div className="table-wrap"><table><thead><tr><th>Machine</th><th>Type</th><th className="n">Latest week</th><th className="n">Normal per cycle</th><th>Weekly</th><th className="n">Cost / price</th><th>Health</th></tr></thead>
                <tbody>{r.data.machines.map((m) => (
                  <tr key={m.machine_id}><td><b>{m.name}</b></td><td className="sm">{m.type === "dryer" ? `Dryer · ${m.heat_source === "gas" ? "gas" : "electric"}` : "Washer"}</td>
                    <td className="n">{latest(m)}</td>
                    <td className="n">{m.normal ? (m.heat_source === "gas" ? `${m.normal.minutes_per_cycle?.toFixed(0)} min` : `${m.normal.kwh_per_cycle?.toFixed(2)} ± ${m.normal.kwh_se?.toFixed(2)} kWh`) : <span className="muted" title="Learned by the first session (13 Sep)">not learned yet</span>}</td>
                    <td><Sparkline weeks={m.weekly} normal={normalOf(m)} /></td>
                    <td className="n">{m.cost_per_cycle_rm != null ? `${rm(m.cost_per_cycle_rm, 2)} / ${rm(m.price_from_rm, 2)}` : "—"}</td>
                    <td>{m.flag ? <a {...linkProps(`/franchise/run/${m.flag.run_id}`)}><StatusBadge s={m.health} /></a> : <StatusBadge s={m.health} />}</td></tr>
                ))}</tbody></table></div>
            )}
            <p className="sm muted">Pick another outlet in the scope menu at the top.</p>
          </Panel>
        </div>
        <div className="span-4 col"><SplitChart outlets={o.outlets} /></div>
      </div>
    </div>
  );
}

function TariffPage({ o, outlet }: { o: Overview; outlet: string }) {
  const { asOf } = usePrefs();
  const r = useApi<OwnerView>(`/outlets/${outlet}/owner?as_of=${asOf}`);
  return (
    <div className="stack">
      <div className="grid">
        <div className="span-8 col"><EnergyChart outlets={o.outlets} /></div>
        <div className="span-4 col">
          <Panel title="Tariff rules" sub={`${outlet} · TNB rates in RM per kWh`} icon="receipt_long">
            {r.data ? <dl className="rates">{([["Flat (current)", r.data.rates.flat], ["ToU peak", r.data.rates.peak], ["ToU off-peak", r.data.rates.offpeak]] as const).map(([l, v]) =>
              <div key={l}><dt className="sm muted">{l}</dt><dd className="num">RM{v.toFixed(4)}</dd></div>)}</dl> : r.error ? <Failed error={r.error} /> : <Loading />}
            <p className="sm muted">Peak is weekdays 14:00–22:00; weekends and public holidays are off-peak all day. The rule lives once, in the Zetaris semantic layer.</p>
          </Panel>
        </div>
      </div>
      <Panel title="ToU break-even by outlet" sub="Switch when the peak share is below the break-even">
        <div className="table-wrap"><table><thead><tr><th>Outlet</th><th className="n">Peak share</th><th className="n">Break-even</th><th>Verdict</th><th className="n">ToU saving</th></tr></thead>
          <tbody>{o.outlets.map((x) => (
            <tr key={x.outlet_id}><td><span className="mono-id">{x.outlet_id}</span> {x.name}</td><td className="n">{pct(x.tariff.peak_share)}</td><td className="n">{pct(x.tariff.breakeven)}</td>
              <td>{x.tariff.verdict === "stay" ? <span className="pill">Stay on flat</span> : <span className="pill ok">Switch to ToU</span>}</td>
              <td className={`n ${x.tariff.tou_saving_rm_per_month > 0 ? "save" : "muted"}`}>{rm(x.tariff.tou_saving_rm_per_month, 2)}/mo</td></tr>
          ))}</tbody></table></div>
      </Panel>
    </div>
  );
}

function AgentPage({ o, reload }: { o: Overview; reload: () => void }) {
  const toast = useToast(), [busy, setBusy] = useState("");
  const pending = o.advice_scoreboard.filter((a) => a.status === "awaiting_approval");
  const decide = async (a: Advice, decision: "approved" | "rejected") => {
    setBusy(a.action_id);
    try { await api("/approve", { action_id: a.action_id, decision }); toast.show(`${actionLabel(a)} ${decision}`); reload(); }
    catch (e) { toast.show((e as Error).message); }
    setBusy("");
  };
  return (
    <div className="stack">
      <AgentTrace runs={o.run_log} />
      <Panel title="Awaiting your approval" sub="Nothing reaches a machine, a customer or TNB until you approve it" icon="task_alt">
        {pending.length ? <div className="approvals">{pending.map((a) => (
          <article key={a.action_id} className="approval">
            <div className="row between wrap"><b>{a.outlet_id} · {actionLabel(a)}</b><span className="pill info">{a.risk.replace("_", " ")}</span></div>
            {a.reason && <p className="sm">{a.reason}</p>}
            <p className="sm muted">Advised {day(a.advised_as_of)}{a.predicted_rm_per_month != null && <> · predicted <span className="save num">{rm(a.predicted_rm_per_month, 2)}/mo</span></>} · <a {...linkProps(`/franchise/run/${a.run_id}`)}>evidence</a></p>
            <div className="row"><button className="btn cta sm-btn" disabled={!!busy} onClick={() => decide(a, "approved")}>Approve</button>
              <button className="btn outlined sm-btn" disabled={!!busy} onClick={() => decide(a, "rejected")}>Reject</button></div>
          </article>
        ))}</div> : <p className="sm muted">Nothing waiting for this date. Move the date back to 4 Oct to see the D4 service proposal.</p>}
      </Panel>
      <Panel title="Advice scoreboard" sub="What the agent advised · what you decided · what was measured after">
        <div className="table-wrap"><table><thead><tr><th>Advised</th><th>Outlet</th><th>Action</th><th className="n">Predicted</th><th className="n">Verified</th><th>Status</th><th></th></tr></thead>
          <tbody>{o.advice_scoreboard.length ? o.advice_scoreboard.map((a) => (
            <tr key={a.action_id}><td className="nowrap">{day(a.advised_as_of)}</td><td className="mono-id">{a.outlet_id}</td><td>{actionLabel(a)}</td>
              <td className="n">{a.predicted_rm_per_month != null ? rm(a.predicted_rm_per_month, 2) : "—"}</td>
              <td className="n save">{a.verified && a.type !== "run_promo" ? rm(a.verified.realised_rm_per_month, 2) : ""}</td>
              <td><StatusBadge s={a.verified?.verdict ?? a.status} /></td><td><a {...linkProps(`/franchise/run/${a.run_id}`)}>Evidence</a></td></tr>
          )) : <tr><td colSpan={7} className="muted">No advice yet.</td></tr>}</tbody></table></div>
        <p className={`num ${o.verified_savings_rm_per_month > 0 ? "save" : "muted"}`}>Verified so far: {rm(o.verified_savings_rm_per_month, 2)}/month</p>
      </Panel>
      <Panel title="Flagged machines" sub="Faults the Skeptic approved, from the meter and cycle log">
        <div className="table-wrap"><table><thead><tr><th>Outlet</th><th>Machine</th><th>Finding</th><th className="n">RM/month</th><th>Status</th><th></th></tr></thead>
          <tbody>{o.flagged_machines.length ? o.flagged_machines.map((f) => (
            <tr key={f.machine_id}><td className="mono-id">{f.outlet_id}</td><td>{short(f.machine_id)}</td><td className="sm">{f.evidence ?? f.verdict}</td><td className="n">{f.rm_per_month?.toFixed(2) ?? "est."}</td>
              <td><StatusBadge s={f.status.startsWith("verified: ") ? f.status.slice(10) : f.status} /></td><td><a {...linkProps(`/franchise/run/${f.run_id}`)}>Open</a></td></tr>
          )) : <tr><td colSpan={6} className="muted">No flagged machines.</td></tr>}</tbody></table></div>
      </Panel>
      <RunLog runs={o.run_log} limit={10} />
      {toast.node}
    </div>
  );
}

type Pipeline = { mode: { data: string; llm: string }; data: { source: string; host: string | null }; llm: { provider: string; host: string | null; models: { fast: string; deep: string } | null };
  totals: Record<string, number | null>; runs_by_mode: { name: string; n: number }[]; models: { name: string; n: number }[];
  agents: { agent: string; steps: number; llm_steps: number; sent_back: number; fallbacks: number }[];
  recent: { ts: string; run_id: string; agent: string; action: string; status: string; target: string | null; summary: string }[] };

function PipelinePage() {
  const r = useApi<Pipeline>("/franchise/pipeline");
  if (r.error) return <Failed error={r.error} />;
  if (!r.data) return <Loading />;
  const p = r.data, t = p.totals;
  return (
    <div className="stack">
      <div className="grid">
        <div className="span-6 col">
          <Panel title="Data path" sub="Every query template, including the Skeptic's re-checks" icon="database"
            right={<span className={`pill ${p.mode.data === "zetaris" ? "ok" : ""}`}><span className={`dot ${p.mode.data === "zetaris" ? "ok" : ""}`} />{p.data.source}</span>}>
            <div className="stats-row"><span><b className="kpi num">{t.zetaris_queries}</b><span className="mono-label">Zetaris queries</span></span>
              <span><b className="kpi num">{t.sqlite_queries}</b><span className="mono-label">Local SQLite</span></span>
              <span><b className="kpi num">{t.median_query_ms ?? "—"}<small className="unit"> ms</small></b><span className="mono-label">Median query</span></span></div>
            <p className="sm muted">{p.mode.data === "zetaris" ? `Live through ${p.data.host}. If Zetaris fails a query is retried once, then answered from the local copy and the run is marked mixed.` : "Sample mode: the same templates run on a local SQLite copy. Set DATA_MODE=zetaris to send them through Zetaris."}</p>
          </Panel>
        </div>
        <div className="span-6 col">
          <Panel title="Reasoning path" sub="Who reasons: Nemotron lanes or the rules agents" icon="psychology"
            right={<span className={`pill ${p.llm.models ? "ok" : ""}`}><span className={`dot ${p.llm.models ? "ok" : ""}`} />{p.llm.provider}</span>}>
            <div className="stats-row"><span><b className="kpi num">{t.llm_calls}</b><span className="mono-label">LLM calls</span></span>
              <span><b className="kpi num">{t.sent_back}</b><span className="mono-label">Sent back</span></span>
              <span><b className="kpi num">{(t.fallbacks ?? 0) + (t.retries ?? 0)}</b><span className="mono-label">Retries + fallbacks</span></span></div>
            <p className="sm muted">{p.llm.models ? `Fast lane ${p.llm.models.fast} (Scout, Planner) · deep lane ${p.llm.models.deep} (Skeptic, Reporter) via ${p.llm.host}.` : "No LLM configured: the rules agents reason. Set LLM_MODE=nightshift for Nemotron through Meterless Nightshift."} Money is always computed by tested code, never by the model.</p>
          </Panel>
        </div>
      </div>
      <div className="grid">
        <div className="span-8 col">
          <Panel title="Agents" sub={`${t.runs} runs · ${t.events} logged steps`}>
            <div className="table-wrap"><table><thead><tr><th>Agent</th><th className="n">Steps</th><th className="n">LLM steps</th><th className="n">Sent back</th><th className="n">Retries / fallbacks</th></tr></thead>
              <tbody>{p.agents.map((a) => <tr key={a.agent}><td><b>{a.agent}</b></td><td className="n">{a.steps}</td><td className="n">{a.llm_steps}</td><td className={`n ${a.sent_back ? "warm" : ""}`}>{a.sent_back}</td><td className="n">{a.fallbacks}</td></tr>)}</tbody></table></div>
          </Panel>
        </div>
        <div className="span-4 col">
          <Panel title="Runs by mode" sub="sample · live · mixed">
            <div className="row wrap">{p.runs_by_mode.map((m) => <span key={m.name} className="pill">{m.name} · {m.n}</span>)}</div>
            {p.models.length > 0 && <><p className="mono-label">Models seen in the logs</p><div className="row wrap">{p.models.map((m) => <span key={m.name} className="pill info">{m.name} · {m.n}</span>)}</div></>}
          </Panel>
        </div>
      </div>
      <Panel title="Sent back, retried, fell back" sub="The latest steps that did not pass first time">
        {p.recent.length ? <div className="table-wrap"><table><thead><tr><th>When</th><th>Agent</th><th>Status</th><th>What happened</th><th></th></tr></thead>
          <tbody>{p.recent.map((e, i) => <tr key={i}><td className="nowrap sm">{when(e.ts)}</td><td>{e.agent}{e.target && <span className="muted"> → {e.target}</span>}</td>
            <td><span className="pill accent">{e.status.replace("_", " ")}</span></td><td className="sm">{e.summary}</td><td><a {...linkProps(`/franchise/run/${e.run_id}`)}>Run</a></td></tr>)}</tbody></table></div>
          : <p className="sm muted">Every step passed first time.</p>}
      </Panel>
    </div>
  );
}

type AuditRow = { ts: string; as_of: string | null; actor: string; event: string; outlet: string | null; detail: string; status: string; run_id: string | null };
const EVENTS: [string, string][] = [["all", "All"], ["decision", "Decisions"], ["advice", "Advice"], ["outcome", "Outcomes"], ["customer_report", "Customer reports"], ["account", "Accounts"]];
function AuditPage({ outlet }: { outlet: string }) {
  const r = useApi<AuditRow[]>("/franchise/audit");
  const [kind, setKind] = useState("all"), [all, setAll] = useState(false);
  if (r.error) return <Failed error={r.error} />;
  if (!r.data) return <Loading />;
  const rows = r.data.filter((x) => (kind === "all" || x.event === kind) && (outlet === "all" || !x.outlet || x.outlet === outlet));
  return (
    <Panel title="Audit log" sub="Append-only: agent advice and outcomes, approvals, customer reports, accounts" icon="shield"
      right={<span className="pill ok"><Icon name="lock" className="xs" />H-MEM trust ledger</span>}>
      <div className="filter" role="group" aria-label="Event type">{EVENTS.map(([k, l]) => <button key={k} aria-pressed={kind === k} onClick={() => setKind(k)}>{l}</button>)}</div>
      <div className="table-wrap"><table><thead><tr><th>Recorded</th><th>Demo date</th><th>Actor</th><th>Event</th><th>Outlet</th><th>Detail</th><th>Status</th></tr></thead>
        <tbody>{rows.length ? (all ? rows : rows.slice(0, 25)).map((x, i) => (
          <tr key={i}><td className="nowrap sm mono-id">{when(x.ts)}</td><td className="nowrap sm">{x.as_of ? day(x.as_of) : "—"}</td><td className="sm warm nowrap">{x.actor}</td>
            <td><span className="pill info">{EVENTS.find(([k]) => k === x.event)?.[1].replace(/s$/, "") ?? x.event}</span></td><td className="mono-id">{x.outlet ?? ""}</td>
            <td className="sm">{x.run_id ? <a {...linkProps(`/franchise/run/${x.run_id}`)}>{x.detail}</a> : x.detail}</td><td>{["proposed", "created", "recorded"].includes(x.status) ? <span className="sm muted">{x.status}</span> : <StatusBadge s={x.status} />}</td></tr>
        )) : <tr><td colSpan={7} className="muted">Nothing recorded yet.</td></tr>}</tbody></table></div>
      {rows.length > 25 && <button className="textlink" onClick={() => setAll(!all)}>{all ? "Show fewer" : `Show all ${rows.length}`}</button>}
    </Panel>
  );
}

// --- The shell ---

const ROLE: Record<string, string> = { superadmin: "Super admin", admin: "Admin", customer: "Customer" };
const PAGES: Record<string, [string, string]> = {
  "/franchise": ["Overview", "dashboard"], "/franchise/machines": ["Machine energy", "device_hub"], "/franchise/tariff": ["Tariff and peak", "show_chart"],
  "/franchise/agent": ["Agent interventions", "smart_toy"], "/franchise/ai-pipeline": ["Data and AI", "hub"], "/people": ["People", "group"], "/franchise/audit-log": ["Audit log", "shield"],
};
const GROUPS: [string, string[]][] = [["Monitor", ["/franchise", "/franchise/machines", "/franchise/tariff", "/franchise/agent"]], ["Operations", ["/franchise/ai-pipeline", "/people", "/franchise/audit-log"]]];

export function HqShell({ crumb, actions, scope, overview, children }: { crumb: string; actions?: ReactNode; scope?: [string, (v: string) => void]; overview?: Overview; children: ReactNode }) {
  const path = usePath().split("?")[0], p = usePrefs(), [menu, setMenu] = useState(false), head = useRef<HTMLDivElement>(null);
  // The sidebar fits exactly under the sticky header + alert strip, whatever height they wrap to, so it never scrolls.
  // If the nav still doesn't fit (a short window), the agent card sheds its text, then hides.
  const side = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = head.current!, aside = side.current!;
    const fit = () => {
      el.parentElement!.style.setProperty("--hq-head", `${el.offsetHeight}px`);
      aside.classList.remove("compact", "bare");
      for (const c of ["compact", "bare"]) if (aside.scrollHeight > aside.clientHeight + 1) aside.classList.add(c);
    };
    const ro = new ResizeObserver(fit);
    ro.observe(el); ro.observe(aside); ro.observe(document.documentElement);
    return () => ro.disconnect();
  }, []);
  const own = useApi<Overview>(overview ? null : `/franchise/overview?as_of=${p.asOf}`), o = overview ?? own.data;
  const health = useApi<{ mode: { data: string; llm: string } }>("/health");
  const pending = o?.advice_scoreboard.filter((a) => a.status === "awaiting_approval") ?? [];
  const open = o?.flagged_machines.filter((f) => !f.status.startsWith("verified")) ?? [];
  const alert = pending.length ? `${pending.length} action${pending.length > 1 ? "s" : ""} awaiting approval: ${pending[0].outlet_id} ${actionLabel(pending[0])}${pending[0].reason ? `. ${pending[0].reason}` : ""}`
    : open.length ? `${open[0].outlet_id} ${open[0].verdict ?? short(open[0].machine_id)}: ${open[0].evidence ?? "flagged"}` : null;
  const mode = health.data?.mode;
  const badge: Record<string, ReactNode> = {
    "/franchise": mode && <span className={`tag ${mode.data === "zetaris" ? "ok" : ""}`}>{mode.data === "zetaris" ? "Live" : "Sample"}</span>,
    "/franchise/machines": <span className="tag">Virtual</span>,
    "/franchise/agent": pending.length > 0 && <span className="tag warm">{pending.length}</span>,
    "/franchise/ai-pipeline": mode && <span className="tag">{mode.llm}</span>,
  };
  return (
    <div className="hq">
      <div className="hq-head" ref={head}>
      <header className="hq-top">
        <button className="icon-btn hq-menu" aria-label="Menu" aria-expanded={menu} onClick={() => setMenu(!menu)}><Icon name={menu ? "close" : "menu"} /></button>
        <a className="hq-brand" {...linkProps("/franchise")}><span className="app-tile"><Icon name="local_laundry_service" /></span>
          <span><b>SmartFlux <span className="accent">EDIS</span></b><span className="mono-label">Track 3 · Reasoning architecture</span></span></a>
        {scope && o && <Dropdown label="Scope" value={scope[0]} onChange={scope[1]} options={[{ value: "all", label: `All outlets (${o.outlets.length})` }, ...o.outlets.map((x) => ({ value: x.outlet_id, label: `${x.outlet_id} ${x.name}` }))]} />}
        <span className="grow" />
        <div className="seg" role="group" aria-label="View"><button aria-pressed="true">HQ</button><button aria-pressed="false" onClick={() => navigate("/outlet")}>Outlet app</button></div>
        <DatePicker value={p.asOf} onChange={(d) => setPref("asOf", d)} />
        <div className="seg" role="group" aria-label="Language">{(["en", "ms"] as Lang[]).map((l) => <button key={l} aria-pressed={p.lang === l} onClick={() => setPref("lang", l)}>{l === "en" ? "EN" : "BM"}</button>)}</div>
        <a className="icon-btn bell" aria-label={`${pending.length} awaiting approval`} {...linkProps("/franchise/agent")}><Icon name="notifications" />{pending.length > 0 && <span className="bell-dot" />}</a>
        <span className="hq-user"><span className="right"><b className="sm">{p.session?.name}</b><span className="mono-label">{ROLE[p.session?.role ?? ""]}</span></span><span className="avatar">{p.session?.name?.[0] ?? "?"}</span></span>
        <button className="icon-btn" aria-label="Sign out" title="Sign out" onClick={() => { setPref("session", null); navigate("/login"); }}><Icon name="logout" /></button>
      </header>
      <div className={`hq-alert ${alert ? "" : "calm"}`} role="status">
        <Icon name={alert ? "warning" : "check_circle"} className="sm" /><span className="grow ellipsis"><b>{alert ? "Needs you" : "All clear"}</b> · {day(p.asOf)} · {alert ?? "No approvals waiting and no open machine flags."}</span>
        {mode && <span className="hq-mode">Data <b>{mode.data === "zetaris" ? "Zetaris" : "SQLite"}</b> · Reasoning <b>{mode.llm}</b></span>}
      </div>
      </div>
      <div className="hq-body">
        <aside ref={side} className={`hq-side ${menu ? "open" : ""}`}>
          <nav aria-label="HQ">{GROUPS.map(([g, hrefs]) => (
            <div key={g} className="side-group"><p className="mono-label">{g}</p>
              {hrefs.map((h) => <a key={h} {...linkProps(h)} onClick={(e) => { setMenu(false); linkProps(h).onClick(e); }} aria-current={path === h || (h === "/franchise" && path.startsWith("/franchise/run")) ? "page" : undefined}>
                <Icon name={PAGES[h][1]} className="sm" /><span className="grow">{PAGES[h][0]}</span>{badge[h]}</a>)}
            </div>
          ))}</nav>
          <div className="side-card">
            <p className="mono-label">Reasoning agent</p>
            <p className="sm">Ask about any outlet's bill, tariff, solar or machines. Five agents check the answer before you see it.</p>
            <a className="btn cta sm-btn" {...linkProps("/ask")}><Icon name="auto_awesome" className="sm" />Ask the agent</a>
          </div>
        </aside>
        <main className="hq-main">
          <div className="row between wrap hq-crumbs"><p className="mono-label"><span>HQ</span> › <span className="crumb">{crumb}</span></p><div className="row wrap">{actions}</div></div>
          {children}
        </main>
      </div>
    </div>
  );
}

export function AdminApp() {
  const path = usePath().split("?")[0], { asOf } = usePrefs();
  const [scope, setScope] = useState("all");
  const r = useApi<Overview>(`/franchise/overview?as_of=${asOf}`);
  const run = match("/franchise/run/:id", path);
  const all = r.data;
  const o = all && (scope === "all" ? all : { ...all, outlets: all.outlets.filter((x) => x.outlet_id === scope), flagged_machines: all.flagged_machines.filter((x) => x.outlet_id === scope),
    advice_scoreboard: all.advice_scoreboard.filter((x) => x.outlet_id === scope), run_log: all.run_log.filter((x) => x.outlet_id === scope) });
  const one = scope === "all" ? all?.outlets[0]?.outlet_id ?? "OUT-01" : scope;
  const exportCsv = async () => {
    const csv = await api<string>(`/franchise/scope2.csv?as_of=${asOf}`);
    const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(new Blob([csv], { type: "text/csv" })), download: `smartflux-scope2-${asOf}.csv` });
    a.click(); URL.revokeObjectURL(a.href);
  };
  let page: ReactNode, actions: ReactNode;
  if (run) page = <div style={{ maxWidth: 960 }}><Evidence runId={run.id} /></div>;
  else if (path === "/franchise/ai-pipeline") page = <PipelinePage />;
  else if (path === "/franchise/audit-log") page = <AuditPage outlet={scope} />;
  else if (!o) page = r.error ? <Failed error={r.error} /> : <Loading />;
  else if (path === "/franchise/machines") page = <MachinesPage o={o} outlet={one} />;
  else if (path === "/franchise/tariff") page = <TariffPage o={o} outlet={one} />;
  else if (path === "/franchise/agent") page = <AgentPage o={o} reload={r.reload} />;
  else { page = <OverviewPage o={o} all={all!} />; actions = <button className="btn primary sm-btn" onClick={exportCsv}><Icon name="download" className="sm" />Export Scope 2 CSV</button>; }
  return <HqShell crumb={run ? `Run ${run.id}` : PAGES[path]?.[0] ?? "Overview"} actions={actions} scope={[scope, setScope]} overview={all}>{page}</HqShell>;
}
