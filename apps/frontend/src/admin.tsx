// Admin web (features.md Part B): the franchise view across outlets, from GET /admin/overview.
import { useState } from "react";
import { api, linkProps, match, usePath, usePrefs, useApi } from "./api.ts";
import { DemoControls, Failed, Icon, Loading, ModeBadge, StatusBadge, day, rm, short } from "./ui.tsx";
import { Evidence } from "./owner.tsx";

type Outlet = { outlet_id: string; name: string; kpis: Record<string, number>; weekly: { week: number; peak_kwh: number; offpeak_kwh: number }[];
  tariff: { peak_share: number; breakeven: number; verdict: string; tou_saving_rm_per_month: number };
  split: { washers_kwh: number; dryers_kwh: number; base_kwh: number; total_kwh: number } | null };
type Overview = { as_of: string; outlets: Outlet[]; verified_savings_rm_per_month: number;
  flagged_machines: { outlet_id: string; machine_id: string; verdict?: string; evidence?: string; rm_per_month?: number; status: string; run_id: string }[];
  advice_scoreboard: { action_id: string; outlet_id: string; type: string; target: string; predicted_rm_per_month: number | null; status: string; verified: { verdict: string; realised_rm_per_month: number } | null }[];
  run_log: { run_id: string; created_at: string; outlet_id: string; as_of: string; kind: string; question?: string; intents: string[]; verdicts: string[]; mode: string }[] };

const sum = (o: Outlet[], k: string) => o.reduce((s, x) => s + x.kpis[k], 0);

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
    <section className="card span-4"><h3>Washers vs dryers</h3>
      {top && <p className="sm">Dryers use the largest share at {top.outlet_id} ({share(top, "dryers_kwh").toFixed(0)}% of the month's kWh).</p>}
      {rows.map((o) => (
        <div key={o.outlet_id} className="stack tight">
          <span className="sm">{o.outlet_id} {o.name}</span>
          <div className="row" style={{ gap: 2, height: 16 }} aria-hidden>
            {PARTS.map(([k, , c]) => <span key={k} style={{ width: `${share(o, k)}%`, height: "100%", background: c, borderRadius: 3 }} />)}
          </div>
          <span className="mono muted">{PARTS.map(([k, l]) => `${l} ${share(o, k).toFixed(0)}%`).join(" · ")}</span>
        </div>
      ))}
      <div className="sr-only"><table><caption>kWh by machine type, month to date</caption><thead><tr><th>Outlet</th>{PARTS.map(([, l]) => <th key={l}>{l} kWh</th>)}</tr></thead>
        <tbody>{rows.map((o) => <tr key={o.outlet_id}><td>{o.outlet_id}</td>{PARTS.map(([k]) => <td key={k}>{o.split![k].toFixed(0)}</td>)}</tr>)}</tbody></table></div>
      <div className="row wrap sm">{PARTS.map(([, l, c]) => <span key={l} className="row"><svg width="12" height="12" aria-hidden><rect width="12" height="12" rx="2" fill={c} /></svg>{l}</span>)}</div>
      <p className="sm muted">From the same regression the agent uses to check machines.</p>
    </section>
  );
}

function Dashboard() {
  const { asOf } = usePrefs();
  const r = useApi<Overview>(`/admin/overview?as_of=${asOf}`);
  if (r.error) return <Failed error={r.error} />;
  if (!r.data) return <Loading />;
  const o = r.data, cost = sum(o.outlets, "cost_rm_month_to_date"), rev = sum(o.outlets, "revenue_rm_month_to_date");
  const plans = new Map(o.run_log.filter((x) => x.intents?.includes("energy_plan")).map((x) => [x.outlet_id, x.verdicts[0]]));
  const exportCsv = async () => {
    const csv = await api<string>(`/admin/scope2.csv?as_of=${asOf}`);
    const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(new Blob([csv], { type: "text/csv" })), download: `smartflux-scope2-${asOf}.csv` });
    a.click(); URL.revokeObjectURL(a.href);
  };
  const kpis: [string, string, string?][] = [
    ["Total load (month to date)", `${(sum(o.outlets, "kwh_month_to_date") / 1000).toFixed(1)} MWh`], ["Energy cost", rm(cost)], ["Revenue", rm(rev)],
    ["Margin", `${rev ? Math.round(((rev - cost) / rev) * 100) : 0}%`], ["Verified savings", `${rm(o.verified_savings_rm_per_month, 2)}/mo`, "save"],
  ];
  return (
    <div className="stack">
      <div className="row between wrap"><p className="muted">Month to date as of {day(o.as_of)} · {o.outlets.length} outlets</p>
        <button className="btn primary" onClick={exportCsv}><Icon name="download" />Export Scope 2 CSV</button></div>
      <div className="kpis">{kpis.map(([l, v, c]) => <div key={l} className="card"><span className="label muted">{l.toUpperCase()}</span><span className={`h3 num ${c ?? ""}`} style={{ fontSize: 26, lineHeight: "32px" }}>{v}</span></div>)}</div>
      <div className="grid">
        <div className="span-8"><EnergyChart outlets={o.outlets} /></div>
        <section className="card span-4"><h3>Advice scoreboard</h3>
          {o.advice_scoreboard.length ? o.advice_scoreboard.map((a) => (
            <div key={a.action_id} className="stack tight"><div className="row between wrap"><span>{a.outlet_id} · {a.type.replace(/_/g, " ")} {a.type === "schedule_service" ? short(a.target) : a.target.replace(/^OUT-\d+ /, "")}</span><StatusBadge s={a.verified?.verdict ?? a.status} /></div>
              {a.predicted_rm_per_month != null && <span className="sm muted num">predicted {rm(a.predicted_rm_per_month, 2)}{a.verified ? ` → ${a.type === "run_promo" ? "measured" : `verified ${rm(a.verified.realised_rm_per_month, 2)}`}` : ""}</span>}</div>
          )) : <p className="sm muted">No advice yet.</p>}
          <p className="save num">Verified so far: {rm(o.verified_savings_rm_per_month, 2)}/month</p>
        </section>
        <section className="card span-8"><h3>Flagged machines</h3>
          <div className="table-wrap"><table><thead><tr><th>Outlet</th><th>Machine</th><th>Finding</th><th className="n">RM/month</th><th>Status</th><th></th></tr></thead>
            <tbody>{o.flagged_machines.length ? o.flagged_machines.map((f) => (
              <tr key={f.machine_id}><td>{f.outlet_id}</td><td className="mono">{short(f.machine_id)}</td><td className="sm">{f.evidence ?? f.verdict}</td><td className="n">{f.rm_per_month?.toFixed(2) ?? "est."}</td>
                <td><StatusBadge s={f.status.startsWith("verified: ") ? f.status.slice(10) : f.status} /></td><td><a {...linkProps(`/admin/run/${f.run_id}`)}>Open</a></td></tr>
            )) : <tr><td colSpan={6} className="muted">No flagged machines.</td></tr>}</tbody></table></div>
        </section>
        <section className="card span-4"><h3>Run log</h3>
          {o.run_log.length ? o.run_log.map((x) => (
            <a key={x.run_id} className="row between" style={{ minHeight: 44, textDecoration: "none", color: "inherit" }} {...linkProps(`/admin/run/${x.run_id}`)}>
              <span className="sm grow">{day(x.as_of)} · {x.outlet_id} · {x.kind}<br /><span className="muted">{x.verdicts[0] ?? x.question}</span></span><ModeBadge mode={x.mode} /></a>
          )) : <p className="sm muted">No runs yet.</p>}
        </section>
        <section className="card span-8"><h3>Outlets</h3>
          <div className="table-wrap"><table><thead><tr><th>Outlet</th><th className="n">kWh (month)</th><th className="n">Peak share</th><th>Tariff verdict</th><th>Energy plan</th><th className="n">Flags</th></tr></thead>
            <tbody>{o.outlets.map((x) => (
              <tr key={x.outlet_id}><td>{x.outlet_id} {x.name}</td><td className="n">{Math.round(x.kpis.kwh_month_to_date).toLocaleString()}</td><td className="n">{(x.tariff.peak_share * 100).toFixed(1)}%</td>
                <td>{x.tariff.verdict === "stay" ? "Stay on flat" : `Switch to ToU (${rm(x.tariff.tou_saving_rm_per_month, 2)}/mo)`}</td><td className="sm">{plans.get(x.outlet_id) ?? "Not asked yet"}</td>
                <td className="n">{o.flagged_machines.filter((f) => f.outlet_id === x.outlet_id && !f.status.startsWith("verified")).length}</td></tr>
            ))}</tbody></table></div>
        </section>
        <SplitChart outlets={o.outlets} />
      </div>
    </div>
  );
}

export function AdminApp() {
  const path = usePath();
  const run = match("/admin/run/:id", path);
  return (
    <div className="admin">
      <header className="topbar">
        {run ? <a className="back" aria-label="Back" {...linkProps("/admin")}><Icon name="arrow_back" /></a> : null}
        <span className="brand"><Icon name="bolt" className="save" />SmartFlux Admin</span>
        <DemoControls />
      </header>
      {run ? <div style={{ maxWidth: 960 }}><Evidence runId={run.id} /></div> : <Dashboard />}
    </div>
  );
}
