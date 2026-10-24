// /kitchen-sink: every shared component on one page with sample data (TODO 11.2), for design review and mockups.
import { BottomNav, Confidence, DecisionCard, DemoControls, Icon, ModeBadge, RiskBadge, Sparkline, StatusBadge, Timeline, WeeklyChart, type Week } from "./ui.tsx";

const FROM = ["2026-09-07", "2026-09-14", "2026-09-21", "2026-09-28", "2026-10-05", "2026-10-12"];
const weeks: Week[] = [2.15, 2.12, 2.4, 2.72, 2.7, 2.18].map((v, i) => ({ week: i + 1, from: FROM[i], unit: "kWh", value: v, se: 0.06 }));
const Section = ({ title, children }: { title: string; children: React.ReactNode }) => <section className="stack tight"><span className="label muted">{title}</span>{children}</section>;

export function KitchenSink() {
  return (
    <div className="app stack" style={{ paddingTop: 16 }}>
      <h1>Kitchen sink</h1>
      <Section title="Top bar controls"><div className="row wrap"><DemoControls outlets={[{ id: "OUT-01", name: "Ipoh" }, { id: "OUT-02", name: "Shah Alam" }]} /></div></Section>
      <Section title="Buttons"><div className="row wrap">
        <button className="btn primary">Primary</button><button className="btn secondary">Secondary</button><button className="btn outlined">Outlined</button>
        <button className="btn cta">Call to action</button><span className="briefing" style={{ padding: 8, borderRadius: 12 }}><button className="btn inverted">Inverted</button></span></div></Section>
      <Section title="Chips and badges"><div className="row wrap"><span className="chip soft">nvidia/nemotron</span><ModeBadge mode="live" /><ModeBadge mode="sample" /></div>
        <div className="row wrap">{["read_only", "advisory", "operational", "financial"].map((r) => <RiskBadge key={r} r={r} />)}</div>
        <div className="row wrap">{["verified", "awaiting_approval", "rejected", "not_achieved", "unresolved"].map((s) => <StatusBadge key={s} s={s} />)}</div>
        <div className="row wrap"><Confidence c="high" /><Confidence c="medium" /></div></Section>
      <Section title="Briefing card"><section className="card briefing"><span className="label">Weekly briefing · 19 Oct</span><ul><li>Servicing D4 saved RM64.65/month</li><li>No dryer is wasting energy</li><li>Switch to the ToU tariff (RM7.6/month)</li></ul><button className="btn inverted">Open</button></section></Section>
      <Section title="Decision card"><DecisionCard d={{ type: "machine_fault", verdict: "Service dryer D4", rm_per_month: 48.03, confidence: "high", evidence: ["D4 uses 2.70 kWh per cycle vs its normal 2.15 (+26%)", "Other dryers of the same type: +1%"], ruled_out: ["Humid week: other dryers barely changed"], assumptions: ["Sample data: business data is synthetic"] }} /></Section>
      <Section title="KPI tile"><div className="card"><span className="label muted">Energy cost</span><span className="h3 num">RM2,340</span></div></Section>
      <Section title="Alert and machine rows"><a className="mrow" href="#"><Icon name="warning" className="warn" /><span className="grow">Gas dryer G3 cycles +20% longer</span><Icon name="chevron_right" /></a>
        <div className="mrow"><Icon name="mode_heat" /><div className="grow row between"><span className="h3">D4</span><Sparkline weeks={weeks} normal={2.15} /><StatusBadge s="flagged" /></div></div></Section>
      <Section title="Customer tiles"><div className="tiles"><div className="tile"><h3><Icon name="mode_heat" />D1</h3><span className="sm muted">Dryer · RM5–7</span><span className="badge ok"><Icon name="check_circle" />Free</span></div>
        <div className="tile off"><h3><Icon name="mode_heat" />D4</h3><span className="sm">Dryer</span><span className="badge muted"><Icon name="build" />Under maintenance</span></div></div>
        <div className="promo"><Icon name="local_offer" />Off-peak promo: Saturdays from 22:00</div></Section>
      <Section title="Weekly chart"><div className="card"><WeeklyChart name="D4" weeks={weeks} normal={2.15} serviced={["2026-10-06"]} /></div></Section>
      <Section title="Agent timeline"><Timeline events={[
        { ts: "", agent_name: "Investigator", target_agent: "Skeptic", action: "calc.joint_decision", status: "success", input_summary: "4 options on the same post-solar load", output_summary: "10 kWp + flat RM502.75" },
        { ts: "", agent_name: "Skeptic", target_agent: "Investigator", action: "verify", status: "needs_revision", input_summary: "claim c1", output_summary: "Rejected: RM7.60 + RM502.75 adds two savings that overlap; recompute jointly", model: "nemotron-super" },
      ]} /></Section>
      <Section title="SQL block"><pre className="sql">{"SELECT period, SUM(kwh) AS kwh\n  FROM interval_usage\n  WHERE outlet_id = :outlet"}</pre></Section>
      <Section title="Toast"><div className="toast" style={{ position: "static", transform: "none" }}>Approved. We'll check if it worked.</div></Section>
      <a className="fab" aria-label="Ask" href="#"><Icon name="auto_awesome" /></a>
      <BottomNav pending={1} />
    </div>
  );
}
