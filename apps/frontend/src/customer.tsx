// Customer view (features.md §A.4): availability and approved promos only, for the one outlet whose QR was scanned.
import { useState } from "react";
import { api, linkProps, match, navigate, usePath, usePrefs, useApi } from "./api.ts";
import { DemoControls, Failed, Icon, Loading, ModeBadge, TopBar, day, useT, useToast } from "./ui.tsx";

type Machine = { machine_id: string; name: string; type: string; heat_source: string; price_from_rm: number | null; price_to_rm: number | null; status: "free" | "in_use" | "maintenance"; minutes_left: number | null };
type View = { outlet_id: string; at: string; mode: string; machines: Machine[]; promos: { slot: string }[] };

const price = (m: Machine) => m.price_from_rm == null ? "" : m.price_from_rm === m.price_to_rm ? `RM${m.price_from_rm}` : `RM${m.price_from_rm}–${m.price_to_rm}`;
const DAYS_MS: Record<string, string> = { Sunday: "Ahad", Monday: "Isnin", Tuesday: "Selasa", Wednesday: "Rabu", Thursday: "Khamis", Friday: "Jumaat", Saturday: "Sabtu" };
const slot = (s: string, lang: string) => lang === "ms" ? s.replace(/^(\w+) /, (_, d) => `${DAYS_MS[d] ?? d} dari `) : s.replace(/^(\w+) /, "$1s from ");
const typeIcon = (m: Machine) => (m.type === "dryer" ? "mode_heat" : "local_laundry_service");

function Status({ m }: { m: Machine }) {
  const t = useT();
  if (m.status === "maintenance") return <span className="badge muted"><Icon name="build" />{t("maint")}</span>;
  if (m.status === "in_use") return <span className="badge peak"><Icon name="schedule" />{t("inUse")} · {m.minutes_left} {t("minLeft")}</span>;
  return <span className="badge ok"><Icon name="check_circle" />{t("free")}</span>;
}

function useOutlet() {
  const { session, asOf } = usePrefs();
  const outlet = session!.outlets[0];
  const names = useApi<{ outlet_id: string; name: string }[]>("/outlets");
  const view = useApi<View>(`/outlets/${outlet}/availability?as_of=${asOf}`);
  return { outlet, name: names.data?.find((o) => o.outlet_id === outlet)?.name ?? "", view, asOf };
}

function Machines() {
  const t = useT();
  const { outlet, name, view } = useOutlet(), { lang } = usePrefs();
  const [filter, setFilter] = useState<"all" | "washer" | "dryer" | "free">("all");
  const v = view.data;
  const shown = v?.machines.filter((m) => filter === "all" || (filter === "free" ? m.status === "free" : m.type === filter)) ?? [];
  const free = (type: string) => v?.machines.filter((m) => m.type === type && m.status === "free").length ?? 0;
  return (
    <div className="app">
      <TopBar><DemoControls /></TopBar>
      <div className="stack">
        <div className="row between wrap">
          <div><h1>SmartFlux · {outlet} {name}</h1>{v && <p className="sm muted">{t("updated")} {day(v.at)}, {v.at.slice(11, 16)}</p>}</div>
          {v && <ModeBadge mode={v.mode} />}
        </div>
        {v?.promos.map((p) => <div key={p.slot} className="promo"><Icon name="local_offer" />{t("promo")}: {slot(p.slot, lang)}</div>)}
        {view.loading && !v && <Loading />}
        {view.error && <Failed error={view.error} />}
        {v && <>
          <p className="h3">{free("washer")} {free("washer") === 1 ? t("washersFree").replace("washers", "washer") : t("washersFree")} · {free("dryer")} {free("dryer") === 1 ? t("dryersFree").replace("dryers", "dryer") : t("dryersFree")}</p>
          <div className="filter" role="group" aria-label="Filter">
            {([["all", t("all")], ["washer", t("washers")], ["dryer", t("dryers")], ["free", t("freeNow")]] as const).map(([k, label]) =>
              <button key={k} aria-pressed={filter === k} onClick={() => setFilter(k)}>{label}</button>)}
          </div>
          <div className="tiles">
            {shown.map((m) => m.status === "maintenance"
              ? <div key={m.machine_id} className="tile off" aria-label={`${m.name}, under maintenance`}>
                  <h3><Icon name={typeIcon(m)} />{m.name}</h3><span className="sm">{t(m.type === "dryer" ? "dryer" : "washer")}</span><Status m={m} />
                </div>
              : <a key={m.machine_id} className="tile" {...linkProps(`/customer/machine/${m.machine_id}`)}>
                  <h3><Icon name={typeIcon(m)} />{m.name}</h3><span className="sm muted">{t(m.type === "dryer" ? "dryer" : "washer")} · {price(m)}</span><Status m={m} />
                </a>)}
          </div>
          <p className="sm muted">{t("synthetic")}</p>
        </>}
      </div>
    </div>
  );
}

function Detail({ id }: { id: string }) {
  const t = useT();
  const { view } = useOutlet();
  const m = view.data?.machines.find((x) => x.machine_id === id);
  return (
    <div className="app">
      <TopBar back="/customer" title={m ? `${t(m.type === "dryer" ? "dryer" : "washer")} ${m.name}` : ""} />
      {!m ? <Loading /> : (
        <div className="stack">
          <div className="card">
            <Status m={m} />
            <p className="display num">{price(m)}<span className="h3"> {t("perCycle")}</span></p>
            <p className="sm muted">{m.type === "dryer" ? `${m.heat_source === "gas" ? "Gas" : "Electric"} dryer` : "Washer"}</p>
          </div>
          <a className="textlink" {...linkProps(`/customer/report/${m.machine_id}`)}>{t("notWorking")}</a>
        </div>
      )}
    </div>
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
    <div className="app">
      <TopBar back={`/customer/machine/${id}`} title={`${t("notWorking")} ${m?.name ?? ""}`} />
      <div className="stack">
        <p>{t("whatsWrong")}</p>
        <div className="filter wrap" role="group" aria-label="Reason">
          {REASONS.map((k) => <button key={k} aria-pressed={reason === k} onClick={() => setReason(k)}>{t(k)}</button>)}
        </div>
        <button className="btn cta block" disabled={!reason || busy} onClick={send}>{t("sendReport")}</button>
        <p className="sm muted">{t("reportNote")}</p>
      </div>
      {toast.node}
    </div>
  );
}

export function CustomerApp() {
  const path = usePath();
  let p;
  if ((p = match("/customer/machine/:id", path))) return <Detail id={p.id} />;
  if ((p = match("/customer/report/:id", path))) return <Report id={p.id} />;
  return <Machines />;
}
