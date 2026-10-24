// Owner app (features.md Part A): briefing, energy plan, ask, decisions, evidence, approvals, machines.
import { useState } from "react";
import { api, linkProps, match, navigate, usePath, usePrefs, useApi } from "./api.ts";
import {
  BottomNav, Confidence, DecisionCard, DemoControls, Failed, Icon, Loading, ModeBadge, RiskBadge, StatusBadge, Timeline, TopBar,
  day, rm, short, useT, useToast, type Decision, type LogEvent,
} from "./ui.tsx";

type Advice = { action_id: string; type: string; target: string; advised_as_of: string; risk: string; reason?: string; run_id: string; predicted_rm_per_month: number | null; status: string;
  verified: { verdict: string; realised_rm_per_month: number; band_rm_per_month: number } | null };
type OwnerMachine = { machine_id: string; name: string; type: string; heat_source: string; status: string; minutes_left: number | null; price_from_rm: number | null; price_to_rm: number | null;
  normal: { kwh_per_cycle: number | null; kwh_se: number | null; minutes_per_cycle: number | null; learned_as_of: string } | null; cost_per_cycle_rm: number | null;
  health: string; flag: { verdict?: string; evidence?: string; rm_per_month?: number; run_id: string } | null; customer_reports: { reason: string; as_of: string }[] };
type RunRow = { run_id: string; as_of: string; kind: string; question?: string; intents: string[]; verdicts: string[]; mode: string };
type Owner = { as_of: string; outlet: { outlet_id: string; name: string; kpis: Record<string, number>; tariff: { peak_share: number; breakeven: number; verdict: string } };
  machines: OwnerMachine[]; briefing: { run_id: string; as_of: string; decisions: Decision[] } | null; advice: Advice[]; verified_savings_rm_per_month: number; run_log: RunRow[] };
type Ctx = { o: Owner; reload: () => void; outlet: string };

const ACTION: Record<string, string> = { schedule_service: "Service", run_promo: "Run promo", switch_tariff: "Switch to ToU", request_solar_quote: "Request solar quote" };
const actionTitle = (a: Advice) => `${ACTION[a.type] ?? a.type} ${a.type === "schedule_service" ? `dryer ${short(a.target)}` : a.type === "run_promo" ? `· ${a.target}` : a.type === "request_solar_quote" ? `· ${a.target.split(" ").slice(1).join(" ")}` : ""}`;
const reasonLabel = (r: string) => ({ wont_start: "won't start", not_heating: "not heating", too_long: "takes too long", other: "other" }[r] ?? r);

async function ask(outlet: string, asOf: string, lang: string, body: { question?: string; briefing?: boolean }) {
  const r = await api<{ run_id: string }>("/run", { outlet_id: outlet, as_of: asOf, lang, ...body });
  return r.run_id;
}

function Home({ o, outlet, reload }: Ctx) {
  const t = useT(), p = usePrefs();
  const [busy, setBusy] = useState(false);
  const k = o.outlet.kpis;
  const plan = o.run_log.find((r) => r.intents?.includes("energy_plan") && r.as_of === o.as_of);
  const alerts = [
    ...o.machines.filter((m) => m.health === "flagged" || m.health === "service_approved").map((m) => ({ icon: "warning", cls: "warn", text: m.flag?.verdict ?? `${m.name} flagged`, href: `/machines/${m.machine_id}` })),
    ...o.advice.filter((a) => a.verified).map((a) => ({ icon: a.verified!.verdict === "verified" ? "check_circle" : "hourglass_empty", cls: a.verified!.verdict === "verified" ? "ok" : "muted",
      text: `${actionTitle(a)}: ${a.verified!.verdict === "verified" ? `saving verified ${rm(a.verified!.realised_rm_per_month)}/month` : a.verified!.verdict.replace("_", " ")}`, href: "/approvals?tab=history" })),
    ...o.machines.filter((m) => m.customer_reports.length).map((m) => ({ icon: "campaign", cls: "info", text: `Customers reported ${m.name}: ${reasonLabel(m.customer_reports.at(-1)!.reason)}`, href: `/machines/${m.machine_id}` })),
  ];
  const brief = async () => { setBusy(true); try { navigate(`/briefing/${await ask(outlet, o.as_of, p.lang, { briefing: true })}`); reload(); } finally { setBusy(false); } };
  return (
    <div className="stack">
      {o.briefing ? (
        <section className="card briefing">
          <span className="label">{day(o.briefing.as_of).toUpperCase()} · WEEKLY BRIEFING</span>
          <ul>{o.briefing.decisions[0].evidence.slice(0, 3).map((b) => <li key={b}>{b}</li>)}</ul>
          <a className="btn inverted" {...linkProps(`/briefing/${o.briefing.run_id}`)}>{t("open")}</a>
        </section>
      ) : (
        <section className="card briefing">
          <span className="label">WEEKLY BRIEFING</span>
          <p>Your first briefing arrives next Monday at 08:00, or prepare one now.</p>
          <button className="btn inverted" disabled={busy} onClick={brief}>{busy ? "Preparing…" : "Prepare briefing now"}</button>
        </section>
      )}
      <section className="card">
        <span className="label muted">{t("thisMonth").toUpperCase()} · TO {day(o.as_of).toUpperCase()}</span>
        <p className="display num">{Math.round(k.kwh_month_to_date).toLocaleString()} kWh</p>
        <p className="num">{rm(k.cost_rm_month_to_date)} so far · projected bill {rm(k.projected_bill_rm)}</p>
        <div className="bar" role="progressbar" aria-label="Bill so far vs projected" aria-valuenow={Math.round((k.cost_rm_month_to_date / k.projected_bill_rm) * 100)}><span style={{ width: `${Math.min(100, (k.cost_rm_month_to_date / k.projected_bill_rm) * 100)}%` }} /></div>
        <p className="sm muted">Peak share {(o.outlet.tariff.peak_share * 100).toFixed(1)}% · ToU break-even {(o.outlet.tariff.breakeven * 100).toFixed(1)}%</p>
      </section>
      {alerts.length > 0 && <section className="stack tight" aria-label="Alerts">
        <h3>Alerts</h3>
        {alerts.map((a) => <a key={a.text} className="mrow" {...linkProps(a.href)}><Icon name={a.icon} className={a.cls} /><span className="grow">{a.text}</span><Icon name="chevron_right" /></a>)}
      </section>}
      <a className="card link" {...linkProps("/plan")}>
        <span className="chip"><Icon name="solar_power" className="sm" />ENERGY PLAN</span>
        <h3>{plan ? plan.verdicts[0] : "Solar, ToU or both? See your plan"}</h3>
      </a>
      <section className="card">
        <span className="label muted">VERIFIED SAVINGS</span>
        <p className="h3 save num">{rm(o.verified_savings_rm_per_month, 2)}/month saved from past advice</p>
      </section>
      <a className="fab" aria-label={t("ask")} {...linkProps("/ask")}><Icon name="auto_awesome" /></a>
    </div>
  );
}

// M-06: progress while the agent works; the real steps come from the run's log afterwards.
const STEPS = [["Scout", "Understanding your question"], ["Planner", "Planning what to check"], ["Investigator", "Checking your data"], ["Skeptic", "Double-checking the numbers"], ["Reporter", "Writing your answer"]];
function Working({ events }: { events?: LogEvent[] }) {
  return (
    <ol className="steps" aria-live="polite">
      {STEPS.map(([agent, text]) => {
        const done = events?.some((e) => e.agent_name === agent);
        return <li key={agent}><Icon name={events ? (done ? "check_circle" : "remove") : "progress_activity"} className={events ? (done ? "ok" : "muted") : "spin"} />{text} <span className="label muted">({agent})</span></li>;
      })}
      {events?.some((e) => e.status === "needs_revision") && <li className="warn"><Icon name="undo" />Skeptic asked for one more check</li>}
    </ol>
  );
}

const SUGGEST = ["Solar, ToU or both?", "Why was my bill higher?", "Which machine is wasting money?", "Did the D4 service work?", "When should I run a promo?"];
function Ask({ outlet, o, reload }: Ctx) {
  const p = usePrefs(), t = useT();
  const [q, setQ] = useState(""), [busy, setBusy] = useState(false), [err, setErr] = useState("");
  const go = async (question: string) => {
    setBusy(true); setErr("");
    try { const id = await ask(outlet, o.as_of, p.lang, { question }); reload(); navigate(`/result/${id}`); }
    catch (e) { setErr((e as Error).message); setBusy(false); }
  };
  return (
    <div className="stack">
      <form className="stack tight" onSubmit={(e) => { e.preventDefault(); q.trim() && go(q.trim()); }}>
        <label htmlFor="q" className="h3">{p.lang === "ms" ? "Tanya SmartFlux" : "Ask SmartFlux"}</label>
        <textarea id="q" className="input" value={q} onChange={(e) => setQ(e.target.value)} lang={p.lang}
          placeholder={p.lang === "ms" ? "Tanya tentang bil, mesin atau solar…" : "Ask about your bill, machines or solar…"} />
        <button className="btn cta" disabled={busy || !q.trim()}>{t("ask")}</button>
      </form>
      <div className="filter wrap">{SUGGEST.map((s) => <button key={s} disabled={busy} onClick={() => go(s)}>{s}</button>)}</div>
      {busy && <section className="card"><Working /></section>}
      {err && <Failed error={err} />}
      <h3>Recent questions</h3>
      {o.run_log.filter((r) => r.kind === "ask").slice(0, 5).map((r) =>
        <a key={r.run_id} className="mrow" {...linkProps(`/result/${r.run_id}`)}><Icon name="history" /><span className="grow">{r.question}<br /><span className="sm muted">{r.verdicts[0]} · as of {day(r.as_of)}</span></span></a>)}
    </div>
  );
}

type RunView = { result: { run_id: string; created_at: string; as_of: string; outlet_id: string; question?: string; mode: string; run_mode: string; decisions: Decision[];
  actions: { id: string; type: string; target: string; reason: string; risk: string }[]; unresolved: string[]; message?: string; ruled_out?: { kind: string; reason: string }[] };
  events: LogEvent[]; sql: Record<string, string> };

function Result({ runId, only }: { runId: string; only?: number }) {
  const r = useApi<RunView>(`/runs/${runId}`);
  if (r.error) return <Failed error={r.error} />;
  if (!r.data) return <Loading />;
  const { result, events } = r.data;
  const cards = only == null ? result.decisions : [result.decisions[only]];
  return (
    <div className="stack">
      {result.question && <p className="muted">“{result.question}” · as of {day(result.as_of)}</p>}
      {only == null && <section className="card"><Working events={events} /></section>}
      {result.message && <p className="card">{result.message}</p>}
      {!result.decisions.length && !result.message && <section className="card">
        <h3>Nothing new to report</h3>
        {result.ruled_out?.map((r) => <p key={r.reason}>{r.reason}.</p>)}
        <a className="textlink" {...linkProps("/approvals?tab=history")}>See verified results in Approvals → History</a>
      </section>}
      {cards.map((d, i) => <DecisionCard key={i} d={d} runId={runId} />)}
      {result.unresolved.length > 0 && <section className="card"><StatusBadge s="unresolved" /><ul>{result.unresolved.map((u) => <li key={u}>{u}</li>)}</ul></section>}
      {only == null && result.actions.map((a) =>
        <a key={a.id} className="card link" {...linkProps("/approvals")}>
          <div className="row between wrap"><span className="h3">Proposed: {a.type.replace(/_/g, " ")} {a.target}</span><RiskBadge r={a.risk} /></div>
          <p className="sm muted">{a.reason}</p><span className="btn cta">Go to approval</span>
        </a>)}
    </div>
  );
}

export function Evidence({ runId }: { runId: string }) {
  const r = useApi<RunView>(`/runs/${runId}`);
  if (r.error) return <Failed error={r.error} />;
  if (!r.data) return <Loading />;
  const { result, events, sql } = r.data;
  const calcs = events.filter((e) => e.action.startsWith("calc."));
  const models = [...new Set(events.map((e) => e.model).filter(Boolean))];
  return (
    <div className="stack">
      <div className="row between wrap"><span className="mono muted">{result.run_id} · {result.outlet_id} · {new Date(result.created_at).toLocaleString("en-GB")}</span><ModeBadge mode={result.run_mode} /></div>
      <p className="sm">{result.mode}</p>
      <h3>Agent timeline</h3>
      <Timeline events={events} />
      <h3>Data checked</h3>
      {Object.entries(sql).map(([name, text]) => (
        <details key={name}><summary><span className="mono">{name}</span></summary>
          <button className="btn secondary" onClick={() => navigator.clipboard?.writeText(text)}><Icon name="content_copy" />Copy SQL</button>
          <pre className="sql">{text.replace(/\n\s+/g, "\n  ")}</pre>
        </details>
      ))}
      <h3>Numbers</h3>
      <div className="table-wrap"><table><thead><tr><th>Calculator</th><th>Inputs</th><th>Output</th></tr></thead>
        <tbody>{calcs.map((e, i) => <tr key={i}><td className="mono">{e.action.slice(5)}</td><td className="sm">{e.input_summary}</td><td className="sm">{e.output_summary}</td></tr>)}</tbody></table></div>
      <h3>Models used</h3>
      <div className="row wrap">{models.length ? models.map((m) => <span key={m} className="chip soft">{m}</span>) : <span className="chip soft">Rules reasoner (sample mode, no LLM)</span>}</div>
    </div>
  );
}

function Plan({ outlet, o, reload }: Ctx) {
  const p = usePrefs();
  const [busy, setBusy] = useState(false);
  const run = o.run_log.find((r) => r.intents?.includes("energy_plan") && r.as_of === o.as_of);
  const r = useApi<RunView>(run ? `/runs/${run.run_id}` : null);
  const go = async () => { setBusy(true); try { await ask(outlet, o.as_of, p.lang, { question: "Solar, ToU or both?" }); reload(); } finally { setBusy(false); } };
  if (!run) return (
    <section className="card stack">
      <span className="chip"><Icon name="solar_power" className="sm" />ENERGY PLAN</span>
      <h2>Solar, ToU or both?</h2>
      <p>SmartFlux sizes solar on your real half-hourly load and the real sunshine at your outlet, then re-decides the tariff after solar.</p>
      <button className="btn cta" disabled={busy} onClick={go}>{busy ? "Working it out…" : "Work out my plan"}</button>
      {busy && <Working />}
    </section>
  );
  if (!r.data) return <Loading />;
  const d = r.data.result.decisions.find((x) => x.type === "energy_plan")!;
  const options = d.evidence.filter((e) => /^\d+ kWp:/.test(e)).sort((a, b) => parseInt(a) - parseInt(b));
  const kwp = /(\d+) kWp/.exec(d.verdict)?.[1];
  const other = d.evidence.filter((e) => !/^\d+ kWp:/.test(e));
  const action = r.data.result.actions.find((a) => a.type === "request_solar_quote");
  return (
    <div className="stack">
      <article className="card">
        <span className="chip"><Icon name="solar_power" className="sm" />ENERGY PLAN</span>
        <h2>{d.verdict}</h2>
        {d.rm_per_month != null && <p className="display save num">{rm(d.rm_per_month)}<span className="h3"> /month</span></p>}
        <Confidence c={d.confidence} />
      </article>
      {options.length > 0 && <section className="card"><h3>Solar options</h3>
        {options.map((e) => <p key={e} className="row"><Icon name={e.startsWith(`${kwp} kWp`) ? "star" : "solar_power"} className={e.startsWith(`${kwp} kWp`) ? "save" : "muted"} /><span>{e}{e.startsWith(`${kwp} kWp`) ? " · Recommended" : ""}</span></p>)}
      </section>}
      <section className="card"><h3>Tariff before and after solar</h3>{other.map((e) => <p key={e}>{e}</p>)}</section>
      <section className="card"><h3>Ruled out</h3>{d.ruled_out.map((x) => <p key={x} className="row"><Icon name="close" className="bad" />{x}</p>)}</section>
      <details className="card"><summary>Assumptions</summary><ul className="sm muted">{d.assumptions.map((a) => <li key={a}>{a}</li>)}</ul></details>
      {action && <a className="btn cta" {...linkProps("/approvals")}>Request solar quote ({action.target.split(" ").slice(1).join(" ")})</a>}
      <a className="textlink" {...linkProps(`/evidence/${run.run_id}`)}>Show evidence</a>
    </div>
  );
}

function Approvals({ o, reload }: Ctx) {
  const t = useT(), path = usePath(), toast = useToast();
  const tab = path.includes("tab=history") ? "history" : "pending";
  const [busy, setBusy] = useState("");
  const pending = o.advice.filter((a) => a.status === "awaiting_approval"), done = o.advice.filter((a) => a.status !== "awaiting_approval");
  const decide = async (a: Advice, decision: "approved" | "rejected") => {
    setBusy(a.action_id);
    try {
      await api("/approve", { action_id: a.action_id, decision });
      toast.show(decision === "approved" ? (a.type === "schedule_service" ? "Approved. Customers now see it as under maintenance; we'll check if it worked after 2 weeks." : "Approved. We'll check if it worked.") : "Rejected. SmartFlux won't propose it again.");
      reload();
    } catch (e) { toast.show((e as Error).message); }
    setBusy("");
  };
  return (
    <div className="stack">
      <div className="seg" role="tablist">
        <button role="tab" aria-selected={tab === "pending"} aria-pressed={tab === "pending"} onClick={() => navigate("/approvals", true)}>{t("pending")} ({pending.length})</button>
        <button role="tab" aria-selected={tab === "history"} aria-pressed={tab === "history"} onClick={() => navigate("/approvals?tab=history", true)}>{t("history")}</button>
      </div>
      {tab === "pending" && (pending.length ? pending.map((a) => (
        <article key={a.action_id} className="card">
          <div className="row between wrap"><h2>{actionTitle(a)}</h2><RiskBadge r={a.risk} /></div>
          {a.reason && <p>{a.reason}</p>}
          {a.predicted_rm_per_month != null && <p className="save num">Predicted saving {rm(a.predicted_rm_per_month, 2)}/month</p>}
          <p className="sm muted">Advised as of {day(a.advised_as_of)} · <a {...linkProps(`/evidence/${a.run_id}`)}>evidence</a></p>
          <div className="row"><button className="btn cta grow" disabled={!!busy} onClick={() => decide(a, "approved")}>{t("approve")}</button>
            <button className="btn outlined grow" disabled={!!busy} onClick={() => decide(a, "rejected")}>{t("reject")}</button></div>
        </article>
      )) : <p className="muted">Nothing waiting for your approval.</p>)}
      {tab === "history" && done.map((a) => (
        <article key={a.action_id} className="card">
          <div className="row between wrap"><h3>{actionTitle(a)}</h3><StatusBadge s={a.verified?.verdict ?? a.status} /></div>
          {a.verified && a.predicted_rm_per_month != null && a.type !== "run_promo" && <div className="stack tight">
            <p className="sm">Predicted {rm(a.predicted_rm_per_month, 2)} vs actual {rm(a.verified.realised_rm_per_month, 2)} (±{rm(a.verified.band_rm_per_month, 2)})</p>
            <div className="bar"><span style={{ width: "100%" }} /></div>
            <div className="bar save"><span style={{ width: `${Math.min(100, (a.verified.realised_rm_per_month / a.predicted_rm_per_month) * 100)}%` }} /></div>
            <p className="sm muted">{Math.round((a.verified.realised_rm_per_month / a.predicted_rm_per_month) * 100)}% of prediction · compared against your other machines so weather doesn't skew it</p>
          </div>}
          {a.status === "approved" && !a.verified && <p className="sm muted">Approved. Ask "Did it work?" after about 2 weeks.</p>}
        </article>
      ))}
      {toast.node}
    </div>
  );
}

function Machines({ o }: Ctx) {
  const t = useT();
  const [f, setF] = useState<"all" | "washer" | "dryer" | "flagged">("all");
  const shown = o.machines.filter((m) => f === "all" || (f === "flagged" ? m.health !== "ok" : m.type === f));
  return (
    <div className="stack">
      <div className="filter" role="group" aria-label="Filter">
        {([["all", t("all")], ["washer", t("washers")], ["dryer", t("dryers")], ["flagged", t("flagged")]] as const).map(([k, l]) => <button key={k} aria-pressed={f === k} onClick={() => setF(k)}>{l}</button>)}
      </div>
      {!o.machines.some((m) => m.normal) && <p className="card sm">Normal levels appear once SmartFlux has checked your machines. Ask “Which machine is wasting money?”.</p>}
      {shown.map((m) => (
        <a key={m.machine_id} className="mrow" {...linkProps(`/machines/${m.machine_id}`)}>
          <Icon name={m.type === "dryer" ? "mode_heat" : "local_laundry_service"} />
          <div className="grow stack tight">
            <div className="row between wrap"><span className="h3">{m.name}</span><StatusBadge s={m.health} /></div>
            <div className="row wrap sm">
              {m.type === "dryer" && <span className="chip soft">{m.heat_source.toUpperCase()}</span>}
              {m.normal && <span className="mono">{m.heat_source === "gas" ? `${m.normal.minutes_per_cycle?.toFixed(0)} min` : `${m.normal.kwh_per_cycle?.toFixed(2)} kWh`} per cycle</span>}
            </div>
            {m.cost_per_cycle_rm != null && <p className="sm">Costs {rm(m.cost_per_cycle_rm, 2)} · You charge {m.price_from_rm === m.price_to_rm ? rm(m.price_from_rm, 2) : `${rm(m.price_from_rm)}–${rm(m.price_to_rm)}`}</p>}
            {m.customer_reports.length > 0 && <p className="sm info"><Icon name="campaign" className="sm" /> {m.customer_reports.length} customer report{m.customer_reports.length > 1 ? "s" : ""}</p>}
          </div>
        </a>
      ))}
    </div>
  );
}

function Machine({ o, id }: Ctx & { id: string }) {
  const m = o.machines.find((x) => x.machine_id === id);
  if (!m) return <Loading />;
  const advice = o.advice.filter((a) => a.target === id);
  return (
    <div className="stack">
      <section className="card">
        <div className="row between wrap"><h2>{m.type === "dryer" ? "Dryer" : "Washer"} {m.name}{m.type === "dryer" ? ` · ${m.heat_source === "gas" ? "Gas" : "Electric"}` : ""}</h2><StatusBadge s={m.health} /></div>
        {m.normal ? <p className="num">Normal level {m.heat_source === "gas" ? `${m.normal.minutes_per_cycle?.toFixed(0)} min` : `${m.normal.kwh_per_cycle?.toFixed(2)} ± ${m.normal.kwh_se?.toFixed(2)} kWh`} per cycle <span className="sm muted">(learned as of {day(m.normal.learned_as_of)})</span></p>
          : <p className="sm muted">{m.type === "washer" ? "SmartFlux tracks dryers individually; washers are part of the outlet total." : "No normal level learned yet."}</p>}
        {m.cost_per_cycle_rm != null && <p>Costs {rm(m.cost_per_cycle_rm, 2)} per cycle · you charge {rm(m.price_from_rm, 2)}{m.price_to_rm !== m.price_from_rm ? `–${rm(m.price_to_rm, 2)}` : ""}</p>}
        <p className="sm muted">Right now (customer view): {m.status === "maintenance" ? "under maintenance" : m.status === "in_use" ? `in use, ${m.minutes_left} min left` : "free"}</p>
      </section>
      {m.flag && <section className="card"><h3>{m.flag.verdict}</h3>{m.flag.evidence && <p>{m.flag.evidence}</p>}<a className="textlink" {...linkProps(`/evidence/${m.flag.run_id}`)}>Show evidence</a></section>}
      <section className="card"><h3>Advice history</h3>
        {advice.length ? advice.map((a) => <div key={a.action_id} className="row between wrap"><span>{actionTitle(a)} · {day(a.advised_as_of)}</span><StatusBadge s={a.verified?.verdict ?? a.status} /></div>) : <p className="sm muted">Nothing advised for this machine.</p>}
      </section>
      <section className="card"><h3>Customer reports</h3>
        {m.customer_reports.length ? m.customer_reports.map((r, i) => <p key={i} className="row"><Icon name="campaign" className="info" />{reasonLabel(r.reason)} · {day(r.as_of)}</p>) : <p className="sm muted">None.</p>}
        <p className="sm muted">Reports are hints: SmartFlux weighs them against the meter data and never flags a machine on a report alone.</p>
      </section>
    </div>
  );
}

function Briefing({ runId }: { runId: string }) {
  const r = useApi<RunView>(`/runs/${runId}`);
  if (r.error) return <Failed error={r.error} />;
  if (!r.data) return <Loading />;
  const [b, ...rest] = r.data.result.decisions;
  return (
    <div className="stack">
      <section className="card briefing"><span className="label">{b.verdict.toUpperCase()}</span><ul>{b.evidence.map((e) => <li key={e}>{e}</li>)}</ul></section>
      {rest.map((d, i) => <a key={i} className="card link" {...linkProps(`/decision/${runId}/${i + 1}`)}><DecisionCard d={d} compact /></a>)}
      <p className="sm muted">Generated automatically by SmartFlux agents. <a {...linkProps(`/evidence/${runId}`)}>Show evidence</a></p>
    </div>
  );
}

export function OwnerApp() {
  const path = usePath(), prefs = usePrefs();
  const outlets = useApi<{ outlet_id: string; name: string }[]>("/outlets");
  const outlet = prefs.outlet && prefs.session!.outlets.includes(prefs.outlet) ? prefs.outlet : prefs.session!.outlets[0];
  const owner = useApi<Owner>(`/outlets/${outlet}/owner?as_of=${prefs.asOf}`);
  const o = owner.data;
  const ctx = o && { o, reload: owner.reload, outlet };
  let p, screen, title: string | undefined, back: string | undefined;
  if (!ctx) screen = owner.error ? <Failed error={owner.error} /> : <Loading />;
  else if ((p = match("/result/:id", path))) { screen = <Result runId={p.id} />; title = "Answer"; back = "/ask"; }
  else if ((p = match("/decision/:id/:i", path))) { screen = <Result runId={p.id} only={Number(p.i)} />; title = "Decision"; back = "/"; }
  else if ((p = match("/evidence/:id", path))) { screen = <Evidence runId={p.id} />; title = "Evidence"; back = "/"; }
  else if ((p = match("/briefing/:id", path))) { screen = <Briefing runId={p.id} />; title = "Weekly briefing"; back = "/"; }
  else if ((p = match("/machines/:id", path))) { screen = <Machine {...ctx} id={p.id} />; title = "Machine"; back = "/machines"; }
  else if (match("/machines", path)) { screen = <Machines {...ctx} />; title = "Machines"; }
  else if (match("/approvals", path)) { screen = <Approvals {...ctx} />; title = "Approvals"; }
  else if (match("/ask", path)) { screen = <Ask {...ctx} />; title = "Ask"; }
  else if (match("/plan", path)) { screen = <Plan {...ctx} />; title = "Energy plan"; back = "/"; }
  else screen = <Home {...ctx} />;
  return (
    <div className="app">
      <TopBar title={title} back={back}>{!title && <DemoControls outlets={outlets.data?.filter((x) => prefs.session!.outlets.includes(x.outlet_id)).map((x) => ({ id: x.outlet_id, name: x.name }))} />}</TopBar>
      {screen}
      <BottomNav pending={o?.advice.filter((a) => a.status === "awaiting_approval").length ?? 0} />
    </div>
  );
}
