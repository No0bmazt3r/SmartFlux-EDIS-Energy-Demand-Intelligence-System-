// Customer app (features.md §A.4): outlets, live machine availability, owner-approved happy hours, and reporting a
// broken machine. Everything shown comes from the payment system's cycle records; no energy data reaches customers.
import { useState } from "react";
import { api, linkProps, match, navigate, setPref, usePath, usePrefs, useApi } from "./api.ts";
import { DatePicker, Failed, Icon, Loading, ModeBadge, TopBar, day, useT, useToast } from "./ui.tsx";

type Machine = { machine_id: string; name: string; type: string; heat_source: string; price_from_rm: number | null; price_to_rm: number | null;
  status: "free" | "in_use" | "maintenance"; minutes_left: number | null; cycle_minutes: number | null };
type View = { outlet_id: string; at: string; mode: string; machines: Machine[]; promos: { slot: string }[] };
type Outlet = { outlet_id: string; name: string; state?: string };

const rmx = (n: number | null) => (n == null ? "" : `RM ${n.toFixed(2)}`);
const DAYS_MS: Record<string, string> = { Sunday: "Ahad", Monday: "Isnin", Tuesday: "Selasa", Wednesday: "Rabu", Thursday: "Khamis", Friday: "Jumaat", Saturday: "Sabtu" };
const slot = (s: string, lang: string) => lang === "ms" ? s.replace(/^(\w+) /, (_, d) => `${DAYS_MS[d] ?? d} dari `) : s.replace(/^(\w+) /, "$1s from ");
const typeIcon = (m: Machine) => (m.type === "dryer" ? "mode_heat" : "local_laundry_service");

function Pill({ m }: { m: Machine }) {
  const t = useT();
  if (m.status === "maintenance") return <span className="pill"><Icon name="build" className="xs" />{t("maintShort")}</span>;
  if (m.status === "in_use") return <span className="pill busy"><Icon name="schedule" className="xs" />{m.minutes_left}{t("mLeft")}</span>;
  return <span className="pill ok"><Icon name="check_circle" className="xs" />{t("ready")}</span>;
}

// The outlet the customer picked (a guest has exactly one), its name, and its live machines.
function useOutlet() {
  const { session, asOf, outlet: picked } = usePrefs();
  const outlet = picked && session!.outlets.includes(picked) ? picked : session!.outlets[0];
  const names = useApi<Outlet[]>("/outlets");
  const view = useApi<View>(`/outlets/${outlet}/availability?as_of=${asOf}`);
  return { outlet, info: names.data?.find((o) => o.outlet_id === outlet), view, asOf };
}

function Header({ title, back }: { title: string; back?: string }) {
  const { session } = usePrefs();
  return <TopBar title={title} back={back}><a className="avatar" aria-label="Account" {...linkProps("/customer/account")}>{session?.name?.[0] ?? "G"}</a></TopBar>;
}

function Home() {
  const t = useT(), { lang, session } = usePrefs();
  const { outlet, info, view } = useOutlet();
  const [filter, setFilter] = useState<"all" | "washer" | "dryer" | "free">("all");
  const v = view.data;
  const shown = v?.machines.filter((m) => filter === "all" || (filter === "free" ? m.status === "free" : m.type === filter)) ?? [];
  const count = (type: string) => v?.machines.filter((m) => m.type === type).length ?? 0;
  return (
    <div className="stack">
      <div className="hello">
        {session?.name && session.name !== "Guest" && <p className="muted">{t("hello")}, {session.name.split(" ")[0]}</p>}
        <h2 className="title-lg">SmartFlux {info?.name ?? outlet}</h2>
      </div>
      <a className="card glow outlet-card" {...linkProps("/customer/outlets")}>
        <span className="row"><span className="dot ok" aria-hidden />{outlet}{info?.state ? ` · ${info.state}` : ""}</span>
        {v && <span className="sm muted row wrap">{t("updated")} {day(v.at)}, {v.at.slice(11, 16)} <ModeBadge mode={v.mode} /></span>}
        <Icon name="chevron_right" className="muted corner" />
      </a>
      {/* Only happy hours the owner approved reach this list (GET /availability), so nothing here is a guess. */}
      {v?.promos.map((p) => (
        <section key={p.slot} className="card promo-card">
          <span className="app-tile warm"><Icon name="bolt" /></span>
          <div><span className="eyebrow">{t("happyHour")}</span><p className="h3">{slot(p.slot, lang)}</p></div>
        </section>
      ))}
      {view.loading && !v && <Loading />}
      {view.error && <Failed error={view.error} />}
      {v && <>
        <LiveStatus machines={v.machines} />
        <div className="filter" role="group" aria-label="Filter">
          {([["all", `${t("all")} (${v.machines.length})`], ["washer", `${t("washers")} (${count("washer")})`], ["dryer", `${t("dryers")} (${count("dryer")})`], ["free", t("freeNow")]] as const).map(([k, label]) =>
            <button key={k} aria-pressed={filter === k} onClick={() => setFilter(k)}>{label}</button>)}
        </div>
        <div className="tiles">
          {shown.map((m) => (
            <a key={m.machine_id} className={`tile ${m.status}`} {...linkProps(`/customer/machine/${m.machine_id}`)}>
              <span className="row between"><span className="mini-tile"><Icon name={m.status === "maintenance" ? "build" : typeIcon(m)} /></span><Pill m={m} /></span>
              <span className="stack tight name">
                <b>{m.name} {t(m.type === "dryer" ? "dryer" : "washer")}</b>
                {(m.status === "maintenance" || m.type === "dryer") && <span className="sm muted">{m.status === "maintenance" ? t("maintShort") : t(m.heat_source === "gas" ? "gas" : "electric")}</span>}
              </span>
              <span className="row between end-row">
                {m.price_from_rm != null && <span className="price">{m.price_to_rm != null && m.price_to_rm !== m.price_from_rm && <span className="xs-label block">{t("from")}</span>}{rmx(m.price_from_rm)}</span>}
                <span className="xs muted">{m.status === "maintenance" ? t("unavailable") : m.status === "in_use" ? t("inUse") : t("perCycleShort")}</span>
              </span>
            </a>
          ))}
        </div>
        <p className="sm muted">{t("synthetic")}</p>
      </>}
    </div>
  );
}

// Figma "Live outlet status": free washers and dryers right now, and a bar of the whole outlet where the orange and
// purple parts are the free washers and dryers (busy and under-maintenance machines are the empty track).
function LiveStatus({ machines }: { machines: Machine[] }) {
  const t = useT();
  const free = (type: string) => machines.filter((m) => m.type === type && m.status === "free").length;
  const w = free("washer"), d = free("dryer"), total = machines.length;
  const pct = (n: number) => `${total ? (n / total) * 100 : 0}%`;
  return (
    <section className="card live-status" aria-label={`${w} ${t(w === 1 ? "washerFree" : "washersFree")}, ${d} ${t(d === 1 ? "dryerFree" : "dryersFree")}`}>
      <div className="row between wrap"><span className="eyebrow row"><span className="dot ok" aria-hidden />{t("liveStatus")}</span>
        <span className="sm warm num">{w + d} {t("ofN")} {total} {t("availableLc")}</span></div>
      <p className="live-h"><span className="warm"><b className="num">{w}</b> {t(w === 1 ? "washerFree" : "washersFree")}</span>
<span className="info"><b className="num">{d}</b> {t(d === 1 ? "dryerFree" : "dryersFree")}</span></p>
      <div className="split" aria-hidden><span className="w" style={{ width: pct(w) }} /><span className="d" style={{ width: pct(d) }} /></div>
    </section>
  );
}

// A ring that empties as the cycle runs: the share of the paid cycle still to go.
function Ring({ left, total }: { left: number; total: number }) {
  const t = useT(), r = 88, c = 2 * Math.PI * r, share = Math.max(0, Math.min(1, left / total));
  return (
    <figure className="ring" aria-label={`${left} ${t("minLeft")} ${t("cycleOf")} ${total} ${t("minCycle")}`}>
      <svg viewBox="0 0 200 200" aria-hidden>
        <circle cx="100" cy="100" r={r} className="ring-track" />
        <circle cx="100" cy="100" r={r} className="ring-fill" strokeDasharray={c} strokeDashoffset={c * (1 - share)} transform="rotate(-90 100 100)" />
      </svg>
      <figcaption><span className="ring-time num">{left}<span className="unit"> min</span></span>
        <span className="eyebrow">{t("remaining")}</span><span className="sm muted">{t("cycleOf")} {total} {t("minCycle")}</span></figcaption>
    </figure>
  );
}

function Detail({ id }: { id: string }) {
  const t = useT();
  const { view, info } = useOutlet();
  const m = view.data?.machines.find((x) => x.machine_id === id);
  return (
    <>
      <Header title={t("machineDetail")} back="/customer" />
      {!m ? (view.error ? <Failed error={view.error} /> : <Loading />) : (
        <div className="stack">
          <section className="card glow machine-head">
            <span className="app-tile lg"><Icon name={typeIcon(m)} /></span>
            <div className="grow"><span className="row wrap"><h2>{t(m.type === "dryer" ? "dryer" : "washer")} {m.name}</h2><Pill m={m} /></span>
              <p className="sm muted">{m.type === "dryer" ? `${t(m.heat_source === "gas" ? "gas" : "electric")} · ` : ""}SmartFlux {info?.name}</p></div>
          </section>
          {m.status === "in_use" && m.minutes_left != null && m.cycle_minutes ? <Ring left={m.minutes_left} total={m.cycle_minutes} /> : null}
          {m.price_from_rm != null && <section className="card">
            <span className="eyebrow">{t("perCycleRange")}</span>
            <p className="price lg">{m.price_from_rm === m.price_to_rm ? rmx(m.price_from_rm) : `${rmx(m.price_from_rm)} – ${rmx(m.price_to_rm)}`}</p>
          </section>}
          <a className="btn outlined" {...linkProps(`/customer/report/${m.machine_id}`)}><Icon name="flag" className="sm" />{t("reportIt")}</a>
        </div>
      )}
    </>
  );
}

function OutletRow({ o, current }: { o: Outlet; current: boolean }) {
  const t = useT(), { asOf, lang } = usePrefs();
  const v = useApi<View>(`/outlets/${o.outlet_id}/availability?as_of=${asOf}`).data;
  const free = (type: string) => v ? `${v.machines.filter((m) => m.type === type && m.status === "free").length}/${v.machines.filter((m) => m.type === type).length}` : "–";
  return (
    <section className={`card ${current ? "glow" : ""} stack tight`}>
      {current && <span className="eyebrow warm row"><span className="dot busy" aria-hidden />{t("current")}</span>}
      <div className="row between"><h2 className="h3">SmartFlux {o.name}</h2>
        {!current && <button className="btn secondary sm-btn" onClick={() => { setPref("outlet", o.outlet_id); navigate("/customer"); }}>{t("select")}</button>}</div>
      <p className="sm muted row"><Icon name="location_on" className="sm" />{o.outlet_id}{o.state ? ` · ${o.state}` : ""}</p>
      <div className="stats">
        <span><Icon name="local_laundry_service" className="sm accent" /><b className="num">{free("washer")}</b><span className="sm muted">{t("washersFree")}</span></span>
        <span><Icon name="mode_heat" className="sm accent" /><b className="num">{free("dryer")}</b><span className="sm muted">{t("dryersFree")}</span></span>
      </div>
      {v?.promos.map((p) => <p key={p.slot} className="sm warm row"><Icon name="bolt" className="sm" />{t("happyHour")}: {slot(p.slot, lang)}</p>)}
      {current && <a className="btn cta" {...linkProps("/customer")}>{t("machines")}<Icon name="arrow_forward" className="sm" /></a>}
    </section>
  );
}

function Outlets() {
  const t = useT(), { session } = usePrefs();
  const { outlet } = useOutlet();
  const names = useApi<Outlet[]>("/outlets");
  const mine = names.data?.filter((o) => session!.outlets.includes(o.outlet_id)) ?? [];
  return (
    <>
      <Header title={t("outlets")} />
      {names.error ? <Failed error={names.error} /> : !names.data ? <Loading /> : (
        <div className="stack">
          {[...mine].sort((a, b) => Number(b.outlet_id === outlet) - Number(a.outlet_id === outlet)).map((o) => <OutletRow key={o.outlet_id} o={o} current={o.outlet_id === outlet} />)}
          {!session!.email && <p className="sm muted">{t("guestNote")}</p>}
        </div>
      )}
    </>
  );
}

function Account() {
  const t = useT(), p = usePrefs();
  const guest = !p.session?.email;
  const out = () => { setPref("session", null); navigate("/login"); };
  return (
    <>
      <Header title={t("account")} />
      <div className="stack">
        <section className="card glow row">
          <span className="avatar lg">{p.session?.name?.[0] ?? "G"}</span>
          <div className="grow"><h2 className="h3">{guest ? t("guest") : p.session!.name}</h2>{!guest && <p className="sm muted">{p.session!.email}</p>}</div>
        </section>
        {guest && <section className="card stack tight"><p className="sm">{t("guestNote")}</p><button className="btn cta" onClick={out}>{t("createAccount")}</button></section>}
        <section className="card stack">
          <div className="row between"><span>{t("language")}</span>
            <div className="seg" role="group" aria-label={t("language")}>{(["en", "ms"] as const).map((l) => <button key={l} aria-pressed={p.lang === l} onClick={() => setPref("lang", l)}>{l === "en" ? "EN" : "BM"}</button>)}</div></div>
          <div className="row between"><span>{t("demoDate")}</span><DatePicker value={p.asOf} onChange={(d) => setPref("asOf", d)} /></div>
        </section>
        <button className="btn outlined" onClick={out}><Icon name="logout" className="sm" />{t("signOut")}</button>
      </div>
    </>
  );
}

const REASONS = ["wont_start", "not_heating", "too_long", "other"] as const;
function Report({ id }: { id: string }) {
  const t = useT();
  const { outlet, view, asOf } = useOutlet();
  const toast = useToast();
  const [reason, setReason] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const m = view.data?.machines.find((x) => x.machine_id === id);
  const send = async () => {
    setBusy(true);
    try {
      await api(`/outlets/${outlet}/reports`, { machine_id: id, reason, as_of: asOf });
      toast.show(t("thanks"));
      setTimeout(() => navigate("/customer"), 1500);
    } catch (e) { toast.show((e as Error).message); setBusy(false); }
  };
  return (
    <>
      <Header title={`${t("notWorking")} ${m?.name ?? ""}`} back={`/customer/machine/${id}`} />
      <div className="stack">
        <p>{t("whatsWrong")}</p>
        <div className="filter wrap" role="group" aria-label="Reason">
          {REASONS.map((k) => <button key={k} aria-pressed={reason === k} onClick={() => setReason(k)}>{t(k)}</button>)}
        </div>
        <button className="btn cta block" disabled={!reason || busy} onClick={send}>{t("sendReport")}</button>
        <p className="sm muted">{t("reportNote")}</p>
      </div>
      {toast.node}
    </>
  );
}

function CustomerNav() {
  const path = usePath().split("?")[0], t = useT();
  const items: [string, string, string][] = [["/customer", "home", t("home")], ["/customer/outlets", "storefront", t("outlets")], ["/customer/account", "account_circle", t("account")]];
  return (
    <nav className="nav" aria-label="Main">
      {items.map(([href, icon, label]) => (
        <a key={href} {...linkProps(href)} aria-current={(href === "/customer" ? path === "/customer" || path.startsWith("/customer/machine") : path.startsWith(href)) ? "page" : undefined}><Icon name={icon} />{label}</a>
      ))}
    </nav>
  );
}

export function CustomerApp() {
  const path = usePath(), t = useT();
  let p, screen;
  if ((p = match("/customer/machine/:id", path))) screen = <Detail id={p.id} />;
  else if ((p = match("/customer/report/:id", path))) screen = <Report id={p.id} />;
  else if (match("/customer/outlets", path)) screen = <Outlets />;
  else if (match("/customer/account", path)) screen = <Account />;
  else screen = <><Header title={t("home")} /><Home /></>;
  return <div className="app">{screen}<CustomerNav /></div>;
}
