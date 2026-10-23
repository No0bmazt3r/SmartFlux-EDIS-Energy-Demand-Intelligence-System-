// Rules twin of the Reporter: fills decision cards from approved claims only, in English or Malay.
// Numbers come straight from calculator output; the text around them is a template.
import type { TouResult } from "../../calc/tou.ts";
import { ACTION_RISK, CAPABILITIES, gate } from "../../engines/scout/index.ts";
import type { Ctx } from "../../orchestrator/tools.ts";
import type { Claim, Decision, Lang, RunState } from "../../orchestrator/state.ts";

const rm = (x: number) => Math.round(x * 100) / 100;
const pct = (x: number) => (x * 100).toFixed(1) + "%";

const TEXT = {
  en: {
    switch: "Switch to the ToU tariff", switch_with_caution: "Switch to ToU, with caution", stay: "Stay on your current flat tariff",
    peak: (p: string, b: string) => `Peak share ${p} vs break-even ${b}`,
    worst: (w: number, p: string) => `Worst week (week ${w}): ${p} in peak`,
    costs: (t: number, f: number) => `ToU RM${t}/month vs flat RM${f}/month`,
    ruledStay: (x: number) => `Staying on flat: costs RM${x} more per month`,
    ruledSwitch: "Switching to ToU: your peak share is above break-even",
    cautionNote: "At least one week was above break-even; check before switching",
    rates: (r: TouResult["rates"]) => `Rates used: peak RM${r.peak}, off-peak RM${r.offpeak}, flat RM${r.flat} per kWh (all-in; confirm against TNB's schedule)`,
    solar: "Solar not considered here; ask \"Solar, ToU or both?\" for the joint decision",
    synthetic: "Sample data: business data is synthetic, weather and holidays are real",
    refuse: "I can't help with that. I can help with:",
  },
  ms: {
    switch: "Tukar ke tarif ToU", switch_with_caution: "Tukar ke ToU, dengan berhati-hati", stay: "Kekal dengan tarif rata semasa",
    peak: (p: string, b: string) => `Bahagian waktu puncak ${p} berbanding titik pulang modal ${b}`,
    worst: (w: number, p: string) => `Minggu terburuk (minggu ${w}): ${p} dalam waktu puncak`,
    costs: (t: number, f: number) => `ToU RM${t}/bulan berbanding tarif rata RM${f}/bulan`,
    ruledStay: (x: number) => `Kekal dengan tarif rata: kos RM${x} lebih sebulan`,
    ruledSwitch: "Tukar ke ToU: bahagian waktu puncak anda melebihi titik pulang modal",
    cautionNote: "Sekurang-kurangnya satu minggu melebihi titik pulang modal; semak sebelum menukar",
    rates: (r: TouResult["rates"]) => `Kadar digunakan: puncak RM${r.peak}, luar puncak RM${r.offpeak}, rata RM${r.flat} sekWj (semua termasuk; sahkan dengan jadual TNB)`,
    solar: "Solar tidak dipertimbangkan di sini; tanya \"Solar, ToU atau kedua-duanya?\"",
    synthetic: "Data contoh: data perniagaan adalah sintetik, cuaca dan cuti adalah sebenar",
    refuse: "Saya tidak dapat membantu dengan itu. Saya boleh membantu dengan:",
  },
};

function tariffCard(claim: Claim, lang: Lang): Decision {
  const t = TEXT[lang], r = claim.data as TouResult;
  const weeks = r.weeks.length;
  const confidence = r.verdict === "switch_with_caution" ? "medium" : weeks >= 4 ? "high" : weeks >= 2 ? "medium" : "low";
  return {
    type: "tariff", verdict: t[r.verdict], rm_per_month: rm(Math.abs(r.saving_per_month)), confidence,
    evidence: [t.peak(pct(r.peak_share), pct(r.breakeven)), t.worst(r.worst_week.week, pct(r.worst_week.peak_share)), t.costs(rm(r.cost_tou_per_month), rm(r.cost_flat_per_month))],
    ruled_out: r.verdict === "stay" ? [t.ruledSwitch] : [t.ruledStay(rm(r.saving_per_month))],
    assumptions: [...(r.verdict === "switch_with_caution" ? [t.cautionNote] : []), t.rates(r.rates), t.solar, t.synthetic],
  };
}

export function reporter(state: RunState, ctx: Ctx) {
  const t = TEXT[state.lang];
  if (state.refused) {
    ctx.emit({ agent_name: "Reporter", action: "refuse", input_summary: state.question, output_summary: `${t.refuse} ${CAPABILITIES.length} capabilities listed` });
    return `${t.refuse}\n- ${CAPABILITIES.join("\n- ")}`;
  }
  for (const claim of state.claims.filter((c) => c.status === "approved")) {
    if (claim.type !== "tariff") continue;
    state.decisions.push(tariffCard(claim, state.lang));
    const r = claim.data as TouResult;
    if (r.verdict !== "stay") {
      const type = "switch_tariff";
      state.actions.push({ id: `a${state.actions.length + 1}`, type, target: state.outlet_id, reason: `ToU saves about RM${rm(r.saving_per_month)}/month`, risk: ACTION_RISK[type],
        status: gate(type) === "auto" ? "approved" : "awaiting_approval" });
    }
  }
  ctx.emit({
    agent_name: "Reporter", action: "report",
    input_summary: `${state.claims.filter((c) => c.status === "approved").length} approved claims, lang=${state.lang}`,
    output_summary: `${state.decisions.length} decisions: ${state.decisions.map((d) => d.verdict).join("; ") || "none"}; ${state.actions.length} actions awaiting approval; ${state.unresolved.length} unresolved`,
  });
  return undefined;
}
