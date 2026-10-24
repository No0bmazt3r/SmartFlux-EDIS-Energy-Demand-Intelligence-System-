// Owner app (features.md Part A): briefing, energy plan, ask, decisions, evidence, approvals, machines.
import { useState } from "react";
import { api, linkProps, match, navigate, usePath, usePrefs, useApi } from "./api.ts";
import {
  BottomNav, Confidence, DecisionCard, DemoControls, Failed, Icon, Loading, ModeBadge, RiskBadge, Sparkline, StatusBadge, Timeline, TopBar, WeeklyChart,
  day, rm, short, useT, useToast, type Decision, type T, type LogEvent, type Week,
} from "./ui.tsx";

type Advice = { action_id: string; type: string; target: string; advised_as_of: string; risk: string; reason?: string; run_id: string; predicted_rm_per_month: number | null; status: string;
  verified: { verdict: string; realised_rm_per_month: number; band_rm_per_month: number } | null };
type OwnerMachine = { machine_id: string; name: string; type: string; heat_source: string; status: string; minutes_left: number | null; price_from_rm: number | null; price_to_rm: number | null;
  normal: { kwh_per_cycle: number | null; kwh_se: number | null; minutes_per_cycle: number | null; learned_as_of: string } | null; cost_per_cycle_rm: number | null;
  health: string; flag: { verdict?: string; evidence?: string; rm_per_month?: number; run_id: string } | null; customer_reports: { reason: string; as_of: string }[];
  weekly: Week[]; serviced_on: string[] };
const normalOf = (m: OwnerMachine) => (m.heat_source === "gas" ? m.normal?.minutes_per_cycle : m.normal?.kwh_per_cycle) ?? null;
type RunRow = { run_id: string; as_of: string; kind: string; question?: string; intents: string[]; verdicts: string[]; mode: string };
type Owner = { as_of: string; outlet: { outlet_id: string; name: string; kpis: Record<string, number>; tariff: { peak_share: number; breakeven: number; verdict: string } };
  machines: OwnerMachine[]; briefing: { run_id: string; as_of: string; decisions: Decision[] } | null; advice: Advice[]; verified_savings_rm_per_month: number; run_log: RunRow[] };
type Ctx = { o: Owner; reload: () => void; outlet: string };

const ACTION = { schedule_service: "aService", run_promo: "aPromo", switch_tariff: "aTou", request_solar_quote: "aQuote" } as const;
const actionTitle = (a: Advice, t: T) => `${a.type in ACTION ? t(ACTION[a.type as keyof typeof ACTION]) : a.type} ${a.type === "schedule_service" ? `${t("dryer").toLowerCase()} ${short(a.target)}` : a.type === "run_promo" ? `· ${a.target}` : a.type === "request_solar_quote" ? `· ${a.target.split(" ").slice(1).join(" ")}` : ""}`;
const reasonLabel = (r: string, t: T) => (["wont_start", "not_heating", "too_long", "other"].includes(r) ? t(r as "other").toLowerCase() : r);

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
      text: `${actionTitle(a, t)}: ${a.verified!.verdict === "verified" ? `${t("savingVerified")} ${rm(a.verified!.realised_rm_per_month, 2)}${t("perMonth")}` : a.verified!.verdict.replace("_", " ")}`, href: "/approvals?tab=history" })),
    ...o.machines.filter((m) => m.customer_reports.length).map((m) => ({ icon: "campaign", cls: "info", text: `${t("custReported")} ${m.name}: ${reasonLabel(m.customer_reports.at(-1)!.reason, t)}`, href: `/machines/${m.machine_id}` })),
  ];
  const brief = async () => { setBusy(true); try { navigate(`/briefing/${await ask(outlet, o.as_of, p.lang, { briefing: true })}`); reload(); } finally { setBusy(false); } };
  return (
    <div className="stack">
      {o.briefing ? (
        <section className="card briefing">
          <span className="label">{t("weeklyBriefing")} · {day(o.briefing.as_of)}</span>
          <ul>{o.briefing.decisions[0].evidence.slice(0, 3).map((b) => <li key={b}>{b}</li>)}</ul>
          <a className="btn inverted" {...linkProps(`/briefing/${o.briefing.run_id}`)}>{t("open")}</a>
        </section>
      ) : (
        <section className="card briefing">
          <span className="label">{t("weeklyBriefing")}</span>
          <p>{t("briefingNone")}</p>
          <button className="btn inverted" disabled={busy} onClick={brief}>{busy ? t("preparing") : t("prepareNow")}</button>
        </section>
      )}
      <section className="card">
        <span className="label muted">{t("thisMonth")} · {t("to")} {day(o.as_of)}</span>
        <p className="display num">{Math.round(k.kwh_month_to_date).toLocaleString()} kWh</p>
        <p className="num">{rm(k.cost_rm_month_to_date)} {t("soFar")} · {t("projected")} {rm(k.projected_bill_rm)}</p>
        <div className="bar" role="progressbar" aria-label={t("billBar")} aria-valuenow={Math.round((k.cost_rm_month_to_date / k.projected_bill_rm) * 100)}><span style={{ width: `${Math.min(100, (k.cost_rm_month_to_date / k.projected_bill_rm) * 100)}%` }} /></div>
        <p className="sm muted">{t("peakShare")} {(o.outlet.tariff.peak_share * 100).toFixed(1)}% · {t("breakeven")} {(o.outlet.tariff.breakeven * 100).toFixed(1)}%</p>
      </section>
      {alerts.length > 0 && <section className="stack tight" aria-label={t("alerts")}>
        <h3>{t("alerts")}</h3>
        <div className="list">{alerts.map((a) => <a key={a.text} className="mrow" {...linkProps(a.href)}><Icon name={a.icon} className={a.cls} /><span className="grow">{a.text}</span><Icon name="chevron_right" className="muted" /></a>)}</div>
      </section>}
      <a className="card link" {...linkProps("/plan")}>
        <span className="label muted row"><Icon name="solar_power" className="sm" />{t("energyPlan")}</span>
        <div className="row between"><h3>{plan ? plan.verdicts[0] : t("planTeaser")}</h3><Icon name="chevron_right" className="muted" /></div>
      </a>
      <section className="card">
        <span className="label muted">{t("verifiedSavings")}</span>
        {o.verified_savings_rm_per_month > 0 ? <p className="h3 save num">{rm(o.verified_savings_rm_per_month, 2)}{t("savedFromAdvice")}</p>
          : <p className="sm muted"><span className="h3 num">{rm(0, 2)}</span><br />{t("noSavingsYet")}</p>}
      </section>
    </div>
  );
}

// M-06: progress while the agent works; the real steps come from the run's log afterwards.
const STEPS = [["Scout", "s1"], ["Planner", "s2"], ["Investigator", "s3"], ["Skeptic", "s4"], ["Reporter", "s5"]] as const;
function Working({ events }: { events?: LogEvent[] }) {
  const t = useT();
  return (
    <ol className="steps" aria-live="polite">
      {STEPS.map(([agent, key]) => {
        const text = t(key);
        const done = events?.some((e) => e.agent_name === agent);
        return <li key={agent}><Icon name={events ? (done ? "check_circle" : "remove") : "progress_activity"} className={events ? (done ? "ok" : "muted") : "spin"} />{text} <span className="label muted">({agent})</span></li>;
      })}
      {events?.some((e) => e.status === "needs_revision") && <li className="warn"><Icon name="undo" />{t("sentBack")}</li>}
    </ol>
  );
}

const SUGGEST = {
  en: ["Solar, ToU or both?", "Why was my bill higher?", "Which machine is wasting money?", "Did the D4 service work?", "When should I run a promo?"],
  ms: ["Solar, ToU atau kedua-duanya?", "Kenapa bil saya lebih tinggi?", "Mesin mana yang membazir wang?", "Adakah servis D4 berkesan?", "Bila patut saya adakan promosi?"],
};
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
        <label htmlFor="q" className="h3">{t("askSF")}</label>
        <textarea id="q" className="input" value={q} onChange={(e) => setQ(e.target.value)} lang={p.lang}
          placeholder={t("askPh")} />
        <button className="btn cta" disabled={busy || !q.trim()}>{t("ask")}</button>
      </form>
      <div className="filter wrap">{SUGGEST[p.lang].map((s) => <button key={s} disabled={busy} onClick={() => go(s)}>{s}</button>)}</div>
      {busy && <section className="card"><Working /></section>}
      {err && <Failed error={err} />}
      <h3>{t("recent")}</h3>
      <div className="list">{o.run_log.filter((r) => r.kind === "ask").slice(0, 5).map((r) =>
        <a key={r.run_id} className="mrow" {...linkProps(`/result/${r.run_id}`)}><Icon name="history" className="muted" /><span className="grow">{r.question}<br /><span className="sm muted">{r.verdicts[0]} · {t("asOfLc")} {day(r.as_of)}</span></span></a>)}</div>
    </div>
  );
}

type RunView = { result: { run_id: string; created_at: string; as_of: string; outlet_id: string; question?: string; mode: string; run_mode: string; decisions: Decision[];
  actions: { id: string; type: string; target: string; reason: string; risk: string }[]; unresolved: string[]; message?: string; ruled_out?: { kind: string; reason: string }[] };
  events: LogEvent[]; sql: Record<string, string> };

function Result({ runId, only }: { runId: string; only?: number }) {
  const t = useT();
  const r = useApi<RunView>(`/runs/${runId}`);
  if (r.error) return <Failed error={r.error} />;
  if (!r.data) return <Loading />;
  const { result, events } = r.data;
  const cards = only == null ? result.decisions : [result.decisions[only]];
  return (
    <div className="stack">
      {result.question && <p className="muted">“{result.question}” · {t("asOfLc")} {day(result.as_of)}</p>}
      {only == null && <section className="card"><Working events={events} /></section>}
      {result.message && <p className="card">{result.message}</p>}
      {!result.decisions.length && !result.message && <section className="card">
        <h3>{t("nothingNew")}</h3>
        {result.ruled_out?.map((r) => <p key={r.reason}>{r.reason}.</p>)}
        <a className="textlink" {...linkProps("/approvals?tab=history")}>{t("seeVerified")}</a>
      </section>}
      {cards.map((d, i) => <DecisionCard key={i} d={d} runId={runId} />)}
      {result.unresolved.length > 0 && <section className="card"><StatusBadge s="unresolved" /><ul>{result.unresolved.map((u) => <li key={u}>{u}</li>)}</ul></section>}
      {only == null && result.actions.map((a) =>
        <a key={a.id} className="card link" {...linkProps("/approvals")}>
          <div className="row between wrap"><span className="h3">{t("proposed")}: {a.type.replace(/_/g, " ")} {a.target}</span><RiskBadge r={a.risk} /></div>
          <p className="sm muted">{a.reason}</p><span className="btn cta">{t("goApproval")}</span>
        </a>)}
    </div>
  );
}

export function Evidence({ runId }: { runId: string }) {
  const t = useT();
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
      <h3>{t("timeline")}</h3>
      <Timeline events={events} />
      <h3>{t("dataChecked")}</h3>
      {Object.entries(sql).map(([name, text]) => (
        <details key={name}><summary><span className="mono">{name}</span></summary>
          <button className="btn secondary" onClick={() => navigator.clipboard?.writeText(text)}><Icon name="content_copy" />{t("copySql")}</button>
          <pre className="sql">{text.replace(/\n\s+/g, "\n  ")}</pre>
        </details>
      ))}
      <h3>{t("numbers")}</h3>
      <div className="table-wrap"><table><thead><tr><th>{t("calculator")}</th><th>{t("inputs")}</th><th>{t("output")}</th></tr></thead>
        <tbody>{calcs.map((e, i) => <tr key={i}><td className="mono">{e.action.slice(5)}</td><td className="sm">{e.input_summary}</td><td className="sm">{e.output_summary}</td></tr>)}</tbody></table></div>
      <h3>{t("models")}</h3>
      <div className="row wrap">{models.length ? models.map((m) => <span key={m} className="chip soft">{m}</span>) : <span className="chip soft">{t("rulesModel")}</span>}</div>
    </div>
  );
}

function Plan({ outlet, o, reload }: Ctx) {
  const p = usePrefs(), t = useT();
  const [busy, setBusy] = useState(false);
  const run = o.run_log.find((r) => r.intents?.includes("energy_plan") && r.as_of === o.as_of);
  const r = useApi<RunView>(run ? `/runs/${run.run_id}` : null);
  const go = async () => { setBusy(true); try { await ask(outlet, o.as_of, p.lang, { question: t("planQ") }); reload(); } finally { setBusy(false); } };
  if (!run) return (
    <section className="card stack">
      <span className="label muted row"><Icon name="solar_power" className="sm" />{t("energyPlan")}</span>
      <h2>{t("planQ")}</h2>
      <p>{t("planIntro")}</p>
      <button className="btn cta" disabled={busy} onClick={go}>{busy ? t("preparing") : t("workOut")}</button>
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
        <h2>{d.verdict}</h2>
        {d.rm_per_month != null && <p className="display save num">{rm(d.rm_per_month)}<span className="unit"> {t("perMonth")}</span></p>}
        <p className="meta"><span className="row muted"><Icon name="solar_power" className="sm" />{t("energyPlan")}</span><Confidence c={d.confidence} /></p>
      </article>
      {options.length > 0 && <section className="card"><h3>{t("solarOptions")}</h3>
        {options.map((e) => <p key={e} className="row"><Icon name={e.startsWith(`${kwp} kWp`) ? "star" : "solar_power"} className={e.startsWith(`${kwp} kWp`) ? "save" : "muted"} /><span>{e}{e.startsWith(`${kwp} kWp`) ? ` · ${t("recommended")}` : ""}</span></p>)}
      </section>}
      <section className="card"><h3>{t("tariffAfter")}</h3>{other.map((e) => <p key={e}>{e}</p>)}</section>
      <section className="card"><h3>{t("ruledOut")}</h3>{d.ruled_out.map((x) => <p key={x} className="row"><Icon name="close" className="bad" />{x}</p>)}</section>
      <details className="card"><summary>{t("assumptions")}</summary><ul className="sm muted">{d.assumptions.map((a) => <li key={a}>{a}</li>)}</ul></details>
      {action && <a className="btn cta" {...linkProps("/approvals")}>{t("requestQuote")} ({action.target.split(" ").slice(1).join(" ")})</a>}
      <a className="textlink" {...linkProps(`/evidence/${run.run_id}`)}>{t("evidence")}</a>
    </div>
  );
}

function Approvals({ o, reload }: Ctx) {
  const machine = (id: string) => o.machines.find((m) => m.machine_id === id);
  const t = useT(), path = usePath(), toast = useToast();
  const tab = path.includes("tab=history") ? "history" : "pending";
  const [busy, setBusy] = useState("");
  const pending = o.advice.filter((a) => a.status === "awaiting_approval"), done = o.advice.filter((a) => a.status !== "awaiting_approval");
  const decide = async (a: Advice, decision: "approved" | "rejected") => {
    setBusy(a.action_id);
    try {
      await api("/approve", { action_id: a.action_id, decision });
      toast.show(decision === "approved" ? t(a.type === "schedule_service" ? "toastService" : "toastApproved") : t("toastRejected"));
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
          <div className="row between wrap"><h2>{actionTitle(a, t)}</h2><RiskBadge r={a.risk} /></div>
          {a.reason && <p>{a.reason}</p>}
          {a.predicted_rm_per_month != null && <p className="save num">{t("predictedSaving")} {rm(a.predicted_rm_per_month, 2)}{t("perMonth")}</p>}
          <p className="sm muted">{t("advisedAsOf")} {day(a.advised_as_of)} · <a {...linkProps(`/evidence/${a.run_id}`)}>{t("evidence").toLowerCase()}</a></p>
          <div className="row"><button className="btn cta grow" disabled={!!busy} onClick={() => decide(a, "approved")}>{t("approve")}</button>
            <button className="btn outlined grow" disabled={!!busy} onClick={() => decide(a, "rejected")}>{t("reject")}</button></div>
        </article>
      )) : <p className="muted">{t("nothingPending")}</p>)}
      {tab === "history" && done.map((a) => (
        <article key={a.action_id} className="card">
          <div className="row between wrap"><h3>{actionTitle(a, t)}</h3><StatusBadge s={a.verified?.verdict ?? a.status} /></div>
          {a.verified && a.predicted_rm_per_month != null && a.type !== "run_promo" && <div className="stack tight">
            <p className="sm">{t("predicted")} {rm(a.predicted_rm_per_month, 2)} {t("vsActual")} {rm(a.verified.realised_rm_per_month, 2)} (±{rm(a.verified.band_rm_per_month, 2)})</p>
            <div className="bar"><span style={{ width: "100%" }} /></div>
            <div className="bar save"><span style={{ width: `${Math.min(100, (a.verified.realised_rm_per_month / a.predicted_rm_per_month) * 100)}%` }} /></div>
            <p className="sm muted">{Math.round((a.verified.realised_rm_per_month / a.predicted_rm_per_month) * 100)}% {t("ofPrediction")}</p>
          </div>}
          {a.verified && a.type === "schedule_service" && machine(a.target) &&
            <WeeklyChart name={machine(a.target)!.name} weeks={machine(a.target)!.weekly} normal={normalOf(machine(a.target)!)} serviced={machine(a.target)!.serviced_on} />}
          {a.status === "approved" && !a.verified && <p className="sm muted">{t("askLater")}</p>}
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
      {!o.machines.some((m) => m.normal) && <p className="card sm">{t("normalHint")}</p>}
      <div className="list">{shown.map((m) => (
        <a key={m.machine_id} className="mrow" {...linkProps(`/machines/${m.machine_id}`)}>
          <Icon name={m.type === "dryer" ? "mode_heat" : "local_laundry_service"} className="muted" />
          <div className="grow stack tight">
            <div className="row between wrap"><span className="h3">{m.name}</span><Sparkline weeks={m.weekly} normal={normalOf(m)} /><StatusBadge s={m.health} /></div>
            <div className="row wrap sm">
              {m.type === "dryer" && <span className="muted">{t(m.heat_source === "gas" ? "gas" : "electric")}</span>}
              {m.normal && <span className="num">{m.heat_source === "gas" ? `${m.normal.minutes_per_cycle?.toFixed(0)} min` : `${m.normal.kwh_per_cycle?.toFixed(2)} kWh`} {t("perCycle")}</span>}
            </div>
            {m.cost_per_cycle_rm != null && <p className="sm">{t("costs")} {rm(m.cost_per_cycle_rm, 2)} · {t("youCharge")} {m.price_from_rm === m.price_to_rm ? rm(m.price_from_rm, 2) : `${rm(m.price_from_rm)}–${rm(m.price_to_rm)}`}</p>}
            {m.customer_reports.length > 0 && <p className="sm info"><Icon name="campaign" className="sm" /> {m.customer_reports.length} {t("custReports")}</p>}
          </div>
        </a>
      ))}</div>
    </div>
  );
}

function Machine({ o, id }: Ctx & { id: string }) {
  const m = o.machines.find((x) => x.machine_id === id);
  const t = useT();
  if (!m) return <Loading />;
  const advice = o.advice.filter((a) => a.target === id);
  return (
    <div className="stack">
      <section className="card">
        <div className="row between wrap"><h2>{t(m.type === "dryer" ? "dryer" : "washer")} {m.name}{m.type === "dryer" ? ` · ${t(m.heat_source === "gas" ? "gas" : "electric")}` : ""}</h2><StatusBadge s={m.health} /></div>
        {m.normal ? <p className="num">{t("normalLevel")} {m.heat_source === "gas" ? `${m.normal.minutes_per_cycle?.toFixed(0)} min` : `${m.normal.kwh_per_cycle?.toFixed(2)} ± ${m.normal.kwh_se?.toFixed(2)} kWh`} {t("perCycle")} <span className="sm muted">({t("learnedAsOf")} {day(m.normal.learned_as_of)})</span></p>
          : <p className="sm muted">{t(m.type === "washer" ? "washersTotal" : "noNormal")}</p>}
        {m.cost_per_cycle_rm != null && <p>{t("costs")} {rm(m.cost_per_cycle_rm, 2)} {t("perCycle")} · {t("youCharge").toLowerCase()} {rm(m.price_from_rm, 2)}{m.price_to_rm !== m.price_from_rm ? `–${rm(m.price_to_rm, 2)}` : ""}</p>}
        <p className="sm muted">{t("rightNow")}: {(m.status === "maintenance" ? t("maint") : m.status === "in_use" ? `${t("inUse")}, ${m.minutes_left} ${t("minLeft")}` : t("free")).toLowerCase()}</p>
      </section>
      {m.weekly.some((w) => w.value != null) && <section className="card"><h3>{t(m.heat_source === "gas" ? "minutesWeek" : "energyWeek")}</h3>
        <WeeklyChart name={m.name} weeks={m.weekly} normal={normalOf(m)} serviced={m.serviced_on} /></section>}
      {m.flag && <section className="card"><h3>{m.flag.verdict}</h3>{m.flag.evidence && <p>{m.flag.evidence}</p>}<a className="textlink" {...linkProps(`/evidence/${m.flag.run_id}`)}>{t("evidence")}</a></section>}
      <section className="card"><h3>{t("adviceHistory")}</h3>
        {advice.length ? advice.map((a) => <div key={a.action_id} className="row between wrap"><span>{actionTitle(a, t)} · {day(a.advised_as_of)}</span><StatusBadge s={a.verified?.verdict ?? a.status} /></div>) : <p className="sm muted">{t("nothingAdvised")}</p>}
      </section>
      <section className="card"><h3>{t("custReportsH")}</h3>
        {m.customer_reports.length ? m.customer_reports.map((r, i) => <p key={i} className="row"><Icon name="campaign" className="info" />{reasonLabel(r.reason, t)} · {day(r.as_of)}</p>) : <p className="sm muted">{t("none")}</p>}
        <p className="sm muted">{t("reportsHint")}</p>
      </section>
    </div>
  );
}

function Briefing({ runId }: { runId: string }) {
  const t = useT();
  const r = useApi<RunView>(`/runs/${runId}`);
  if (r.error) return <Failed error={r.error} />;
  if (!r.data) return <Loading />;
  const [b, ...rest] = r.data.result.decisions;
  return (
    <div className="stack">
      <section className="card briefing"><h2>{b.verdict}</h2><ul>{b.evidence.map((e) => <li key={e}>{e}</li>)}</ul></section>
      {rest.map((d, i) => <a key={i} className="card link" {...linkProps(`/decision/${runId}/${i + 1}`)}><DecisionCard d={d} compact /></a>)}
      <p className="sm muted">{t("generated")} <a {...linkProps(`/evidence/${runId}`)}>{t("evidence")}</a></p>
    </div>
  );
}

export function OwnerApp() {
  const path = usePath(), prefs = usePrefs(), t = useT();
  const outlets = useApi<{ outlet_id: string; name: string }[]>("/outlets");
  const outlet = prefs.outlet && prefs.session!.outlets.includes(prefs.outlet) ? prefs.outlet : prefs.session!.outlets[0];
  const owner = useApi<Owner>(`/outlets/${outlet}/owner?as_of=${prefs.asOf}`);
  const o = owner.data;
  const ctx = o && { o, reload: owner.reload, outlet };
  let p, screen, title: string | undefined, back: string | undefined;
  if (!ctx) screen = owner.error ? <Failed error={owner.error} /> : <Loading />;
  else if ((p = match("/result/:id", path))) { screen = <Result runId={p.id} />; title = t("answer"); back = "/ask"; }
  else if ((p = match("/decision/:id/:i", path))) { screen = <Result runId={p.id} only={Number(p.i)} />; title = t("decision"); back = "/"; }
  else if ((p = match("/evidence/:id", path))) { screen = <Evidence runId={p.id} />; title = t("evidence"); back = "/"; }
  else if ((p = match("/briefing/:id", path))) { screen = <Briefing runId={p.id} />; title = t("weeklyBriefing"); back = "/"; }
  else if ((p = match("/machines/:id", path))) { screen = <Machine {...ctx} id={p.id} />; title = t("machine"); back = "/machines"; }
  else if (match("/machines", path)) { screen = <Machines {...ctx} />; title = t("machines"); }
  else if (match("/approvals", path)) { screen = <Approvals {...ctx} />; title = t("approvals"); }
  else if (match("/ask", path)) { screen = <Ask {...ctx} />; title = t("ask"); }
  else if (match("/plan", path)) { screen = <Plan {...ctx} />; title = t("energyPlan"); back = "/"; }
  else screen = <Home {...ctx} />;
  return (
    <div className="app">
      <TopBar title={title} back={back}>{!title && <DemoControls outlets={outlets.data?.filter((x) => prefs.session!.outlets.includes(x.outlet_id)).map((x) => ({ id: x.outlet_id, name: x.name }))} />}</TopBar>
      {screen}
      <BottomNav pending={o?.advice.filter((a) => a.status === "awaiting_approval").length ?? 0} />
    </div>
  );
}
