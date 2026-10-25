// The public landing page at /. Direction "The product performs" (taste-skill, seed 649590698): the product's own
// fragments, at true size, do the explaining. The idea: a self-service dobi and its one TNB meter are the stage,
// and SmartFlux shows what that one meter knows about every machine. The live thing: drag through Friday 16 Oct and
// Ipoh's real machine board answers from the cycle log, with TNB's peak hours marked. Every figure is from the
// repo's own runs (output_examples/) and benchmark (eval/benchmark.md). Photos: Wikimedia Commons, credited below.
import { useEffect, useRef, useState } from "react";
import { linkProps } from "./api.ts";
import "./landing.css";

const REPO = "https://github.com/No0bmazt3r/SmartFlux-EDIS-Energy-Demand-Intelligence-System-";
const DAY = "2026-10-16"; // a Friday in the sample window, so TNB's weekday peak (14:00–22:00) applies
type Machine = { machine_id: string; name: string; type: string; status: string; minutes_left: number | null };

// Section parts rise in as they enter, staggered; content stays visible without the observer.
function useReveal() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = ref.current!;
    const items = [...root.querySelectorAll<HTMLElement>("[data-r]")];
    if (!("IntersectionObserver" in window) || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    root.classList.add("lp-motion");
    const io = new IntersectionObserver((es) => es.forEach((e) => {
      if (!e.isIntersecting) return;
      const el = e.target as HTMLElement, sibs = [...(el.parentElement?.children ?? [])].filter((x) => x.hasAttribute("data-r"));
      el.style.transitionDelay = `${Math.min(sibs.indexOf(el), 5) * 75}ms`;
      el.classList.add("in"); io.unobserve(el);
    }), { rootMargin: "0px 0px -8% 0px" });
    items.forEach((i) => io.observe(i));
    return () => io.disconnect();
  }, []);
  return ref;
}

// The live thing: the real availability endpoint, asked as a guest (the same call a customer's QR scan makes).
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
function DayBoard() {
  const [t, setT] = useState(10 * 60 + 30), [machines, setMachines] = useState<Machine[] | null>(null), [down, setDown] = useState(false);
  const token = useRef<Promise<string>>(null), cache = useRef(new Map<number, Machine[]>());
  useEffect(() => {
    token.current ??= fetch("/login/guest", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ outlet_id: "OUT-01" }) })
      .then((r) => r.json()).then((s) => s.token);
    if (cache.current.has(t)) return setMachines(cache.current.get(t)!);
    const id = setTimeout(() => token.current!
      .then((tok) => fetch(`/outlets/OUT-01/availability?as_of=${DAY}&at=${encodeURIComponent(`${DAY} ${hhmm(t)}:00`)}`, { headers: { Authorization: `Bearer ${tok}` } }))
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((a) => { cache.current.set(t, a.machines); setMachines(a.machines); }, () => setDown(true)), 90);
    return () => clearTimeout(id);
  }, [t]);
  if (down) return null; // no API: the photograph carries the hero alone
  const peak = t >= 14 * 60 && t < 22 * 60, free = machines?.filter((m) => m.status === "free").length ?? 0;
  return (
    <div className="lp-board" data-ui>
      <div className="lp-board-head">
        <b>SmartFlux Ipoh</b><span>Fri 16 Oct · {hhmm(t)}</span>
        <span className={`lp-tou ${peak ? "peak" : ""}`}>{peak ? "Peak · RM0.5217/kWh" : "Off-peak · RM0.4808/kWh"}</span>
      </div>
      <p className="lp-board-count">{machines ? <><b>{free}</b> of {machines.length} free</> : "Reading the cycle log…"}</p>
      <ul className="lp-machines">{(machines ?? []).map((m) => (
        <li key={m.machine_id} className={m.status}><span>{m.name}</span><small>{m.status === "free" ? "free" : m.status === "in_use" ? `${m.minutes_left} min` : "service"}</small></li>
      ))}</ul>
      <label className="lp-scrub">
        <span>Drag through the day</span>
        <input type="range" min={7 * 60} max={23 * 60 + 45} step={15} value={t} onChange={(e) => setT(+e.target.value)} aria-valuetext={`${hhmm(t)}, ${peak ? "peak" : "off-peak"}`} />
        <span className="lp-hours" aria-hidden><i style={{ left: `${((14 * 60 - 420) / (1005)) * 100}%`, width: `${(480 / 1005) * 100}%` }} /></span>
        <span className="lp-ticks" aria-hidden><span>07:00</span><span>14:00 peak starts</span><span>22:00</span></span>
      </label>
    </div>
  );
}

// One dryer, four weeks: the same card from the product, further along in each field (output_examples 02 and 07).
const STAGES: { clause: string; when: string; state: [string, string]; lines: string[] }[] = [
  { clause: "First the meter gives it away.", when: "Sun 4 Oct", state: ["Flagged", "warn"], lines: ["2.70 kWh per cycle, normal is 2.15", "+26%, and cycles 53 → 61 min", "Other dryers: +1%"] },
  { clause: "Then the Skeptic tries to clear it.", when: "Sun 4 Oct", state: ["Survived", "info"], lines: ["Humid week? Other dryers rose 1.1%", "More customers? 90 → 89 cycles a day", "Malaysia Day? Before the period"] },
  { clause: "Then the owner says yes.", when: "Sun 4 Oct", state: ["Approved", "ok"], lines: ["Service dryer D4", "Predicted RM48.03 a month", "Customers see it as under maintenance"] },
  { clause: "Then it is measured, not assumed.", when: "Sun 18 Oct", state: ["Verified", "ok"], lines: ["2.73 → 2.14 kWh per cycle", "Other dryers 2.08 → 2.17", "Saved RM64.65 a month, 135% of plan"] },
];

const ROWS: [string, string, string, string][] = [
  ["Which machine is wasting money", "No", "Yes", "Yes, from the cycle log"],
  ["Hardware to fit", "None", "A meter on every machine", "None"],
  ["Gas dryers", "No", "Not on an electric meter", "Yes, by minutes per cycle"],
  ["Flat tariff or ToU", "Not answered", "Not answered", "Worked out from your own load"],
  ["Solar and ToU together", "No", "No", "Decided jointly, never summed"],
  ["Did the fix work", "Next month's total, maybe", "Readings, no verdict", "Measured against the machine's normal and its peers"],
  ["Without being asked", "A monthly bill", "No", "A Monday briefing for every outlet"],
];

// What lands on the owner's phone: four real outputs, word for word.
const OUTPUTS: { name: string; outlet: string; date: string; verdict: string; money?: string; points: string[]; note: string }[] = [
  { name: "Monday briefing", outlet: "OUT-01 Ipoh", date: "Mon 19 Oct", verdict: "Weekly briefing", points: ["Servicing D4 saved RM64.65/month", "No dryer is wasting energy", "Switch to the ToU tariff (RM7.6/month)", "Peak share last week 61.5% (+0.8 pts)", "4 actions waiting for your approval"], note: "Prepared by the agents; nobody asked." },
  { name: "Energy plan", outlet: "OUT-01 Ipoh", date: "Sun 18 Oct", verdict: "Install 10 kWp solar, stay on your current tariff", money: "RM502.75 a month", points: ["10 kWp: payback 5.8 years, 77% of solar used on site", "With solar, ToU would cost RM1.39 more", "Peak share 58.3% → 64.9% after solar (break-even 63.6%)"], note: "Rejected: RM7.60 + RM502.75 = RM510.35. The savings overlap." },
  { name: "Bill explained", outlet: "OUT-01 Ipoh", date: "Sun 4 Oct", verdict: "Energy use +2% per day vs the baseline week", points: ["116 → 118 kWh per day", "Cause: dryer D4, about 3.1 kWh a day extra", "Ruled out: humid weather, more customers, Malaysia Day"], note: "Normal level = the week of 7–13 Sept." },
  { name: "Laporan mesin", outlet: "OUT-02 Shah Alam", date: "18 Okt", verdict: "Servis pengering G3", money: "RM84.79 sebulan", points: ["Kitaran +24% lebih lama (51 → 63 minit)", "Pengering gas: masalah aliran udara, habuk atau penunu", "Pengering lain jenis sama: +0%"], note: "Asked in Malay, answered in Malay." },
];

const CREDITS = [
  ["Kedai Dobi Harmoni", "Harmoni Laundry", "Chongkian", "CC BY-SA 4.0", "https://commons.wikimedia.org/wiki/File:Harmoni_Laundry.jpg"],
  ["TNB meter", "Hezery99-TNB electricity meter", "Hezery99", "public domain", "https://commons.wikimedia.org/wiki/File:Hezery99-TNB_electricity_meter.jpg"],
  ["Dobi Wawasan", "Wawasan Laundry", "Chongkian", "CC BY-SA 4.0", "https://commons.wikimedia.org/wiki/File:Wawasan_Laundry.jpg"],
  ["Wascomat dryer", "Wascomat TD30x30 tumble dryer", "Amakuha", "CC BY 4.0", "https://commons.wikimedia.org/wiki/File:Wascomat_TD30x30_tumble_dryer.jpg"],
  ["Kedai Dobi Metory", "Metory Laundry", "Chongkian", "CC BY-SA 4.0", "https://commons.wikimedia.org/wiki/File:Metory_Laundry.jpg"],
  ["coin laundry film", "Coinlaundry-kanagawa-2023may27", "Nesnad", "CC BY-SA 4.0", "https://commons.wikimedia.org/w/index.php?curid=132382189"],
];

function Clock() {
  const fmt = () => new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kuala_Lumpur" });
  const [now, setNow] = useState(fmt);
  useEffect(() => { const id = setInterval(() => setNow(fmt()), 20000); return () => clearInterval(id); }, []);
  return <span className="lp-clock num">{now}</span>;
}

export function Landing() {
  const ref = useReveal(), [out, setOut] = useState(0), o = OUTPUTS[out];
  return (
    <div className="lp" ref={ref}>
      <header className="lp-bar">
        <a className="lp-word" {...linkProps("/")}>SmartFlux</a>
        <nav aria-label="Page"><a href="#meter">One meter</a><a href="#how">How it works</a><a href="#compare">Why not the bill</a><a href="#outputs">Outputs</a></nav>
        <a className="lp-btn" {...linkProps("/login")}>Get started</a>
      </header>

      <main>
        <section className="lp-hero">
          <div className="lp-hero-text">
            <h1 className="lp-h1"><span className="lp-line"><span>Find the dryer</span></span><span className="lp-line"><span>eating your bill</span></span></h1>
            <p className="lp-lead lp-after">SmartFlux reads the one TNB meter and the cycle log your dobi already has. It tells you which machine, hour or tariff drives the bill, and proves each fix worked.</p>
            <div className="lp-actions lp-after"><a className="lp-btn lg" {...linkProps("/login")}>Get started</a><a className="lp-link" href="#how">See it work</a></div>
          </div>
          <figure className="lp-hero-stage">
            <img className="lp-drift" src="/landing/harmoni-laundry.jpg" width={1600} height={1200} alt="Kedai Dobi Layan Diri Harmoni, a self-service laundry in a row of shophouses" fetchPriority="high" />
            <DayBoard />
          </figure>
        </section>

        <section className="lp-meter" id="meter">
          <img src="/landing/hezery99-tnb-electricity-meter.jpg" width={1600} height={1200} alt="A TNB electricity meter on a pink wall" loading="lazy" data-r />
          <div className="lp-meter-text">
            <h2 className="lp-h2" data-r>One meter, fourteen machines</h2>
            <p data-r>A dobi has one meter on the wall and one bill a month. The bill can't tell you that dryer D4 started using 26% more per cycle in week four, or that your peak share is five points under the level where ToU stops paying.</p>
            <p data-r>SmartFlux lines up every half-hour meter reading with the cycle log your payment system already keeps, and works out each machine's own energy per cycle. No sub-meters, nothing to fit.</p>
            <dl className="lp-split" data-ui data-r>
              <div><dt>Washers</dt><dd>14%</dd></div><div><dt>Dryers</dt><dd>67%</dd></div><div><dt>Base load</dt><dd>18%</dd></div>
              <p>Ipoh, October so far: where the one meter's kWh went</p>
            </dl>
          </div>
        </section>

        <section className="lp-fields" id="how" aria-labelledby="how-h">
          {STAGES.map((s, i) => (
            <div key={s.clause} className={`lp-field f${i}`}>
              {i === 0 && <h2 className="lp-h2" id="how-h" data-r>One dryer, four weeks</h2>}
              <article className="lp-card" data-ui data-r>
                <header><b>Dryer D4 · Ipoh</b><span className={`lp-state ${s.state[1]}`}>{s.state[0]}</span></header>
                <ul>{s.lines.map((l) => <li key={l}>{l}</li>)}</ul>
                <footer>{s.when}</footer>
              </article>
              <p className="lp-clause" data-r>{s.clause}</p>
            </div>
          ))}
        </section>

        <section className="lp-compare" id="compare">
          <h2 className="lp-h2" data-r>Why not just the bill?</h2>
          <div className="lp-table" role="table" aria-label="The TNB bill, sub-metering and SmartFlux compared" data-r>
            <div role="row" className="lp-tr head"><span role="columnheader" /><span role="columnheader">The TNB bill</span><span role="columnheader">A sub-meter per machine</span><span role="columnheader" className="us">SmartFlux</span></div>
            {ROWS.map((r) => (
              <div role="row" className="lp-tr" key={r[0]}><span role="rowheader">{r[0]}</span><span role="cell" data-col="The TNB bill">{r[1]}</span><span role="cell" data-col="Sub-meters">{r[2]}</span><span role="cell" className="us" data-col="SmartFlux">{r[3]}</span></div>
            ))}
          </div>
        </section>

        <section className="lp-outputs" id="outputs">
          <div className="lp-index">
            <h2 className="lp-h2" data-r>What lands on your phone</h2>
            <div role="tablist" aria-label="Outputs" data-r>{OUTPUTS.map((x, i) => (
              <button key={x.name} role="tab" aria-selected={i === out} onClick={() => setOut(i)}>{x.name}</button>
            ))}</div>
            <p className="lp-small" data-r>Word for word from the eight example runs in the repo. Every figure comes from tested code; the language model only words it.</p>
          </div>
          <div className="lp-stage" role="tabpanel" aria-label={o.name}>
            <article key={o.name} className="lp-sheet" data-ui>
              <header><span>{o.outlet}</span><span>{o.date}</span></header>
              <h3>{o.verdict}</h3>
              {o.money && <p className="lp-money">{o.money}</p>}
              <ul>{o.points.map((p) => <li key={p}>{p}</li>)}</ul>
              <footer>{o.note}</footer>
            </article>
          </div>
        </section>

        <section className="lp-proof" id="tested">
          <div className="lp-tile accent" data-r><h2 className="lp-h2">Tested on 30 outlets it had never seen</h2><p>Seeds 100–109, 98 runs, fresh memory every time.</p></div>
          <img className="lp-tile" src="/landing/wawasan-laundry.jpg" width={1600} height={1200} alt="Dobi Wawasan, a 24-hour self-service laundry with bicycles outside" loading="lazy" data-r />
          <div className="lp-tile" data-r><b className="lp-num">30/30</b><span>ToU verdicts match the calculator</span></div>
          <div className="lp-tile" data-r><b className="lp-num">30/30</b><span>joint solar and ToU decisions match the calculators</span></div>
          <div className="lp-tile" data-r><b className="lp-num">21/21</b><span>dryer faults of +20% or more found</span></div>
          <div className="lp-tile" data-r><b className="lp-num">0</b><span>false fault flags</span></div>
          <img className="lp-tile tall" src="/landing/wascomat-td30x30-tumble-dryer.jpg" width={1600} height={2125} alt="The drum of a commercial tumble dryer" loading="lazy" data-r />
          <div className="lp-tile wide" data-r><b className="lp-num">3 of 4</b><span>measured savings within ±15% of the planted fault. One landed just outside; the benchmark lists it.</span></div>
          <img className="lp-tile" src="/landing/metory-laundry.jpg" width={1600} height={1200} alt="Kedai Dobi Metory on the ground floor of a two-storey shophouse" loading="lazy" data-r />
        </section>

        <section className="lp-cta" aria-labelledby="cta-h">
          <h2 className="sr-only" id="cta-h">Try it</h2>
          <div className="lp-cta-text">
            <p data-r>Try it as the owner, a franchise manager or a customer, on six weeks of sample data from three outlets.</p>
            <div className="lp-actions" data-r><a className="lp-btn" {...linkProps("/login")}>Pick a role</a><a className="lp-link" href={`${REPO}/blob/main/docs/GETTING_STARTED.md`}>Read the setup guide</a></div>
          </div>
          <figure className="lp-film" data-r>
            <video autoPlay muted loop playsInline preload="metadata" poster="/landing/coinlaundry-kanagawa-2023may27-poster.jpg" width={854} height={480} aria-hidden="true">
              <source src="/landing/coinlaundry-kanagawa-2023may27.webm" type="video/webm" />
            </video>
            <figcaption>A coin laundry in Kanagawa, Japan. Same machines, same one meter.</figcaption>
          </figure>
        </section>
      </main>

      <footer className="lp-foot">
        <div className="lp-ft statement"><p>An energy agent for Malaysian self-service laundromats, built for the Open Agent Hackathon 2026, Track 3: Reasoning Architecture. Zetaris for data, Meterless H-MEM for memory, Meterless Nightshift and NVIDIA Nemotron for reasoning.</p>
          <p className="lp-credits">Photographs and film via Wikimedia Commons: {CREDITS.map(([label, , who, lic, url], i) => <span key={url}>{i ? "; " : ""}<a href={url}>{label}</a> by {who}, {lic}</span>)}.</p></div>
        <nav className="lp-ft" aria-label="Footer"><a href="#meter">One meter</a><a href="#how">How it works</a><a href="#compare">Why not the bill</a><a href="#outputs">Outputs</a><a href="#tested">Tested</a></nav>
        <div className="lp-ft"><span>Kuala Lumpur</span><Clock /></div>
        <a className="lp-ft" href={REPO}><span>Source</span><b>GitHub</b></a>
        <div className="lp-ft ink"><span className="lp-giant">SmartFlux</span></div>
        <a className="lp-ft accent" {...linkProps("/login")}><b>Try the demo</b>
          <svg width="56" height="56" viewBox="0 0 56 56" aria-hidden><path d="M12 44 44 12M20 12h24v24" fill="none" stroke="currentColor" strokeWidth="4" /></svg></a>
      </footer>
    </div>
  );
}
