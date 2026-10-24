// Shared components (design-system.md §6). Status and risk always carry an icon and text, never colour alone.
import { useState, type ReactNode } from "react";
import { linkProps, navigate, setPref, usePrefs, usePath, WINDOW, type Lang } from "./api.ts";

// UI chrome in English and Malay. Agent answers come back in the asked language from the backend.
const DICT = {
  home: ["Home", "Utama"], ask: ["Ask", "Tanya"], machines: ["Machines", "Mesin"], approvals: ["Approvals", "Kelulusan"],
  evidence: ["Show evidence", "Tunjuk bukti"], ruledOut: ["Ruled out", "Ditolak"], assumptions: ["Assumptions", "Andaian"],
  why: ["Why", "Sebab"], approve: ["Approve", "Lulus"], reject: ["Reject", "Tolak"], pending: ["Pending", "Menunggu"], history: ["History", "Sejarah"],
  free: ["FREE", "KOSONG"], inUse: ["IN USE", "DIGUNAKAN"], maint: ["UNDER MAINTENANCE", "DALAM PENYELENGGARAAN"], minLeft: ["min left", "min lagi"],
  all: ["All", "Semua"], washers: ["Washers", "Pembasuh"], dryers: ["Dryers", "Pengering"], freeNow: ["Free now", "Kosong sekarang"], flagged: ["Flagged", "Dibenderakan"],
  updated: ["Updated", "Dikemas kini"], signOut: ["Sign out", "Log keluar"], asOf: ["As of", "Pada"], loading: ["Loading…", "Memuatkan…"],
  notWorking: ["Not working?", "Tidak berfungsi?"], open: ["Open", "Buka"], thisMonth: ["This month", "Bulan ini"],
} satisfies Record<string, [string, string]>;
export function useT() {
  const { lang } = usePrefs();
  return (k: keyof typeof DICT) => DICT[k][lang === "ms" ? 1 : 0];
}

export const Icon = ({ name, label, className = "" }: { name: string; label?: string; className?: string }) =>
  <span className={`icon ${className}`} aria-hidden={label ? undefined : true} aria-label={label} role={label ? "img" : undefined}>{name}</span>;

export const rm = (n?: number | null, dp = 0) => (n == null ? "—" : `RM${n.toLocaleString("en-MY", { minimumFractionDigits: dp, maximumFractionDigits: dp })}`);
export const day = (d: string) => new Date(`${d.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
export const short = (id: string) => id.split("-").pop()!;

const STATUS: Record<string, [string, string, string]> = {
  verified: ["check_circle", "ok", "Verified"], awaiting_approval: ["hourglass_top", "warn", "Awaiting approval"], approved: ["thumb_up", "ok", "Approved"],
  rejected: ["cancel", "bad", "Rejected"], not_achieved: ["error", "bad", "Not achieved"], not_yet: ["hourglass_empty", "muted", "Not yet"],
  unresolved: ["help", "muted", "Unresolved"], flagged: ["warning", "warn", "Flagged"], ok: ["check", "ok", "OK"],
  service_approved: ["build", "warn", "Service approved"], serviced_verified: ["verified", "ok", "Serviced · verified"],
};
export const StatusBadge = ({ s }: { s: string }) => {
  const [icon, cls, text] = STATUS[s] ?? ["help", "muted", s.replace(/_/g, " ")];
  return <span className={`badge ${cls}`}><Icon name={icon} />{text.toUpperCase()}</span>;
};
const RISK: Record<string, [string, string]> = { read_only: ["visibility", "muted"], advisory: ["lightbulb", "info"], operational: ["build", "warn"], financial: ["payments", "peak"] };
export const RiskBadge = ({ r }: { r: string }) => <span className={`badge ${RISK[r]?.[1] ?? "muted"}`}><Icon name={RISK[r]?.[0] ?? "help"} />{r.replace("_", "-").toUpperCase()}</span>;
export const Confidence = ({ c }: { c: string }) => <span className={`badge ${c === "high" ? "ok" : c === "medium" ? "warn" : "muted"}`}><Icon name="radio_button_checked" />{c.toUpperCase()} CONFIDENCE</span>;
export const ModeBadge = ({ mode }: { mode: string }) => <span className="chip soft"><Icon name={mode.startsWith("live") ? "sensors" : "science"} className="sm" />{mode.startsWith("live") ? "LIVE" : mode.startsWith("mixed") ? "MIXED" : "SAMPLE"}</span>;

const TYPE: Record<string, [string, string]> = {
  energy_plan: ["solar_power", "ENERGY PLAN"], tariff: ["schedule", "TARIFF"], machine_fault: ["build", "MACHINE FAULT"], bill_explanation: ["receipt_long", "BILL"],
  verification: ["verified", "DID IT WORK?"], load_shift: ["local_offer", "PROMO"], esg: ["eco", "EMISSIONS"], briefing: ["calendar_month", "WEEKLY BRIEFING"],
};
export type Decision = { type: string; verdict: string; rm_per_month?: number; confidence: string; evidence: string[]; ruled_out: string[]; assumptions: string[] };
export function DecisionCard({ d, runId, compact }: { d: Decision; runId?: string; compact?: boolean }) {
  const t = useT();
  const waste = d.type === "machine_fault";
  return (
    <article className="card">
      <span className="chip"><Icon name={TYPE[d.type]?.[0] ?? "info"} className="sm" />{TYPE[d.type]?.[1] ?? d.type.toUpperCase()}</span>
      <h2>{d.verdict}</h2>
      {d.rm_per_month != null && <p className={`display num ${waste ? "waste" : "save"}`}>{rm(d.rm_per_month, d.rm_per_month < 100 ? 2 : 0)}<span className="h3"> /month</span>{waste && <span className="sm muted"> wasted</span>}</p>}
      <Confidence c={d.confidence} />
      {!compact && d.evidence.length > 0 && <div className="stack tight"><h3>{t("why")}</h3><ul>{d.evidence.map((e) => <li key={e}>{e}</li>)}</ul></div>}
      {!compact && d.ruled_out.length > 0 && <div className="stack tight"><h3>{t("ruledOut")}</h3>{d.ruled_out.map((r) => <p key={r} className="row"><Icon name="close" className="bad" />{r}</p>)}</div>}
      {!compact && d.assumptions.length > 0 && <details><summary>{t("assumptions")}</summary><ul className="sm muted">{d.assumptions.map((a) => <li key={a}>{a}</li>)}</ul></details>}
      {runId && <a className="textlink" {...linkProps(`/evidence/${runId}`)}>{t("evidence")}</a>}
    </article>
  );
}

// Agent timeline from GET /runs/:id; a Skeptic send-back is a distinct row with an icon and "Sent back".
export type LogEvent = { ts: string; agent_name: string; action: string; target_agent?: string; status: string; input_summary: string; output_summary: string; model?: string; ms?: number };
export function Timeline({ events }: { events: LogEvent[] }) {
  return (
    <ol className="timeline">
      {events.map((e, i) => {
        const back = e.status === "needs_revision";
        return (
          <li key={i} className={back ? "sent-back" : ""}>
            <div className="row between wrap">
              <span className="label">{e.agent_name}{e.target_agent && e.target_agent !== e.agent_name ? ` → ${e.target_agent}` : ""} · {e.action}</span>
              {back ? <span className="badge warn"><Icon name="undo" />SENT BACK</span>
                : e.status === "fallback" ? <span className="badge warn"><Icon name="alt_route" />FALLBACK</span>
                : e.status === "error" ? <span className="badge bad"><Icon name="error" />ERROR</span>
                : <span className="badge ok"><Icon name="check" />OK</span>}
            </div>
            <p className="sm">{e.output_summary}</p>
            <p className="mono muted">{e.input_summary}{e.ms != null ? ` · ${e.ms} ms` : ""}</p>
            {e.model && <span className="chip soft">{e.model}</span>}
          </li>
        );
      })}
    </ol>
  );
}

export const Loading = () => { const t = useT(); return <p className="muted" role="status">{t("loading")}</p>; };
export const Failed = ({ error }: { error: string }) => <p className="card bad" role="alert"><Icon name="error" /> {error}</p>;

export function useToast() {
  const [msg, setMsg] = useState<string | null>(null);
  const show = (m: string) => { setMsg(m); setTimeout(() => setMsg(null), 3500); };
  return { show, node: msg && <div className="toast" role="status">{msg}</div> };
}

// Demo controls: the "as of" date (sessions 13 Sep → 4 Oct → 18 Oct), language, sign out.
export function DemoControls({ outlets }: { outlets?: { id: string; name: string }[] }) {
  const p = usePrefs(), t = useT();
  return (
    <>
      {outlets && outlets.length > 1 && (
        <label className="row"><span className="sr-only">Outlet</span>
          <select className="select" value={p.outlet ?? outlets[0].id} onChange={(e) => setPref("outlet", e.target.value)}>
            {outlets.map((o) => <option key={o.id} value={o.id}>{o.id} {o.name}</option>)}
          </select>
        </label>
      )}
      <label className="row"><span className="sr-only">{t("asOf")}</span>
        <input className="select" type="date" min={WINDOW.start} max={WINDOW.end} value={p.asOf} onChange={(e) => e.target.value && setPref("asOf", e.target.value)} />
      </label>
      <div className="seg" role="group" aria-label="Language">
        {(["en", "ms"] as Lang[]).map((l) => <button key={l} aria-pressed={p.lang === l} onClick={() => setPref("lang", l)}>{l === "en" ? "EN" : "BM"}</button>)}
      </div>
      <button className="back" aria-label={t("signOut")} title={t("signOut")} onClick={() => { setPref("session", null); navigate("/login"); }}><Icon name="logout" /></button>
    </>
  );
}

export function TopBar({ title, back, children }: { title?: string; back?: string; children?: ReactNode }) {
  return (
    <header className="topbar">
      {back ? <a className="back" aria-label="Back" {...linkProps(back)}><Icon name="arrow_back" /></a> : null}
      {title ? <h1 className="grow" style={{ fontSize: 22, lineHeight: "28px" }}>{title}</h1>
        : <a className="brand" {...linkProps("/")}><Icon name="bolt" className="save" />SmartFlux</a>}
      {children}
    </header>
  );
}

export function BottomNav({ pending }: { pending: number }) {
  const path = usePath().split("?")[0], t = useT();
  const items: [string, string, string, number?][] = [["/", "home", t("home")], ["/ask", "auto_awesome", t("ask")], ["/machines", "local_laundry_service", t("machines")], ["/approvals", "task_alt", t("approvals"), pending]];
  return (
    <nav className="nav" aria-label="Main">
      {items.map(([href, icon, label, n]) => (
        <a key={href} {...linkProps(href)} aria-current={(href === "/" ? path === "/" : path.startsWith(href)) ? "page" : undefined}>
          <Icon name={icon} />{label}{n ? <span className="count" aria-label={`${n} pending`}>{n}</span> : null}
        </a>
      ))}
    </nav>
  );
}
