// Rules twin of the Reporter: fills decision cards from approved claims only, in English or Malay.
// Numbers come straight from calculator output; the text around them is a template.
import type { FaultResult } from "../../calc/fault.ts";
import type { JointResult } from "../../calc/joint.ts";
import { SCHEME_TERM_YEARS, type SolarResult } from "../../calc/solar.ts";
import type { TouResult } from "../../calc/tou.ts";
import { ACTION_RISK, CAPABILITIES, gate } from "../../engines/scout/index.ts";
import type { MvResult } from "../../calc/mv.ts";
import { pendingApprovals, priorRejection, recentOutcomes, rememberAdvice, rememberOutcome, writeBaselines } from "../../orchestrator/memory.ts";
import type { Ctx } from "../../orchestrator/tools.ts";
import type { Claim, Decision, Lang, RunState } from "../../orchestrator/state.ts";
import { addDays, fmt } from "../../orchestrator/windows.ts";

const rm = (x: number) => Math.round(x * 100) / 100;
const pct = (x: number) => (x * 100).toFixed(1) + "%";
const lcFirst = (s: string) => s[0].toLowerCase() + s.slice(1);
const sign = (x: number) => (x >= 0 ? "+" : "") + x.toFixed(0) + "%";

const TEXT = {
  en: {
    switch: "Switch to the ToU tariff", switch_with_caution: "Switch to ToU, with caution", stay: "Stay on your current flat tariff",
    peak: (p: string, b: string) => `Peak share ${p} vs break-even ${b}`,
    worst: (w: number, p: string) => `Worst week (week ${w}): ${p} in peak`,
    costs: (t: number, f: number) => `ToU RM${t}/month vs flat RM${f}/month`,
    ruledStay: (x: number) => `Staying on flat: costs RM${x} more per month`,
    ruledSwitch: "Switching to ToU: your peak share is above break-even",
    cautionNote: "At least one week was above break-even; check before switching",
    rates: (r: { peak: number; offpeak: number; flat: number }) => `Rates used: peak RM${r.peak}, off-peak RM${r.offpeak}, flat RM${r.flat} per kWh (all-in; confirm against TNB's schedule)`,
    flat: (x: number) => `Flat rate used: RM${x} per kWh (all-in; confirm against TNB's schedule)`,
    solar: "Solar not considered here; ask \"Solar, ToU or both?\" for the joint decision",
    synthetic: "Sample data: business data is synthetic, weather and holidays are real",
    refuse: "I can't help with that. I can help with:",
    service: (n: string) => `Service dryer ${n}`,
    kwhVsNormal: (n: string, c: number, b: number, d: string) => `${n} uses ${c.toFixed(2)} kWh per cycle vs its normal ${b.toFixed(2)} (${d})`,
    minutes: (b: number, c: number, d: string) => `Cycles ${d} longer (${b.toFixed(0)} → ${c.toFixed(0)} min)`,
    peers: (d: string) => `Other dryers of the same type: ${d}`,
    gasNote: "Gas dryer: longer cycles point to an airflow, lint or burner problem",
    lpg: (x: number) => `LPG cost assumed at RM${x} per dryer-minute (to confirm with your supplier)`,
    baseline: (b: string, c: string) => `Normal level = the baseline week ${b}; compared with ${c}`,
    noFault: "No dryer is wasting energy",
    learned: (n: number) => `Normal levels learned for ${n} dryers; I'll compare against them from next week`,
    learnedEv: (n: string, k: string, m: number) => `${n}: ${k}${m.toFixed(0)} min per cycle`,
    declined: (type: string, d: string) => `You declined "${type}" on ${d}, so it is not proposed again`,
    mv: { verified: (n: string, x: number) => `Servicing ${n} saved RM${x}/month`, not_yet: (n: string) => `Too early to tell whether servicing ${n} worked`,
      not_achieved: (n: string) => `Servicing ${n} has not delivered the saving yet` },
    predicted: (p: number, r: number, s: number) => `Predicted RM${p} vs actual RM${r} (${s}% of prediction)`,
    level: (n: string, a: number, b: number, pa: number, pb: number, u: string) => `${n}: ${a.toFixed(2)} → ${b.toFixed(2)} ${u} per cycle; other dryers ${pa.toFixed(2)} → ${pb.toFixed(2)}`,
    band: (x: number) => `Uncertainty band ± RM${x}/month`,
    peersNote: "Compared against your other dryers, so weather and customer numbers don't skew it",
    nextCheck: (gas: boolean) => gas ? "Next check: the vent and lint path, then the burner" : "Next check: the vent and lint filter, then the heater element",
    notServiced: (n: string) => `No service recorded for ${n} since the advice`,
    servicedOn: (d: string, days: number) => `Serviced ${d}; ${days} days of data since`,
    predictedSource: "Prediction re-derived from the baseline (no approval found in memory)",
    briefing: (d: string) => `Weekly briefing, ${d}`,
    weekShare: (p: string, d: number) => `Peak share last week ${p} (${d >= 0 ? "+" : "−"}${Math.abs(d).toFixed(1)} pts)`,
    pending: (n: number) => (n ? `${n} action${n > 1 ? "s" : ""} waiting for your approval` : "Nothing waiting for your approval"),
    auto: "Prepared automatically by SmartFlux agents; no question was asked",
    promo: (d: string, h: number) => `Run an off-peak promo on ${d}s from ${h}:00`,
    promoEv: (p: number, s: number, idle: number) => [`${p.toFixed(0)} dryer cycles a week start in peak hours`, `A promo could move about ${s.toFixed(1)} of them a week`, `${idle.toFixed(0)}% of dryer time is idle in that slot`],
    promoNotes: (r: number) => [`Assumes ${(r * 100).toFixed(0)}% of peak dryer customers respond to the promo`, "The saving applies on the ToU tariff; on the flat tariff shifting changes nothing in RM, but it frees peak capacity"],
    promoResult: { verified: (n: string, x: number) => `The ${n} promo moved use off-peak: +${x.toFixed(1)} pts`, not_yet: (n: string) => `Too early to tell whether the ${n} promo worked`,
      not_achieved: (n: string) => `The ${n} promo has not moved use off-peak yet` },
    promoResultEv: (o: number, p: number) => [`Off-peak share at this outlet ${o >= 0 ? "+" : ""}${o.toFixed(1)} pts; at the other outlets ${p >= 0 ? "+" : ""}${p.toFixed(1)} pts`, "Compared against your other outlets, so weather and holidays don't skew it"],
    noFaultEv: (n: number) => `All ${n} dryers are within their normal range`,
    reports: (n: number, r: string) => `Customers also reported it (${n}×: ${r})`,
    reportsUnconfirmed: (names: string) => `Customer reports on ${names}: the meter data doesn't show a fault, so nothing is flagged`,
    bill: (d: string) => `Energy use ${d} per day vs the baseline week`,
    billEv: (b: number, c: number) => `${b.toFixed(0)} → ${c.toFixed(0)} kWh per day`,
    cause: (t: string) => `Cause: ${t}`,
    faultCause: (n: string, kwh: number) => `dryer ${n}, about ${kwh.toFixed(1)} kWh/day extra`,
    plan: { solar_flat: (k: number) => `Install ${k} kWp solar, stay on your current tariff`, solar_tou: (k: number) => `Install ${k} kWp solar and switch to ToU`,
      tou: () => "Switch to ToU; solar doesn't pay back here", flat: () => "Stay on your current tariff; solar doesn't pay back here" },
    noRoof: (v: string) => `No roof space for solar: ${lcFirst(v)}`,
    option: (k: number, s: number, p: number, u: number) => `${k} kWp: saves RM${s}/month, payback ${p.toFixed(1)} years, ${u.toFixed(0)}% of solar used on site`,
    without: (v: string, x: number) => `Without solar: ${lcFirst(v)} (ToU ${x >= 0 ? `saves RM${x}` : `costs RM${-x} more`})`,
    withSolar: (x: number) => x > 0 ? `With solar: stay on flat; ToU would cost RM${x} more` : `With solar: ToU saves RM${-x}`,
    share: (a: string, b: string, be: string) => `Peak share ${a} → ${b} after solar (break-even ${be}): solar removes mostly off-peak use`,
    overlap: (a: number, b: number, c: number) => `Adding both savings (RM${a} + RM${b} = RM${c}): they overlap`,
    bigger: (from: number, to: number, p: number) => `${to} kWp: the extra ${to - from} kWp pays back in ${Number.isFinite(p) ? p.toFixed(1) : "never"} years, beyond the ${SCHEME_TERM_YEARS}-year Solar ATAP term`,
    solarCost: (c: number, d: number) => `Installed cost RM${c} per kWp, derate ${d} (installer quotes to confirm)`,
    exports: "Exported solar valued at RM0 (credit terms vary; confirm under Solar ATAP)",
    radiation: "Generation from real hourly radiation at the outlet (Open-Meteo)",
  },
  ms: {
    switch: "Tukar ke tarif ToU", switch_with_caution: "Tukar ke ToU, dengan berhati-hati", stay: "Kekal dengan tarif rata semasa",
    peak: (p: string, b: string) => `Bahagian waktu puncak ${p} berbanding titik pulang modal ${b}`,
    worst: (w: number, p: string) => `Minggu terburuk (minggu ${w}): ${p} dalam waktu puncak`,
    costs: (t: number, f: number) => `ToU RM${t}/bulan berbanding tarif rata RM${f}/bulan`,
    ruledStay: (x: number) => `Kekal dengan tarif rata: kos RM${x} lebih sebulan`,
    ruledSwitch: "Tukar ke ToU: bahagian waktu puncak anda melebihi titik pulang modal",
    cautionNote: "Sekurang-kurangnya satu minggu melebihi titik pulang modal; semak sebelum menukar",
    rates: (r: { peak: number; offpeak: number; flat: number }) => `Kadar digunakan: puncak RM${r.peak}, luar puncak RM${r.offpeak}, rata RM${r.flat} sekWj (semua termasuk; sahkan dengan jadual TNB)`,
    flat: (x: number) => `Kadar rata digunakan: RM${x} sekWj (semua termasuk; sahkan dengan jadual TNB)`,
    solar: "Solar tidak dipertimbangkan di sini; tanya \"Solar, ToU atau kedua-duanya?\"",
    synthetic: "Data contoh: data perniagaan adalah sintetik, cuaca dan cuti adalah sebenar",
    refuse: "Saya tidak dapat membantu dengan itu. Saya boleh membantu dengan:",
    service: (n: string) => `Servis pengering ${n}`,
    kwhVsNormal: (n: string, c: number, b: number, d: string) => `${n} guna ${c.toFixed(2)} kWj setiap kitaran berbanding biasa ${b.toFixed(2)} (${d})`,
    minutes: (b: number, c: number, d: string) => `Kitaran ${d} lebih lama (${b.toFixed(0)} → ${c.toFixed(0)} minit)`,
    peers: (d: string) => `Pengering lain jenis sama: ${d}`,
    gasNote: "Pengering gas: kitaran lebih lama menunjukkan masalah aliran udara, habuk atau penunu",
    lpg: (x: number) => `Kos LPG dianggap RM${x} setiap minit pengering (sahkan dengan pembekal)`,
    baseline: (b: string, c: string) => `Tahap biasa = minggu asas ${b}; dibandingkan dengan ${c}`,
    noFault: "Tiada pengering yang membazir tenaga",
    learned: (n: number) => `Tahap biasa dipelajari untuk ${n} pengering; saya akan membandingkan mulai minggu depan`,
    learnedEv: (n: string, k: string, m: number) => `${n}: ${k}${m.toFixed(0)} minit setiap kitaran`,
    declined: (type: string, d: string) => `Anda menolak "${type}" pada ${d}, jadi ia tidak dicadangkan lagi`,
    mv: { verified: (n: string, x: number) => `Servis ${n} menjimatkan RM${x}/bulan`, not_yet: (n: string) => `Terlalu awal untuk tahu sama ada servis ${n} berkesan`,
      not_achieved: (n: string) => `Servis ${n} belum memberi penjimatan` },
    predicted: (p: number, r: number, s: number) => `Jangkaan RM${p} berbanding sebenar RM${r} (${s}% daripada jangkaan)`,
    level: (n: string, a: number, b: number, pa: number, pb: number, u: string) => `${n}: ${a.toFixed(2)} → ${b.toFixed(2)} ${u} setiap kitaran; pengering lain ${pa.toFixed(2)} → ${pb.toFixed(2)}`,
    band: (x: number) => `Julat ketidakpastian ± RM${x}/bulan`,
    peersNote: "Dibandingkan dengan pengering lain anda, jadi cuaca dan bilangan pelanggan tidak menjejaskannya",
    nextCheck: (gas: boolean) => gas ? "Semakan seterusnya: saluran udara dan habuk, kemudian penunu" : "Semakan seterusnya: saluran udara dan penapis habuk, kemudian elemen pemanas",
    notServiced: (n: string) => `Tiada rekod servis untuk ${n} sejak cadangan`,
    servicedOn: (d: string, days: number) => `Diservis ${d}; ${days} hari data sejak itu`,
    predictedSource: "Jangkaan dikira semula daripada tahap asas (tiada kelulusan dalam memori)",
    briefing: (d: string) => `Taklimat mingguan, ${d}`,
    weekShare: (p: string, d: number) => `Bahagian waktu puncak minggu lepas ${p} (${d >= 0 ? "+" : "−"}${Math.abs(d).toFixed(1)} mata)`,
    pending: (n: number) => (n ? `${n} tindakan menunggu kelulusan anda` : "Tiada yang menunggu kelulusan anda"),
    auto: "Disediakan secara automatik oleh ejen SmartFlux; tiada soalan ditanya",
    promo: (d: string, h: number) => `Adakan promosi luar puncak pada hari ${({ Sunday: "Ahad", Monday: "Isnin", Tuesday: "Selasa", Wednesday: "Rabu", Thursday: "Khamis", Friday: "Jumaat", Saturday: "Sabtu" } as Record<string, string>)[d] ?? d} dari ${h}:00`,
    promoEv: (p: number, s: number, idle: number) => [`${p.toFixed(0)} kitaran pengering seminggu bermula dalam waktu puncak`, `Promosi boleh memindahkan kira-kira ${s.toFixed(1)} daripadanya seminggu`, `${idle.toFixed(0)}% masa pengering kosong dalam slot itu`],
    promoNotes: (r: number) => [`Dianggap ${(r * 100).toFixed(0)}% pelanggan pengering waktu puncak menyahut promosi`, "Penjimatan hanya untuk tarif ToU; dengan tarif rata, ia tidak mengubah RM tetapi membebaskan kapasiti waktu puncak"],
    promoResult: { verified: (n: string, x: number) => `Promosi ${n} memindahkan penggunaan ke luar puncak: +${x.toFixed(1)} mata`, not_yet: (n: string) => `Terlalu awal untuk tahu sama ada promosi ${n} berkesan`,
      not_achieved: (n: string) => `Promosi ${n} belum memindahkan penggunaan ke luar puncak` },
    promoResultEv: (o: number, p: number) => [`Bahagian luar puncak di premis ini ${o >= 0 ? "+" : ""}${o.toFixed(1)} mata; di premis lain ${p >= 0 ? "+" : ""}${p.toFixed(1)} mata`, "Dibandingkan dengan premis lain anda"],
    noFaultEv: (n: number) => `Kesemua ${n} pengering dalam julat biasa`,
    reports: (n: number, r: string) => `Pelanggan turut melaporkannya (${n}×: ${r})`,
    reportsUnconfirmed: (names: string) => `Laporan pelanggan tentang ${names}: data meter tidak menunjukkan kerosakan, jadi tiada yang dibenderakan`,
    bill: (d: string) => `Penggunaan tenaga ${d} sehari berbanding minggu asas`,
    billEv: (b: number, c: number) => `${b.toFixed(0)} → ${c.toFixed(0)} kWj sehari`,
    cause: (t: string) => `Punca: ${t}`,
    faultCause: (n: string, kwh: number) => `pengering ${n}, kira-kira ${kwh.toFixed(1)} kWj/hari lebih`,
    plan: { solar_flat: (k: number) => `Pasang solar ${k} kWp, kekal dengan tarif semasa`, solar_tou: (k: number) => `Pasang solar ${k} kWp dan tukar ke ToU`,
      tou: () => "Tukar ke ToU; solar tidak berbaloi di sini", flat: () => "Kekal dengan tarif semasa; solar tidak berbaloi di sini" },
    noRoof: (v: string) => `Tiada ruang bumbung untuk solar: ${lcFirst(v)}`,
    option: (k: number, s: number, p: number, u: number) => `${k} kWp: jimat RM${s}/bulan, pulang modal ${p.toFixed(1)} tahun, ${u.toFixed(0)}% tenaga solar digunakan di premis`,
    without: (v: string, x: number) => `Tanpa solar: ${lcFirst(v)} (ToU ${x >= 0 ? `jimat RM${x}` : `kos RM${-x} lebih`})`,
    withSolar: (x: number) => x > 0 ? `Dengan solar: kekal tarif rata; ToU kos RM${x} lebih` : `Dengan solar: ToU jimat RM${-x}`,
    share: (a: string, b: string, be: string) => `Bahagian waktu puncak ${a} → ${b} selepas solar (titik pulang modal ${be})`,
    overlap: (a: number, b: number, c: number) => `Menjumlahkan kedua-dua penjimatan (RM${a} + RM${b} = RM${c}): ia bertindih`,
    bigger: (from: number, to: number, p: number) => `${to} kWp: tambahan ${to - from} kWp pulang modal dalam ${Number.isFinite(p) ? p.toFixed(1) : "tidak pernah"} tahun, melebihi tempoh ${SCHEME_TERM_YEARS} tahun Solar ATAP`,
    solarCost: (c: number, d: number) => `Kos pemasangan RM${c} setiap kWp, derate ${d} (sahkan dengan sebut harga)`,
    exports: "Tenaga solar yang dieksport dinilai RM0 (terma kredit berbeza)",
    radiation: "Penjanaan daripada sinaran sebenar setiap jam di premis (Open-Meteo)",
  },
};

const range = (w: { from: string; to: string }) => `${fmt(w.from)}–${fmt(new Date(Date.parse(w.to) - 86400000).toISOString().slice(0, 10))}`;

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

function faultCard(claim: Claim, ruledOut: string[], lang: Lang): Decision {
  const t = TEXT[lang], f = claim.data as FaultResult & Record<string, any>;
  const gas = f.heat_source === "gas";
  const minDelta = sign((f.minutes.current / f.minutes.baseline - 1) * 100);
  return {
    type: "machine_fault", verdict: t.service(f.name), rm_per_month: rm(f.waste_rm_per_month),
    confidence: gas || f.duration_support ? "high" : "medium",
    evidence: [
      gas ? t.minutes(f.baseline, f.current, sign(f.delta_pct)) : t.kwhVsNormal(f.name, f.current, f.baseline, sign(f.delta_pct)),
      ...(gas ? [t.gasNote] : [t.minutes(f.minutes.baseline, f.minutes.current, minDelta)]),
      t.peers(sign(f.peer_delta_pct)),
      ...(f.customer_reports?.length ? [t.reports(f.customer_reports.length, [...new Set(f.customer_reports)].join(", ").replace(/_/g, " "))] : []),
    ],
    ruled_out: ruledOut,
    assumptions: [t.baseline(range(f.windows.baseline), range(f.windows.current)), gas ? t.lpg(f.lpg) : t.flat(f.rate), t.synthetic],
  };
}

function energyCard(claim: Claim, rejected: Claim[], lang: Lang): Decision {
  const t = TEXT[lang], d = claim.data, solar = d.solar as SolarResult, grid = d.grid as TouResult;
  const assumptions = [t.rates(grid.rates), t.synthetic];
  if (d.composition === "grid_only") return {
    type: "energy_plan", verdict: solar.possible ? (grid.verdict === "stay" ? t.plan.flat() : t.plan.tou()) : t.noRoof(t[grid.verdict]),
    rm_per_month: rm(Math.max(0, grid.saving_per_month)), confidence: grid.weeks.length >= 4 ? "high" : "medium",
    evidence: [t.peak(pct(grid.peak_share), pct(grid.breakeven)), ...solar.options.map((o) => t.option(o.kwp, rm(o.saving_flat_rm_per_month), o.payback_years, o.self_use_share * 100))],
    ruled_out: solar.marginal.filter((m) => m.payback_years > SCHEME_TERM_YEARS).map((m) => t.bigger(m.from, m.to, m.payback_years)), assumptions,
  };
  const j = d.joint as JointResult, kwp = d.kwp as number;
  const opt = solar.options.find((o) => o.kwp === kwp)!;
  const best = j.best.option as keyof typeof t.plan;
  return {
    type: "energy_plan", verdict: t.plan[best](kwp), rm_per_month: rm(j.best.saving_rm_per_month), confidence: grid.weeks.length >= 4 ? "high" : "medium",
    evidence: [
      t.option(kwp, rm(opt.saving_flat_rm_per_month), opt.payback_years, opt.self_use_share * 100),
      t.without(t[grid.verdict], rm(grid.saving_per_month)),
      t.withSolar(rm(j.tou_after_solar_rm_per_month!)),
      t.share(pct(j.peak_share.grid), pct(j.peak_share.post_solar!), pct(j.breakeven)),
      ...solar.options.filter((o) => o.kwp !== kwp).map((o) => t.option(o.kwp, rm(o.saving_flat_rm_per_month), o.payback_years, o.self_use_share * 100)),
    ],
    ruled_out: [
      ...rejected.filter((c) => c.data.composition === "sum" && c.data.tou_saving > 0).map((c) => t.overlap(rm(c.data.tou_saving), rm(c.data.solar_saving), rm(c.data.total))),
      ...solar.marginal.filter((m) => m.payback_years > SCHEME_TERM_YEARS).map((m) => t.bigger(m.from, m.to, m.payback_years)),
    ],
    assumptions: [t.solarCost(solar.params.cost_rm_per_kwp, solar.params.derate), t.exports, t.radiation, ...assumptions],
  };
}

export function reporter(state: RunState, ctx: Ctx) {
  const t = TEXT[state.lang];
  if (state.refused) {
    ctx.emit({ agent_name: "Reporter", action: "refuse", input_summary: state.question, output_summary: `${t.refuse} ${CAPABILITIES.length} capabilities listed` });
    return `${t.refuse}\n- ${CAPABILITIES.join("\n- ")}`;
  }
  const approved = state.claims.filter((c) => c.status === "approved");
  const ruledOut = state.hypotheses.filter((h) => h.status === "rejected" && h.reason).map((h) => `${h.text}: ${h.reason}`);
  // Every proposed action is remembered with its prediction; advice the owner already declined is not re-proposed.
  const propose = (type: string, target: string, reason: string, predicted?: number) => {
    const declined = priorRejection(state, ctx, type, target);
    if (declined) return state.decisions.at(-1)?.assumptions.unshift(t.declined(type, fmt(declined.as_of)));
    const action = { id: `${state.run_id}-a${state.actions.length + 1}`, type, target, reason, risk: ACTION_RISK[type], status: gate(type) === "auto" ? "approved" as const : "awaiting_approval" as const };
    state.actions.push(action);
    rememberAdvice(state, ctx, action, predicted);
  };

  const bill = approved.find((c) => c.kind === "bill");
  if (bill) {
    const causes = approved.filter((c) => c.kind === "fault" && !c.data.none).map((c) => t.cause(t.faultCause(c.data.name, (c.data.current - c.data.baseline) * c.data.cycles_per_month / (365.25 / 12))))
      .concat(approved.filter((c) => c.kind === "humidity" || c.kind === "traffic" || c.kind === "holiday").map((c) => t.cause(c.text)));
    state.decisions.push({
      type: "bill_explanation", verdict: t.bill(sign(bill.data.delta_pct)), confidence: causes.length ? "high" : "medium",
      evidence: [t.billEv(bill.data.kwh_per_day.baseline, bill.data.kwh_per_day.current), ...causes],
      ruled_out: ruledOut, assumptions: [t.baseline(range(bill.data.windows.baseline), range(bill.data.windows.current)), t.synthetic],
    });
  }
  for (const claim of approved) {
    if (claim.kind === "energy") {
      const card = energyCard(claim, state.claims.filter((c) => c.hypothesis_id === claim.hypothesis_id && c.status === "rejected"), state.lang);
      state.decisions.push(card);
      const best = claim.data.joint?.best.option ?? (claim.data.grid.verdict === "stay" ? "flat" : "tou");
      if (best.startsWith("solar")) propose("request_solar_quote", `${state.outlet_id} ${claim.data.kwp} kWp`, `${claim.data.kwp} kWp saves about RM${card.rm_per_month}/month`, card.rm_per_month);
      if (best.endsWith("tou")) propose("switch_tariff", state.outlet_id, "ToU is cheaper for this load");
    } else if (claim.kind === "tou") {
      state.decisions.push(tariffCard(claim, state.lang));
      const r = claim.data as TouResult;
      if (r.verdict !== "stay") propose("switch_tariff", state.outlet_id, `ToU saves about RM${rm(r.saving_per_month)}/month`, r.saving_per_month);
    } else if (claim.kind === "shift") {
      const d = claim.data;
      state.decisions.push({ type: "load_shift", verdict: t.promo(d.slot.day, d.slot.hour), rm_per_month: rm(d.saving_rm_per_month), confidence: "medium",
        evidence: t.promoEv(d.peak_dryer_cycles_per_week, d.shiftable_cycles_per_week, d.slot.idle_share * 100), ruled_out: [], assumptions: [...t.promoNotes(d.promo_response), t.synthetic] });
      propose("run_promo", `${d.slot.day} ${d.slot.hour}:00`, `moves about ${d.shiftable_cycles_per_week.toFixed(1)} dryer cycles a week off-peak`, d.saving_rm_per_month);
    } else if (claim.kind === "verify" && claim.data.promo) {
      const d = claim.data, r = d.result;
      state.decisions.push({ type: "verification", verdict: t.promoResult[r.verdict as keyof typeof t.promoResult](d.name, r.offpeak_share_change_pts), confidence: r.verdict === "verified" ? "high" : "medium",
        evidence: t.promoResultEv(r.outlet_change_pts, r.peer_change_pts), ruled_out: [], assumptions: [t.synthetic] });
      rememberOutcome(state, ctx, d.action_id, { name: d.name, promo: true, verdict: r.verdict, offpeak_share_change_pts: r.offpeak_share_change_pts }, `Outcome of ${d.action_id}: promo ${r.verdict}, off-peak share ${r.offpeak_share_change_pts.toFixed(1)} pts vs other outlets`);
    } else if (claim.kind === "verify") {
      const d = claim.data, mv = d.mv as MvResult;
      const gas = d.heat_source === "gas";
      const ev = d.serviced_on ? [
        t.predicted(rm(mv.predicted_rm_per_month), rm(mv.realised_rm_per_month), Math.round(mv.share_of_prediction * 100)),
        t.level(d.name, d.readings.machine.pre.value, d.readings.machine.post.value, d.readings.peers.pre.value, d.readings.peers.post.value, gas ? "min" : "kWh"),
        t.band(rm(mv.band_rm_per_month)), t.servicedOn(fmt(d.serviced_on), mv.post_days), t.peersNote,
      ] : [t.notServiced(d.name)];
      state.decisions.push({
        type: "verification", verdict: t.mv[mv.verdict as keyof typeof t.mv](d.name, rm(mv.realised_rm_per_month)), rm_per_month: mv.verdict === "verified" ? rm(mv.realised_rm_per_month) : undefined,
        confidence: mv.verdict === "verified" ? "high" : "medium", evidence: ev, ruled_out: [],
        assumptions: [...(d.predicted_source === "re-derived" ? [t.predictedSource] : []), ...(mv.verdict === "not_achieved" ? [t.nextCheck(gas)] : []), gas ? t.lpg(d.unit_cost) : t.flat(d.unit_cost), t.synthetic],
      });
      if (d.action_id && d.serviced_on)
        rememberOutcome(state, ctx, d.action_id, { name: d.name, verdict: mv.verdict, realised_rm_per_month: mv.realised_rm_per_month, predicted_rm_per_month: mv.predicted_rm_per_month, band_rm_per_month: mv.band_rm_per_month },
          `Outcome of ${d.action_id}: ${mv.verdict}, realised RM${rm(mv.realised_rm_per_month)}/month vs predicted RM${rm(mv.predicted_rm_per_month)}`);
    } else if (claim.kind === "fault" && claim.data.learned) {
      const rs = claim.data.readings as any[];
      state.decisions.push({ type: "machine_fault", verdict: t.learned(rs.length), confidence: "high",
        evidence: rs.map((r) => t.learnedEv(r.name, r.kwh_baseline && r.heat_source === "electric" ? `${r.kwh_baseline.value.toFixed(2)} kWh, ` : "", r.minutes.baseline)),
        ruled_out: [], assumptions: [t.synthetic] });
    } else if (claim.kind === "fault" && claim.data.none) {
      state.decisions.push({ type: "machine_fault", verdict: t.noFault, confidence: "high", evidence: [t.noFaultEv(claim.data.faults.length), ...(claim.data.unconfirmed_reports?.length ? [t.reportsUnconfirmed(claim.data.unconfirmed_reports.join(", "))] : [])], ruled_out: [],
        assumptions: [t.baseline(range(claim.data.windows.baseline), range(claim.data.windows.current)), t.synthetic] });
    } else if (claim.kind === "fault") {
      state.decisions.push(faultCard(claim, ruledOut, state.lang));
      propose("schedule_service", claim.data.machine_id, `${claim.data.name} wastes about RM${rm(claim.data.waste_rm_per_month)}/month`, claim.data.waste_rm_per_month);
    }
  }
  if (state.briefing) {
    const tou = approved.find((c) => c.kind === "tou")?.data as TouResult | undefined;
    const w = tou?.weeks ?? [];
    const bullets = [
      ...recentOutcomes(state, ctx).filter(() => !state.decisions.some((d) => d.type === "verification"))
        .map((o) => o.data.promo ? t.promoResult[o.data.verdict as keyof typeof t.promoResult](o.data.name, o.data.offpeak_share_change_pts) : t.mv[o.data.verdict as keyof typeof t.mv](o.data.name, rm(o.data.realised_rm_per_month))),
      ...state.decisions.map((d) => d.verdict + (d.rm_per_month && !d.verdict.includes("RM") ? ` (RM${d.rm_per_month}/month)` : "")),
    ];
    if (w.length >= 2) bullets.push(t.weekShare(pct(w.at(-1)!.peak_share), (w.at(-1)!.peak_share - w.at(-2)!.peak_share) * 100));
    bullets.push(t.pending(pendingApprovals(state, ctx).length));
    const monday = new Date(`${addDays(state.as_of, 1)}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
    state.decisions.unshift({ type: "briefing", verdict: t.briefing(monday), confidence: "high", evidence: bullets, ruled_out: [], assumptions: [t.auto, t.synthetic] });
  }
  if (state.analysis?.machines?.baseline_source === "computed" && approved.some((c) => c.kind === "fault"))
    writeBaselines(state, ctx, state.analysis.machines);
  ctx.emit({
    agent_name: "Reporter", action: "report",
    input_summary: `${approved.length} approved claims, lang=${state.lang}`,
    output_summary: `${state.decisions.length} decisions: ${state.decisions.map((d) => d.verdict).join("; ") || "none"}; ${state.actions.length} actions awaiting approval; ${state.unresolved.length} unresolved`,
  });
  return undefined;
}
