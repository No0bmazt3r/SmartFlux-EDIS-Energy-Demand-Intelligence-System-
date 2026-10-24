// Customer view (features.md §A.4): availability and approved promos only, for the one outlet whose QR was scanned.
import { useState } from "react";
import { api, linkProps, match, navigate, usePath, usePrefs, useApi } from "./api.ts";
import { DemoControls, Failed, Icon, Loading, ModeBadge, TopBar, day, useT, useToast } from "./ui.tsx";

type Machine = { machine_id: string; name: string; type: string; heat_source: string; price_from_rm: number | null; price_to_rm: number | null; status: "free" | "in_use" | "maintenance"; minutes_left: number | null };
type View = { outlet_id: string; at: string; mode: string; machines: Machine[]; promos: { slot: string }[] };

const price = (m: Machine) => m.price_from_rm == null ? "" : m.price_from_rm === m.price_to_rm ? `RM${m.price_from_rm}` : `RM${m.price_from_rm}–${m.price_to_rm}`;
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
  const { outlet, name, view } = useOutlet();
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
        {v?.promos.map((p) => <div key={p.slot} className="promo"><Icon name="local_offer" />Off-peak promo: {p.slot.replace(/^(\w+) /, "$1s from ")}</div>)}
        {view.loading && !v && <Loading />}
        {view.error && <Failed error={view.error} />}
        {v && <>
          <p className="h3">{free("washer")} washer{free("washer") === 1 ? "" : "s"} free · {free("dryer")} dryer{free("dryer") === 1 ? "" : "s"} free</p>
          <div className="filter" role="group" aria-label="Filter">
            {([["all", t("all")], ["washer", t("washers")], ["dryer", t("dryers")], ["free", t("freeNow")]] as const).map(([k, label]) =>
              <button key={k} aria-pressed={filter === k} onClick={() => setFilter(k)}>{label}</button>)}
          </div>
          <div className="tiles">
            {shown.map((m) => m.status === "maintenance"
              ? <div key={m.machine_id} className="tile off" aria-label={`${m.name}, under maintenance`}>
                  <h3><Icon name={typeIcon(m)} />{m.name}</h3><span className="sm">{m.type === "dryer" ? "Dryer" : "Washer"}</span><Status m={m} />
                </div>
              : <a key={m.machine_id} className="tile" {...linkProps(`/customer/machine/${m.machine_id}`)}>
                  <h3><Icon name={typeIcon(m)} />{m.name}</h3><span className="sm muted">{m.type === "dryer" ? "Dryer" : "Washer"} · {price(m)}</span><Status m={m} />
                </a>)}
          </div>
          <p className="sm muted">Business data is synthetic (demo). Status comes from the payment system's cycle records.</p>
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
      <TopBar back="/customer" title={m ? `${m.type === "dryer" ? "Dryer" : "Washer"} ${m.name}` : ""} />
      {!m ? <Loading /> : (
        <div className="stack">
          <div className="card">
            <Status m={m} />
            <p className="display num">{price(m)}<span className="h3"> per cycle</span></p>
            <p className="sm muted">{m.type === "dryer" ? `${m.heat_source === "gas" ? "Gas" : "Electric"} dryer` : "Washer"}</p>
          </div>
          <a className="textlink" {...linkProps(`/customer/report/${m.machine_id}`)}>{t("notWorking")}</a>
        </div>
      )}
    </div>
  );
}

const REASONS = [["wont_start", "Won't start"], ["not_heating", "Not heating"], ["too_long", "Takes too long"], ["other", "Other"]] as const;
function Report({ id }: { id: string }) {
  const { outlet, view, asOf } = useOutlet();
  const toast = useToast();
  const [reason, setReason] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const m = view.data?.machines.find((x) => x.machine_id === id);
  const send = async () => {
    setBusy(true);
    try {
      await api(`/outlets/${outlet}/reports`, { machine_id: id, reason, as_of: asOf });
      toast.show("Thanks, the owner will be told.");
      setTimeout(() => navigate("/customer"), 1500);
    } catch (e) { toast.show((e as Error).message); setBusy(false); }
  };
  return (
    <div className="app">
      <TopBar back={`/customer/machine/${id}`} title={`Report ${m?.name ?? ""}`} />
      <div className="stack">
        <p>What's wrong with this machine?</p>
        <div className="filter wrap" role="group" aria-label="Reason">
          {REASONS.map(([k, label]) => <button key={k} aria-pressed={reason === k} onClick={() => setReason(k)}>{label}</button>)}
        </div>
        <button className="btn cta block" disabled={!reason || busy} onClick={send}>Send report</button>
        <p className="sm muted">Your report goes to the owner as a hint. It doesn't mark the machine broken on its own.</p>
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
