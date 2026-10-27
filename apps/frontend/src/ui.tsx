// Shared components (design-system.md §6). Status and risk always carry an icon and text, never colour alone.
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { getLang, linkProps, navigate, setPref, usePrefs, usePath, SESSIONS, WINDOW, type Lang } from "./api.ts";

// UI chrome in English and Malay. Agent answers come back in the asked language from the backend.
const DICT = {
  home: ["Home", "Utama"], ask: ["Ask", "Tanya"], machines: ["Machines", "Mesin"], approvals: ["Approvals", "Kelulusan"],
  evidence: ["Show evidence", "Tunjuk bukti"], ruledOut: ["Ruled out", "Ditolak"], assumptions: ["Assumptions", "Andaian"],
  why: ["Why", "Sebab"], approve: ["Approve", "Lulus"], reject: ["Reject", "Tolak"], pending: ["Pending", "Menunggu"], history: ["History", "Sejarah"],
  free: ["Free", "Kosong"], inUse: ["In use", "Digunakan"], maint: ["Under maintenance", "Dalam penyelenggaraan"], minLeft: ["min left", "min lagi"],
  all: ["All", "Semua"], washers: ["Washers", "Pembasuh"], dryers: ["Dryers", "Pengering"], freeNow: ["Free now", "Kosong sekarang"], flagged: ["Flagged", "Dibenderakan"],
  updated: ["Updated", "Dikemas kini"], signOut: ["Sign out", "Log keluar"], asOf: ["As of", "Pada"], loading: ["Loading…", "Memuatkan…"],
  notWorking: ["Not working?", "Tidak berfungsi?"], open: ["Open", "Buka"], thisMonth: ["This month", "Bulan ini"],
  briefingNone: ["Your first briefing arrives next Monday at 08:00, or prepare one now.", "Taklimat pertama anda tiba Isnin depan jam 8:00 pagi, atau sediakan sekarang."],
  prepareNow: ["Prepare briefing now", "Sediakan taklimat sekarang"], preparing: ["Preparing…", "Sedang menyediakan…"],
  soFar: ["so far", "setakat ini"], peakShare: ["Peak share", "Bahagian puncak"], breakeven: ["ToU break-even", "Titik pulang modal ToU"],
  planTeaser: ["Solar, ToU or both? See your plan", "Solar, ToU atau kedua-duanya? Lihat pelan anda"],
  verifiedSavings: ["Verified savings", "Penjimatan disahkan"], savedFromAdvice: ["/month saved from past advice", "/bulan dijimatkan daripada nasihat lalu"],
  nothingPending: ["Nothing waiting for your approval.", "Tiada yang menunggu kelulusan anda."], predictedSaving: ["Predicted saving", "Anggaran penjimatan"],
  perMonth: ["/month", "/bulan"],
  toastService: ["Approved. Customers now see it as under maintenance; we'll check if it worked after 2 weeks.", "Diluluskan. Pelanggan kini melihatnya dalam penyelenggaraan; kami akan semak hasilnya selepas 2 minggu."],
  toastApproved: ["Approved. We'll check if it worked.", "Diluluskan. Kami akan semak sama ada ia berkesan."], toastRejected: ["Rejected. SmartFlux won't propose it again.", "Ditolak. SmartFlux tidak akan mencadangkannya lagi."],
  normalHint: ["Normal levels appear once SmartFlux has checked your machines. Ask “Which machine is wasting money?”.", "Tahap biasa dipaparkan selepas SmartFlux menyemak mesin anda. Tanya “Mesin mana yang membazir wang?”."],
  costs: ["Costs", "Kos"], youCharge: ["You charge", "Anda caj"], custReports: ["customer reports", "laporan pelanggan"], perCycle: ["per cycle", "setiap kitaran"],
  washersFree: ["washers free", "pembasuh kosong"], dryersFree: ["dryers free", "pengering kosong"], promo: ["Off-peak promo", "Promosi luar puncak"],
  washer: ["Washer", "Pembasuh"], dryer: ["Dryer", "Pengering"], whatsWrong: ["What's wrong with this machine?", "Apa masalah mesin ini?"],
  sendReport: ["Send report", "Hantar laporan"], thanks: ["Thanks, the owner will be told.", "Terima kasih, pemilik akan dimaklumkan."],
  wont_start: ["Won't start", "Tidak mahu mula"], not_heating: ["Not heating", "Tidak panas"], too_long: ["Takes too long", "Terlalu lama"], other: ["Other", "Lain-lain"],
  reportNote: ["Your report goes to the owner as a hint. It doesn't mark the machine broken on its own.", "Laporan anda dihantar kepada pemilik sebagai petunjuk. Ia tidak menandakan mesin rosak dengan sendirinya."],
  synthetic: ["Business data is synthetic (demo). Status comes from the payment system's cycle records.", "Data perniagaan adalah sintetik (demo). Status diambil daripada rekod kitaran sistem pembayaran."],
  solarOptions: ["Solar options", "Pilihan solar"], requestQuote: ["Request solar quote", "Minta sebut harga solar"],
  workOut: ["Work out my plan", "Kira pelan saya"], recommended: ["Recommended", "Disyorkan"], goApproval: ["Go to approval", "Pergi ke kelulusan"], proposed: ["Proposed", "Dicadangkan"],
  nothingNew: ["Nothing new to report", "Tiada perkara baharu"], recent: ["Recent questions", "Soalan terkini"],
  s1: ["Understanding your question", "Memahami soalan anda"], s2: ["Planning what to check", "Merancang apa yang perlu disemak"], s3: ["Checking your data", "Menyemak data anda"],
  s4: ["Double-checking the numbers", "Menyemak semula angka"], s5: ["Writing your answer", "Menulis jawapan anda"], sentBack: ["Skeptic asked for one more check", "Skeptic meminta satu semakan lagi"],
  weeklyBriefing: ["Weekly briefing", "Taklimat mingguan"], energyPlan: ["Energy plan", "Pelan tenaga"], to: ["to", "hingga"], billBar: ["Bill so far vs projected", "Bil setakat ini berbanding anggaran"],
  savingVerified: ["saving verified", "penjimatan disahkan"], custReported: ["Customers reported", "Pelanggan melaporkan"], askSF: ["Ask SmartFlux", "Tanya SmartFlux"],
  askPh: ["Ask about your bill, machines or solar…", "Tanya tentang bil, mesin atau solar…"], asOfLc: ["as of", "pada"],
  seeVerified: ["See verified results in Approvals → History", "Lihat keputusan disahkan di Kelulusan → Sejarah"],
  timeline: ["Agent timeline", "Garis masa ejen"], dataChecked: ["Data checked", "Data disemak"], copySql: ["Copy SQL", "Salin SQL"], numbers: ["Numbers", "Angka"],
  calculator: ["Calculator", "Kalkulator"], inputs: ["Inputs", "Input"], output: ["Output", "Output"], models: ["Models used", "Model digunakan"],
  rulesModel: ["Rules reasoner (sample mode, no LLM)", "Penaakul peraturan (mod contoh, tiada LLM)"], planQ: ["Solar, ToU or both?", "Solar, ToU atau kedua-duanya?"],
  planIntro: ["SmartFlux sizes solar on your real half-hourly load and the real sunshine at your outlet, then re-decides the tariff after solar.", "SmartFlux menentukan saiz solar daripada penggunaan sebenar setiap setengah jam dan cahaya matahari sebenar di premis anda, kemudian memilih semula tarif selepas solar."],
  predicted: ["Predicted", "Ramalan"], vsActual: ["vs actual", "berbanding sebenar"],
  ofPrediction: ["of prediction · compared against your other machines so weather doesn't skew it", "daripada ramalan · dibandingkan dengan mesin lain anda supaya cuaca tidak menjejaskannya"],
  askLater: ["Approved. Ask “Did it work?” after about 2 weeks.", "Diluluskan. Tanya “Adakah ia berkesan?” selepas kira-kira 2 minggu."],
  gas: ["Gas", "Gas"], electric: ["Electric", "Elektrik"], normalLevel: ["Normal level", "Tahap biasa"], learnedAsOf: ["learned as of", "dipelajari pada"],
  washersTotal: ["SmartFlux tracks dryers individually; washers are part of the outlet total.", "SmartFlux menjejak setiap pengering; pembasuh termasuk dalam jumlah premis."],
  noNormal: ["No normal level learned yet.", "Tahap biasa belum dipelajari."], rightNow: ["Right now (customer view)", "Sekarang (paparan pelanggan)"],
  minutesWeek: ["Minutes per cycle by week", "Minit setiap kitaran mengikut minggu"], energyWeek: ["Energy per cycle by week", "Tenaga setiap kitaran mengikut minggu"],
  adviceHistory: ["Advice history", "Sejarah nasihat"], nothingAdvised: ["Nothing advised for this machine.", "Tiada nasihat untuk mesin ini."], custReportsH: ["Customer reports", "Laporan pelanggan"], none: ["None.", "Tiada."],
  reportsHint: ["Reports are hints: SmartFlux weighs them against the meter data and never flags a machine on a report alone.", "Laporan ialah petunjuk: SmartFlux menimbangnya dengan data meter dan tidak membenderakan mesin hanya kerana laporan."],
  generated: ["Generated automatically by SmartFlux agents.", "Dijana secara automatik oleh ejen SmartFlux."], answer: ["Answer", "Jawapan"], decision: ["Decision", "Keputusan"], machine: ["Machine", "Mesin"],
  worst: ["per cycle at its worst (week", "setiap kitaran pada tahap terburuk (minggu"], inWeek: ["in week", "pada minggu"], normal: ["normal", "biasa"], serviced: ["serviced", "diservis"],
  byWeek: ["per cycle by week", "setiap kitaran mengikut minggu"], week: ["Week", "Minggu"], wasted: ["wasted", "dibazirkan"],
  tEnergy: ["Energy plan", "Pelan tenaga"], tTariff: ["Tariff", "Tarif"], tFault: ["Machine fault", "Kerosakan mesin"], tBill: ["Bill", "Bil"],
  tVerify: ["Did it work?", "Adakah ia berkesan?"], tPromo: ["Promo", "Promosi"], tEsg: ["Emissions", "Pelepasan"], tBriefing: ["Weekly briefing", "Taklimat mingguan"],
  noSavingsYet: ["No verified savings yet. Approved advice is checked about 2 weeks after it's done.", "Belum ada penjimatan disahkan. Nasihat yang diluluskan disemak kira-kira 2 minggu selepas dilaksanakan."],
  ready: ["Ready", "Sedia"],
  mLeft: ["m left", "m lagi"], from: ["From", "Dari"], outlets: ["Outlets", "Premis"], account: ["Account", "Akaun"], select: ["Select", "Pilih"],
  current: ["Current outlet", "Premis semasa"], happyHour: ["Off-peak happy hour", "Waktu gembira luar puncak"], remaining: ["remaining", "lagi"],
  cycleOf: ["of a", "daripada kitaran"], minCycle: ["min cycle", "min"], guest: ["Guest", "Tetamu"], hello: ["Hello", "Hai"],
  createAccount: ["Create an account", "Cipta akaun"], guestNote: ["You're browsing this outlet as a guest. An account lets you see every outlet.", "Anda melayari premis ini sebagai tetamu. Akaun membolehkan anda melihat semua premis."],
  language: ["Language", "Bahasa"], demoDate: ["Demo date", "Tarikh demo"], maintShort: ["Maintenance", "Penyelenggaraan"],
  machineDetail: ["Machine detail", "Butiran mesin"], perCycleRange: ["per cycle", "setiap kitaran"], reportIt: ["Report a problem", "Laporkan masalah"],
  hq: ["Franchise dashboard", "Papan pemuka francais"],
  chooseDate: ["Choose date", "Pilih tarikh"], prevMonth: ["Previous month", "Bulan sebelumnya"], nextMonth: ["Next month", "Bulan seterusnya"],
  sessions: ["Demo sessions", "Sesi demo"], outlet: ["Outlet", "Premis"],
  selectedOutlet: ["Selected outlet", "Premis dipilih"], machinesTracked: ["machines tracked", "mesin dijejak"],
  liveDiag: ["Live diagnostics", "Diagnostik semasa"], items: ["items", "perkara"], attention: ["Attention required", "Perlu perhatian"],
  verifiedChip: ["Verified", "Disahkan"], reportChip: ["Customer report", "Laporan pelanggan"], openPlan: ["Open plan", "Buka pelan"], saves: ["Saves", "Jimat"],
  soFarCap: ["So far", "Setakat ini"], projectedCap: ["Projected", "Anggaran"], approvedN: ["approved", "diluluskan"], advisedN: ["advised", "dinasihatkan"],
  accountMenu: ["Account menu", "Menu akaun"], allClear: ["All clear: no flags and nothing new to verify.", "Semua baik: tiada bendera dan tiada yang perlu disahkan."],
  estSaving: ["Estimated saving", "Anggaran penjimatan"], payback: ["Payback", "Pulang modal"], yrs: ["years", "tahun"], perMo: ["/mo", "/bln"],
  usedOnSite: ["Solar used on site", "Solar digunakan di premis"], exported: ["exported to the grid", "dieksport ke grid"],
  tariffCompare: ["Tariff without vs with solar", "Tarif tanpa vs dengan solar"], withoutSolar: ["Without solar", "Tanpa solar"], withSolar: ["With solar", "Dengan solar"],
  recentDecisions: ["Recent decisions", "Keputusan terkini"], seeAll: ["See all", "Lihat semua"], advisedOn: ["Advised", "Dinasihatkan"], verifiedOn: ["Verified", "Disahkan"],
  savedPm: ["saved", "dijimat"], viewEvidence: ["View evidence", "Lihat bukti"], solar: ["Solar", "Solar"],
  liveStatus: ["Live outlet status", "Status premis langsung"], ofN: ["of", "daripada"], availableLc: ["available", "tersedia"],
  washerFree: ["washer free", "pembasuh kosong"], dryerFree: ["dryer free", "pengering kosong"],
  perCycleShort: ["/ cycle", "/ kitaran"], unavailable: ["Unavailable", "Tidak tersedia"],
  inUseNow: ["In use now", "Digunakan kini"], health: ["Health", "Kesihatan"], needAttention: ["need attention", "perlu perhatian"], allOk: ["All OK", "Semua OK"],
  energyMargin: ["Energy margin", "Margin tenaga"], afterEnergy: ["lowest price minus energy cost, per cycle", "harga terendah tolak kos tenaga, setiap kitaran"], marginLc: ["margin", "margin"],
  vsNormal: ["vs normal", "berbanding biasa"], energyCycle: ["Energy per cycle", "Tenaga setiap kitaran"], minutesCycle: ["Minutes per cycle", "Minit setiap kitaran"],
  howHelp: ["How can I help you today?", "Apa yang boleh saya bantu hari ini?"], suggestedQ: ["Suggested questions", "Soalan cadangan"], send: ["Send", "Hantar"],
  askSub: ["Ask about your machines, bill, tariff or solar. Every answer comes with its evidence.", "Tanya tentang mesin, bil, tarif atau solar. Setiap jawapan disertakan bukti."],
  aService: ["Service", "Servis"], aPromo: ["Run promo", "Adakan promosi"], aTou: ["Switch to ToU", "Tukar ke ToU"], aQuote: ["Request solar quote", "Minta sebut harga solar"],
} satisfies Record<string, [string, string]>;
export type T = ReturnType<typeof useT>;
export function useT() {
  const { lang } = usePrefs();
  return (k: keyof typeof DICT) => DICT[k][lang === "ms" ? 1 : 0];
}

export const Icon = ({ name, label, className = "" }: { name: string; label?: string; className?: string }) =>
  <span className={`icon ${className}`} aria-hidden={label ? undefined : true} aria-label={label} role={label ? "img" : undefined}>{name}</span>;

export const rm = (n?: number | null, dp = 0) => (n == null ? "—" : `RM${n.toLocaleString("en-MY", { minimumFractionDigits: dp, maximumFractionDigits: dp })}`);
export const day = (d: string) => new Date(`${d.slice(0, 10)}T00:00:00Z`).toLocaleDateString(getLang() === "ms" ? "ms-MY" : "en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
export const short = (id: string) => id.split("-").pop()!;

// Badge text in [English, Malay]; components re-render on a language change through usePrefs.
const STATUS: Record<string, [string, string, [string, string]]> = {
  verified: ["check_circle", "ok", ["Verified", "Disahkan"]], awaiting_approval: ["hourglass_top", "warn", ["Awaiting approval", "Menunggu kelulusan"]], approved: ["thumb_up", "ok", ["Approved", "Diluluskan"]],
  rejected: ["cancel", "bad", ["Rejected", "Ditolak"]], withdrawn: ["undo", "muted", ["Withdrawn", "Ditarik balik"]], not_achieved: ["error", "bad", ["Not achieved", "Tidak tercapai"]], not_yet: ["hourglass_empty", "muted", ["Not yet", "Belum lagi"]],
  unresolved: ["help", "muted", ["Unresolved", "Belum selesai"]], flagged: ["warning", "warn", ["Flagged", "Dibenderakan"]], ok: ["check", "ok", ["OK", "OK"]],
  service_approved: ["build", "warn", ["Service approved", "Servis diluluskan"]], serviced_verified: ["verified", "ok", ["Serviced · verified", "Diservis · disahkan"]],
};
const ms = () => (getLang() === "ms" ? 1 : 0);
export const StatusBadge = ({ s }: { s: string }) => {
  usePrefs();
  const [icon, cls, text] = STATUS[s] ?? ["help", "muted", [s.replace(/_/g, " "), s.replace(/_/g, " ")]];
  return <span className={`badge ${cls}`}><Icon name={icon} />{text[ms()]}</span>;
};
const RISK: Record<string, [string, string, [string, string]]> = { read_only: ["visibility", "muted", ["Read-only", "Baca sahaja"]], advisory: ["lightbulb", "info", ["Advisory", "Nasihat"]],
  operational: ["build", "warn", ["Operational", "Operasi"]], financial: ["payments", "peak", ["Financial", "Kewangan"]] };
export const RiskBadge = ({ r }: { r: string }) => { usePrefs(); return <span className={`badge ${RISK[r]?.[1] ?? "muted"}`}><Icon name={RISK[r]?.[0] ?? "help"} />{RISK[r]?.[2][ms()] ?? r.replace("_", "-")}</span>; };
const CONF: Record<string, [string, string]> = { high: ["High confidence", "Keyakinan tinggi"], medium: ["Medium confidence", "Keyakinan sederhana"], low: ["Low confidence", "Keyakinan rendah"] };
export const Confidence = ({ c }: { c: string }) => { usePrefs(); return <span className={`badge ${c === "high" ? "ok" : c === "medium" ? "warn" : "muted"}`}><Icon name="radio_button_checked" />{CONF[c]?.[ms()] ?? c}</span>; };
export const ModeBadge = ({ mode }: { mode: string }) => <span className="chip soft"><Icon name={mode.startsWith("live") ? "sensors" : "science"} className="sm" />{mode.startsWith("live") ? "Live" : mode.startsWith("mixed") ? "Mixed" : "Sample"}</span>;

const TYPE: Record<string, [string, keyof typeof DICT]> = {
  energy_plan: ["solar_power", "tEnergy"], tariff: ["schedule", "tTariff"], machine_fault: ["build", "tFault"], bill_explanation: ["receipt_long", "tBill"],
  verification: ["verified", "tVerify"], load_shift: ["local_offer", "tPromo"], esg: ["eco", "tEsg"], briefing: ["calendar_month", "tBriefing"],
};
export type Decision = { type: string; verdict: string; rm_per_month?: number; confidence: string; evidence: string[]; ruled_out: string[]; assumptions: string[] };
export function DecisionCard({ d, runId, compact }: { d: Decision; runId?: string; compact?: boolean }) {
  const t = useT();
  const waste = d.type === "machine_fault";
  return (
    <article className="card">
      <h2>{d.verdict}</h2>
      {d.rm_per_month != null && <p className={`display num ${waste ? "waste" : "save"}`}>{rm(d.rm_per_month, d.rm_per_month < 100 ? 2 : 0)}<span className="unit"> {t("perMonth")}</span>{waste && <span className="sm muted"> {t("wasted")}</span>}</p>}
      <p className="meta"><span className="row muted"><Icon name={TYPE[d.type]?.[0] ?? "info"} className="sm" />{TYPE[d.type] ? t(TYPE[d.type][1]) : d.type.replace(/_/g, " ")}</span><Confidence c={d.confidence} /></p>
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
              {back ? <span className="badge warn"><Icon name="undo" />Sent back</span>
                : e.status === "fallback" ? <span className="badge warn"><Icon name="alt_route" />Fallback</span>
                : e.status === "error" ? <span className="badge bad"><Icon name="error" />Error</span>
                : <span className="badge ok"><Icon name="check" />OK</span>}
            </div>
            <p className="sm">{e.output_summary}</p>
            <p className="sm muted">{e.input_summary}{e.ms != null ? ` · ${e.ms} ms` : ""}</p>
            {e.model && <span className="chip soft">{e.model}</span>}
          </li>
        );
      })}
    </ol>
  );
}

// Weekly reading per machine (design-system §8): error bars, dashed normal line, service marker, text summary above
// (the accessible description) and the same numbers as a table for screen readers.
export type Week = { week: number; from: string; unit?: string; value: number | null; se?: number };
export function WeeklyChart({ name, weeks, normal, serviced = [] }: { name: string; weeks: Week[]; normal?: number | null; serviced?: string[] }) {
  const t = useT();
  const pts = weeks.filter((w) => w.value != null) as (Week & { value: number })[];
  if (pts.length < 2) return null;
  const unit = pts[0].unit === "min" ? "min" : "kWh";
  const hi = Math.max(...pts.map((w) => w.value + (w.se ?? 0)), normal ?? 0) * 1.1, lo = Math.min(...pts.map((w) => w.value - (w.se ?? 0)), normal ?? Infinity) * 0.9;
  const W = 320, H = 150, L = 36, B = 22, x = (i: number) => L + (i * (W - L - 12)) / (weeks.length - 1), y = (v: number) => 8 + ((hi - v) / (hi - lo)) * (H - B - 8);
  const xi = (w: Week) => x(weeks.indexOf(w));
  const svc = serviced.map((d) => ({ d, i: weeks.findIndex((w) => w.from <= d && d < addDaysIso(w.from, 7)) })).filter((s) => s.i >= 0);
  const peak = pts.reduce((a, b) => (b.value > a.value ? b : a)), last = pts.at(-1)!;
  const summary = `${name}: ${peak.value.toFixed(unit === "min" ? 0 : 2)} ${unit} ${t("worst")} ${peak.week}), ${last.value.toFixed(unit === "min" ? 0 : 2)} ${t("inWeek")} ${last.week}` +
    (normal ? `; ${t("normal")} ${normal.toFixed(unit === "min" ? 0 : 2)}` : "") + (svc.length ? `; ${t("serviced")} ${svc.map((s) => day(s.d)).join(", ")}.` : ".");
  return (
    <figure className="stack tight" style={{ margin: 0 }}>
      <figcaption className="sm">{summary}</figcaption>
      <svg className="chart" viewBox={`0 0 ${W} ${H}`} aria-hidden style={{ width: "100%" }}>
        <line x1={L} x2={W - 4} y1={H - B} y2={H - B} stroke="var(--chart-grid)" />
        <text x="2" y={y(hi / 1.1) + 4}>{(hi / 1.1).toFixed(unit === "min" ? 0 : 1)}</text>
        {normal != null && <><line x1={L} x2={W - 4} y1={y(normal)} y2={y(normal)} stroke="var(--chart-baseline)" strokeDasharray="4 4" /><text x={W - 60} y={y(normal) - 4}>{t("normal")}</text></>}
        {svc.map((s) => <g key={s.d}><line x1={x(s.i)} x2={x(s.i)} y1="4" y2={H - B} stroke="var(--tertiary)" strokeDasharray="2 3" /><text x={x(s.i) + 4} y="14" style={{ fill: "var(--tertiary)" }}>{t("serviced")} {day(s.d)}</text></g>)}
        <polyline fill="none" stroke="var(--primary-text)" strokeWidth="2" points={pts.map((w) => `${xi(w)},${y(w.value)}`).join(" ")} />
        {pts.map((w) => <g key={w.week}>
          {w.se ? <line x1={xi(w)} x2={xi(w)} y1={y(w.value + w.se)} y2={y(w.value - w.se)} stroke="var(--primary-text)" /> : null}
          <circle cx={xi(w)} cy={y(w.value)} r="4" fill={normal && w.value > normal * 1.2 ? "var(--danger)" : "var(--primary-text)"} />
          <text x={xi(w) - 8} y={H - 6}>W{w.week}</text>
        </g>)}
      </svg>
      <div className="sr-only"><table><caption>{name} {unit} {t("byWeek")}</caption><tbody>{pts.map((w) => <tr key={w.week}><th>{t("week")} {w.week}</th><td>{w.value.toFixed(2)} ± {(w.se ?? 0).toFixed(2)}</td></tr>)}</tbody></table></div>
    </figure>
  );
}
const addDaysIso = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

export function Sparkline({ weeks, normal }: { weeks: Week[]; normal?: number | null }) {
  const v = weeks.map((w) => w.value).filter((x): x is number => x != null);
  if (v.length < 2) return null;
  const hi = Math.max(...v, normal ?? 0), lo = Math.min(...v, normal ?? Infinity), y = (n: number) => 2 + ((hi - n) / (hi - lo || 1)) * 20;
  return (
    <svg width="72" height="24" viewBox="0 0 72 24" aria-hidden style={{ flexShrink: 0 }}>
      {normal != null && <line x1="0" x2="72" y1={y(normal)} y2={y(normal)} stroke="var(--chart-baseline)" strokeDasharray="2 3" />}
      <polyline fill="none" stroke="var(--primary-text)" strokeWidth="2" points={v.map((n, i) => `${(i * 70) / (v.length - 1) + 1},${y(n)}`).join(" ")} />
    </svg>
  );
}

export const Loading = () => { const t = useT(); return <p className="muted" role="status">{t("loading")}</p>; };
export const Failed = ({ error }: { error: string }) => <p className="card bad" role="alert"><Icon name="error" /> {error}</p>;

export function useToast() {
  const [msg, setMsg] = useState<string | null>(null);
  const show = (m: string) => { setMsg(m); setTimeout(() => setMsg(null), 3500); };
  return { show, node: msg && <div className="toast" role="status">{msg}</div> };
}

// A popover that closes on Escape or a click outside, and opens toward whichever side has room.
function usePopover<T extends HTMLElement>() {
  const [open, setOpen] = useState(false), [end, setEnd] = useState(false);
  const ref = useRef<HTMLDivElement>(null), trigger = useRef<T>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [open]);
  const toggle = () => { const r = ref.current?.getBoundingClientRect(); setEnd(!!r && r.left + 300 > innerWidth); setOpen(!open); };
  const close = () => { setOpen(false); trigger.current?.focus(); };
  return { open, end, ref, trigger, toggle, close };
}

// Dropdown (ARIA listbox): arrows, Home/End and Enter move and choose; Escape closes; typing a letter jumps.
export function Dropdown({ label, value, options, onChange }: { label: string; value: string; options: { value: string; label: string }[]; onChange: (v: string) => void }) {
  const p = usePopover<HTMLButtonElement>();
  const [active, setActive] = useState(0);
  const list = useRef<HTMLUListElement>(null), id = `dd-${label.replace(/\W/g, "")}`;
  const current = options.find((o) => o.value === value) ?? options[0];
  useEffect(() => { if (p.open) { setActive(Math.max(0, options.indexOf(current))); list.current?.focus(); } }, [p.open]);
  const choose = (i: number) => { onChange(options[i].value); p.close(); };
  const key = (e: KeyboardEvent) => {
    const n = options.length, go = (i: number) => { e.preventDefault(); setActive((i + n) % n); };
    if (e.key === "ArrowDown") go(active + 1); else if (e.key === "ArrowUp") go(active - 1);
    else if (e.key === "Home") go(0); else if (e.key === "End") go(n - 1);
    else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); choose(active); }
    else if (e.key === "Escape" || e.key === "Tab") p.close();
    else if (e.key.length === 1) { const i = options.findIndex((o) => o.label.toLowerCase().startsWith(e.key.toLowerCase())); if (i >= 0) setActive(i); }
  };
  return (
    <div className="picker grow" ref={p.ref}>
      <button ref={p.trigger} type="button" className="select picker-btn" aria-haspopup="listbox" aria-expanded={p.open} aria-label={`${label}: ${current?.label}`} onClick={p.toggle}
        onKeyDown={(e) => { if (e.key === "ArrowDown" && !p.open) { e.preventDefault(); p.toggle(); } }}>
        <span className="grow ellipsis">{current?.label}</span><Icon name="expand_more" className={p.open ? "flip" : ""} />
      </button>
      {p.open && <ul ref={list} className={`pop menu ${p.end ? "end" : ""}`} role="listbox" tabIndex={-1} aria-label={label} aria-activedescendant={`${id}-${active}`} onKeyDown={key}>
        {options.map((o, i) => <li key={o.value} id={`${id}-${i}`} role="option" aria-selected={o.value === value} className={i === active ? "active" : ""}
          onPointerEnter={() => setActive(i)} onClick={() => choose(i)}><span className="grow">{o.label}</span>{o.value === value && <Icon name="check" className="sm" />}</li>)}
      </ul>}
    </div>
  );
}

// Date picker for the demo's "as of" date: a month grid limited to the data window, the three demo sessions one tap
// away, and the grid keyboard pattern (arrows by day and week, Page Up/Down by month, Enter to choose).
const iso = (d: Date) => d.toISOString().slice(0, 10);
const shift = (d: string, days: number) => iso(new Date(Date.parse(`${d}T00:00:00Z`) + days * 86400000));
const clamp = (d: string) => (d < WINDOW.start ? WINDOW.start : d > WINDOW.end ? WINDOW.end : d);
export function DatePicker({ value, onChange }: { value: string; onChange: (d: string) => void }) {
  const t = useT(), { lang } = usePrefs(), p = usePopover<HTMLButtonElement>();
  const [focus, setFocus] = useState(value);
  const grid = useRef<HTMLDivElement>(null);
  const loc = lang === "ms" ? "ms-MY" : "en-GB";
  const fmt = (d: string, o: Intl.DateTimeFormatOptions) => new Date(`${d}T00:00:00Z`).toLocaleDateString(loc, { timeZone: "UTC", ...o });
  useEffect(() => { if (p.open) setFocus(value); }, [p.open]);
  useEffect(() => { if (p.open) grid.current?.querySelector<HTMLButtonElement>(`[data-d="${focus}"]`)?.focus(); }, [focus, p.open]);
  const choose = (d: string) => { onChange(d); p.close(); };
  // Monday-first grid for the focused month.
  const first = `${focus.slice(0, 7)}-01`, lead = (new Date(`${first}T00:00:00Z`).getUTCDay() + 6) % 7;
  const days = Array.from({ length: 42 }, (_, i) => shift(first, i - lead));
  const month = (n: number) => { const d = new Date(`${focus}T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() + n); return clamp(iso(d)); };
  const key = (e: KeyboardEvent) => {
    const step: Record<string, () => string> = { ArrowLeft: () => shift(focus, -1), ArrowRight: () => shift(focus, 1), ArrowUp: () => shift(focus, -7), ArrowDown: () => shift(focus, 7),
      PageUp: () => month(-1), PageDown: () => month(1), Home: () => WINDOW.start, End: () => WINDOW.end };
    if (step[e.key]) { e.preventDefault(); setFocus(clamp(step[e.key]())); }
    else if (e.key === "Escape") p.close();
  };
  return (
    <div className="picker" ref={p.ref}>
      <button ref={p.trigger} type="button" className="select picker-btn" aria-haspopup="dialog" aria-expanded={p.open} aria-label={`${t("asOf")} ${fmt(value, { day: "numeric", month: "long", year: "numeric" })}. ${t("chooseDate")}`} onClick={p.toggle}>
        <Icon name="calendar_today" className="sm muted" /><span className="num">{fmt(value, { day: "numeric", month: "short", year: "numeric" })}</span>
      </button>
      {p.open && <div className={`pop cal ${p.end ? "end" : ""}`} role="dialog" aria-label={t("chooseDate")} onKeyDown={key}>
        <div className="row between">
          <button type="button" className="icon-btn" aria-label={t("prevMonth")} disabled={focus.slice(0, 7) <= WINDOW.start.slice(0, 7)} onClick={() => setFocus(month(-1))}><Icon name="chevron_left" /></button>
          <span className="h3" aria-live="polite">{fmt(focus, { month: "long", year: "numeric" })}</span>
          <button type="button" className="icon-btn" aria-label={t("nextMonth")} disabled={focus.slice(0, 7) >= WINDOW.end.slice(0, 7)} onClick={() => setFocus(month(1))}><Icon name="chevron_right" /></button>
        </div>
        <div className="cal-grid" role="grid" ref={grid}>
          {days.slice(0, 7).map((d) => <span key={d} className="dow" aria-hidden>{fmt(d, { weekday: "narrow" })}</span>)}
          {days.map((d) => {
            const out = d < WINDOW.start || d > WINDOW.end, other = d.slice(0, 7) !== focus.slice(0, 7);
            return <button key={d} type="button" data-d={d} tabIndex={d === focus ? 0 : -1} disabled={out} aria-pressed={d === value} aria-label={fmt(d, { weekday: "long", day: "numeric", month: "long" })}
              className={`day ${other ? "other" : ""} ${SESSIONS.includes(d) ? "session" : ""}`} onClick={() => choose(d)}>{Number(d.slice(8))}</button>;
          })}
        </div>
        <div className="stack tight"><span className="label muted">{t("sessions")}</span>
          <div className="row wrap">{SESSIONS.map((d) => <button key={d} type="button" className="chip-btn" aria-pressed={d === value} onClick={() => choose(d)}>{fmt(d, { day: "numeric", month: "short" })}</button>)}</div>
        </div>
      </div>}
    </div>
  );
}

// Demo controls: the "as of" date (sessions 13 Sep → 4 Oct → 18 Oct), language, sign out.
export function DemoControls({ outlets }: { outlets?: { id: string; name: string }[] }) {
  const p = usePrefs(), t = useT();
  return (
    <>
      {outlets && outlets.length > 1 && <Dropdown label={t("outlet")} value={p.outlet ?? outlets[0].id} onChange={(v) => setPref("outlet", v)}
        options={outlets.map((o) => ({ value: o.id, label: `${o.id} ${o.name}` }))} />}
      <DatePicker value={p.asOf} onChange={(d) => setPref("asOf", d)} />
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
      {/* Back returns to the page you came from; opened from a link outside the app, it goes to `back` instead. */}
      {back ? <a className="back" aria-label="Back" {...linkProps(back)}
        onClick={(e) => { if (history.state?.inApp) { e.preventDefault(); history.back(); } else linkProps(back).onClick(e); }}><Icon name="arrow_back" /></a> : null}
      {title ? <h1 className="grow row" style={{ fontSize: 22, lineHeight: "28px" }}>{!back && <span className="app-tile"><Icon name="local_laundry_service" /></span>}{title}</h1>
        : <h1 className="brand-h"><a className="brand" {...linkProps("/outlet")}><span className="app-tile"><Icon name="local_laundry_service" /></span>SmartFlux</a></h1>}
      {children && <div className="controls">{children}</div>}
    </header>
  );
}

export function BottomNav({ pending }: { pending: number }) {
  const path = usePath().split("?")[0], t = useT();
  const items: [string, string, string, number?][] = [["/outlet", "home", t("home")], ["/ask", "auto_awesome", t("ask")], ["/machines", "local_laundry_service", t("machines")], ["/approvals", "task_alt", t("approvals"), pending]];
  return (
    <nav className="nav" aria-label="Main">
      {items.map(([href, icon, label, n]) => (
        <a key={href} {...linkProps(href)} aria-current={(href === "/outlet" ? path === "/outlet" : path.startsWith(href)) ? "page" : undefined}>
          <Icon name={icon} />{label}{n ? <span className="count" aria-label={`${n} pending`}>{n}</span> : null}
        </a>
      ))}
    </nav>
  );
}
