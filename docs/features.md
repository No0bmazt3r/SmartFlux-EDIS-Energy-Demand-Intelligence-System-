# SmartFlux EDIS: Features for Mobile and Web (for mock designs)

**For:** Dina and anyone drafting mockups (Google Stitch, Figma).
**Read with:** [design-system.md](design-system.md) (colours, fonts, components) and [prd.md](prd.md) (requirements).

> **Who uses what?** One mobile app serves two roles: the **laundromat owner** (the person who pays for SmartFlux) and the **walk-in customer** (sees which machines are free, in use or under maintenance). The role picked at login decides which screens appear ([§A.4](#a4-customer-view-same-app-customer-role), [§A.5](#a5-roles-and-access-rbac)). The web is for the **SmartFlux admin** (franchise operator) who looks after many outlets.

| Surface | User | Device | Size to design at |
| --- | --- | --- | --- |
| **Mobile app**, owner role | Laundromat owner | Phone, installable web app (PWA) | 390 × 844 (also check 360 wide) |
| **Mobile app**, customer role | Walk-in laundry customer | Phone, opened from a QR code at the outlet | 390 × 844 (also check 360 wide) |
| **Admin web** | SmartFlux admin / franchise operator | Laptop | 1440 × 900 (content max 1280) |

Style for every screen: dark theme, background `#0F061E`, cards `#1C1230` / `#2A1F42`, primary purple `#9D4EDD`, orange `#FF9100` for peak/money at stake/main action, peach `#FFC880` for savings. Headlines Plus Jakarta Sans, body Inter, labels and numbers JetBrains Mono. Rounded cards (16 px), pill bottom nav.

Priority: **Must** = needed for the demo video. **Should** = design it if time allows. **Could** = optional.

---

## Part A: Owner app (mobile)

### A.0 Screen map

```text
Login ──► Home ──┬──► Briefing detail
                 ├──► Energy plan ──► Evidence
                 ├──► Decision card ──► Evidence
                 ├──► Machines ──► Machine detail
                 ├──► Approvals ──► Action detail
                 └──► Ask ──► (agent working) ──► Decision card
Bottom nav (always visible): Home · Ask · Machines · Approvals (badge)
Top bar: outlet switcher (OUT-01 ▾), language toggle EN / BM
```

### A.1 Feature list

| # | Feature | What the owner can do | Priority |
| --- | --- | --- | --- |
| M1 | Demo login | Pick "Owner" and sign in (no real password) | Must |
| M2 | Outlet switcher | Switch between their outlets (Ipoh, Shah Alam, Johor Bahru) | Must |
| M3 | Monday briefing | Read what changed this week without asking anything | Must |
| M4 | Energy summary | See this month's kWh, RM spent and projected bill | Must |
| M5 | Alerts | See flagged machines and things needing a decision | Must |
| M6 | Energy plan (solar + tariff) | See the recommended solar size, payback, and whether to switch tariff before and after solar | Must |
| M7 | Ask the agent | Type a question (English or Malay) or tap a suggested one | Must |
| M8 | Agent progress | Watch the agent work (Planning → Checking data → Skeptic reviewing → Done) | Must |
| M9 | Decision card | Read the verdict, RM impact, confidence, what was ruled out | Must |
| M10 | Evidence | See which agent did what, the data queries, the numbers, the Skeptic's check, the AI model used | Must |
| M11 | Approvals | Approve or reject actions (service a machine, run a promo, request a solar quote) | Must |
| M12 | Did it work? | See predicted vs actual saving after an approved action | Must |
| M13 | Machines list | See every machine with energy per cycle, status and cost vs price per cycle | Must |
| M14 | Machine detail | See a machine's trend vs its normal level, service history and verified savings | Should |
| M15 | Language | Switch the whole app between English and Bahasa Melayu | Should |
| M16 | Admin banner | See a message posted by the admin (e.g. maintenance notice) | Could |

### A.2 Screens

#### Screen M-01: Login — Must

- SmartFlux logo, tagline "Know what to save, and prove it worked."
- Three big buttons: **Continue as Customer**, **Continue as Owner**, **Continue as Admin** (demo login, no password; Admin opens the web layout)
- Small text: "Demo mode — sample data"

#### Screen M-02: Home — Must

Top to bottom:

1. **Top bar:** "SmartFlux", outlet switcher chip `OUT-01 Ipoh ▾`, language toggle `EN | BM`
2. **Briefing card** (purple gradient `#5A189A → #3C096C`):
   - Label `MON 19 OCT · WEEKLY BRIEFING`
   - 3 bullets: "Servicing D4 saved RM64.65/month" · "No dryer is wasting energy" · "Nothing waiting for approval"
   - Button **Open**
3. **This month:** big number `3,980 kWh` · `RM2,018 so far` · progress bar to projected bill `RM2,027`
4. **Alerts** (horizontal cards, 2 visible):
   - ⚠ "Gas dryer G3 cycles +24% longer" → opens decision
   - ✓ "D4 serviced — saving verified"
5. **Energy plan teaser card:** "Solar could save RM503/month" → opens Energy plan
6. **Verified savings:** "RM64.65/month saved from past advice"
7. **Floating button (FAB):** Ask (sparkle icon)
8. **Bottom nav:** Home (active) · Ask · Machines · Approvals (badge "1")

States: loading skeleton cards; empty state for a new outlet ("Your first briefing arrives next Monday").

#### Screen M-03: Briefing detail — Should

- Date, outlet
- Sections: **What changed** · **What we verified** · **Needs your decision** · each item is a tappable row to its decision card
- "Generated automatically by SmartFlux agents" + link to evidence

#### Screen M-04: Energy plan — Must (the headline screen of the demo)

1. Chip `ENERGY PLAN` · verdict headline: **"Install 10 kWp solar, stay on your current tariff"**
2. Big saving: `RM502.75 /month` (peach) · `Payback ≈ 5.8 years` · confidence badge `● High`
3. **Solar options** (segmented control or small table): 5 / 10 / 15 kWp with monthly saving, payback, % of solar used on site. 10 kWp marked "Recommended"
4. **Tariff before vs after solar** (two mini cards side by side):
   - Without solar: "Switch to ToU — saves RM7.60"
   - With solar: "Stay on flat — ToU would cost RM1.39 more"
   - One-line why: "Solar removes mostly off-peak usage, so your peak share rises from 54.8% to 64.7%, above the 63.6% break-even."
5. **Ruled out:** "Adding both savings (RM510.35) — they overlap" with a ✕ icon
6. **Assumptions** (collapsible): system cost RM3,500/kWp, export valued at RM0, tariff rates used, weather data source
7. Buttons: **Request solar quote (10 kWp)** (orange, goes to Approvals as a financial action) · **Show evidence**

Variant to design: OUT-03 "No roof space for solar — stay on your current tariff."

#### Screen M-05: Ask — Must

- Title "Ask SmartFlux"
- Text box: "Ask about your bill, machines or solar…" (Malay placeholder: "Tanya tentang bil, mesin atau solar…")
- Suggested question chips: "Solar, ToU or both?" · "Why was my bill higher?" · "Which machine is wasting money?" · "Did the D4 service work?"
- Recent questions list

#### Screen M-06: Agent working — Must

Shown after asking (2–60 seconds):

- Step list with live ticks:
  1. ✓ Understanding your question (Scout)
  2. ✓ Planning what to check (Planner)
  3. ⟳ Checking your data (Investigator · Zetaris)
  4. ◻ Double-checking the numbers (Skeptic)
  5. ◻ Writing your answer (Reporter)
- When the Skeptic sends work back, show a small orange note: "Skeptic asked for one more check"
- Cancel button

#### Screen M-07: Decision card — Must

Example (fault):
- Chip `MACHINE FAULT` · headline **"Service dryer D4"**
- `RM48.03 /month wasted` (orange) · confidence `● High`
- **Why:** "Uses 2.8 kWh per cycle vs its normal 2.1 (+33%). Cycles 17% longer. Other dryers only +4%."
- **Ruled out:** "Humid week — other dryers barely changed" · "Malaysia Day traffic — happened before the rise"
- **Proposed action:** "Schedule servicing" + risk badge `OPERATIONAL` → **Go to approval**
- Link **Show evidence**

Other card types to design (same layout): Tariff, Energy plan, Verification ("Did it work?"), Load shift / promo, Emissions.

#### Screen M-08: Evidence — Must

- Header: run time, outlet, mode badge (`LIVE` or `SAMPLE`)
- **Agent timeline** (vertical): each row = agent name (mono) → target agent, what it did, status badge, AI model chip
  - Highlight a "Sent back" row with an orange left bar: "Skeptic: 'RM510.35 adds two overlapping savings' → sent back to Investigator"
- **Data checked:** SQL query block (mono, copy button), rows returned, time taken
- **Numbers:** calculator inputs → outputs table
- **Models used:** Nemotron Lightning, Nemotron Super
- Should feel trustworthy and technical but readable; collapse long blocks

#### Screen M-09: Approvals — Must

- Tabs: **Pending (1)** · History
- Each pending action card: title ("Service dryer D4"), reason, predicted saving, risk badge (`OPERATIONAL` / `FINANCIAL`), **Approve** (orange) and **Reject** (outlined)
- After approve: toast "Approved. We'll check if it worked after 2 weeks."
- History: approved/rejected items with result badge (`Verified`, `Not yet`, `Not achieved`)

#### Screen M-10: Did it work? (verification card) — Must

- Chip `VERIFIED` (green check)
- **"Servicing D4 saved RM64.65/month"**
- Predicted RM48.03 vs actual RM64.65 (bar comparison) · "135% of prediction"
- Small chart: D4 energy per cycle by week (weeks 1–6) with a dashed "normal" line and a marker "Serviced 6 Oct"
- Note: "Compared against your other dryers so weather doesn't skew it."

#### Screen M-11: Machines — Must

- Filter chips: All · Washers · Dryers · Flagged
- Each machine row/card:
  - Name + type icon + heat source chip (`ELECTRIC` / `GAS`)
  - Energy per cycle (e.g. `2.15 kWh`) or minutes per cycle for gas (`52 min`)
  - Status: `OK` / `FLAGGED` / `SERVICED · VERIFIED`
  - **Cost vs price per cycle:** "Costs RM1.09 · You charge RM6.00" (2.15 kWh × RM0.5068)
  - Tiny trend sparkline

#### Screen M-12: Machine detail — Should

- Header: "Dryer D4 · Electric"
- Chart: energy per cycle by week vs normal level (error bars)
- Cycles per day, average minutes
- Service history list
- Advice history: what SmartFlux advised and the result

### A.3 Mobile notes for the designer

- One orange button per screen at most.
- Every status uses icon + text + colour.
- Text never smaller than 14 px; touch targets 44 px.
- Malay text is ~25% longer: leave room.
- Design both a **Live** and **Sample** mode badge (small, top-right of Evidence).

### A.4 Customer view (same app, `customer` role)

The customer sees **availability and approved promos only**: no energy, RM, tariff, agent or approval data. The customer view is where the agent's approved actions reach real people, and where their effect is measured:

| What the customer sees | Where it comes from |
| --- | --- |
| `FREE` / `IN USE · 12 min left` | `machine_status` query template over the payment system's cycle logs at `as_of` (a machine is in use when a cycle spans that time). Runs through **Zetaris** in live mode, SQLite in sample mode, like every other template |
| `UNDER MAINTENANCE` | Only a fault the **Skeptic verified** and the **owner approved** for service, until the service is logged. Unverified or unapproved flags never reach customers |
| Promo banner | Only a promo the agent proposed, the Skeptic checked and the owner approved. The next session's `promo_check` measures whether customers actually shifted (off-peak share change vs the other outlets) and remembers it in H-MEM |
| "Report a problem" | The customer's report is stored in H-MEM as a `customer_report`; the Investigator treats it as extra evidence next to the meter data. It never flags a machine on its own |

```text
QR at outlet / Login (Customer) ──► Machines near me ──► Machine detail ──► Report a problem
Top bar: outlet name (no switcher; one outlet per QR), language toggle EN / BM
No bottom nav (three screens only)
```

**Demo scene (≤ 10 s):** owner taps **Approve** on "Service dryer D4" → the customer phone shows D4 `UNDER MAINTENANCE` → cut to "Did it work? D4 service verified". Second beat if time allows: promo approved → banner on the customer phone → next briefing "off-peak share +6 pts".

| # | Feature | What the customer can do | Priority |
| --- | --- | --- | --- |
| C1 | Demo login / QR entry | Open the outlet's page as Customer (no account) | Must |
| C2 | Machine availability | See each washer and dryer as `FREE` / `IN USE · 12 min left` / `UNDER MAINTENANCE` | Must |
| C3 | Filter | All · Washers · Dryers · Free now | Should |
| C4 | Machine detail | Price per cycle, programs, typical cycle length | Should |
| C5 | Promo banner | See an owner-approved off-peak promo (e.g. "Sat 22:00: RM1 off dryers") | Should |
| C6 | Language | English / Bahasa Melayu | Should |
| C7 | Report a problem | Tap "Not working?" on a machine, pick a reason (won't start, not heating, too long, other) | Could |

#### Screen C-01: Machines near me — Must

- Header: "SmartFlux · OUT-01 Ipoh" · "Updated 18 Oct, 19:30" · mode badge `SAMPLE`
- Summary line: "4 washers free · 2 dryers free"
- Grid of machine tiles (2 columns): name + type icon, status chip with icon + text, minutes left when in use, price ("RM7 · dry")
- `UNDER MAINTENANCE` tile is greyed with a wrench icon, not tappable
- Promo banner at the top when an approved promo is active

#### Screen C-02: Machine detail — Should

- "Dryer D2 · RM7 per cycle" · status chip · programs and typical minutes ("Dry 50 min")
- Text link **Not working?** → C-03

#### Screen C-03: Report a problem — Could

- Reason chips: Won't start · Not heating · Takes too long · Other
- Submit → toast "Thanks, the owner will be told." (no promise that the machine is broken)

### A.5 Roles and access (RBAC)

One login picks the role; the server checks the role on every route, and the UI only hides what the server already refuses.

| Data / action | Customer | Owner | Admin |
| --- | --- | --- | --- |
| Machine availability (own outlet) | ✓ | ✓ | ✓ |
| Active promo | ✓ | ✓ | ✓ |
| Report a problem (own outlet) | ✓ | ✓ | ✕ |
| Energy, RM, machine efficiency, briefings | ✕ | own outlets | all outlets |
| Ask the agent (`POST /run`) | ✕ | own outlets | all outlets |
| Approve / reject actions | ✕ | own outlets | ✕ (view only) |
| Evidence, run log | ✕ | own runs | all runs |
| Scope 2 export, broadcast banner | ✕ | ✕ | ✓ |

---

## Part B: Admin web (desktop)

### B.0 Layout

One page with a top bar and sections. (A left sidebar is optional; one page is enough for the demo.)

```text
┌ Top bar: SmartFlux Admin · "as of 18 Oct 2026" date picker · [Export Scope 2 CSV] · admin ▾ ┐
├ KPI row (5 tiles)                                                                            ┤
├ Outlet energy chart (2/3 width)            │ Advice scoreboard (1/3)                         ┤
├ Flagged machines table (2/3)               │ Run log (1/3)                                   ┤
├ Washer vs dryer split (1/3) │ Outlets table (2/3)                                            ┤
└ Broadcast banner (Could)                                                                     ┘
```

### B.1 Feature list

| # | Feature | What the admin can do | Priority |
| --- | --- | --- | --- |
| W1 | Demo login | Sign in as Admin | Must |
| W2 | KPI tiles | See total load, cost, revenue, margin and verified savings across outlets | Must |
| W3 | Outlet energy chart | Compare peak vs off-peak kWh per outlet per week | Must |
| W4 | Flagged machines | See every flagged machine across outlets with RM waste and approval status | Must |
| W5 | Advice scoreboard | See each approved action's predicted vs verified saving | Must |
| W6 | Run log | See the last 20 agent runs and briefings, open their evidence | Must |
| W7 | Outlets table | See each outlet's tariff verdict, solar recommendation, peak share, flags | Should |
| W8 | Washer vs dryer split | See energy split by machine type per outlet | Should |
| W9 | Scope 2 export | Download a CSV of kWh and emissions per outlet | Should |
| W10 | Date (as of) picker | View the dashboard as of a past date (13 Sep, 4 Oct, 18 Oct) | Should |
| W11 | Run detail | Open a run's evidence (same content as mobile Evidence, wider layout) | Should |
| W12 | Broadcast banner | Post a message that appears in every Owner app | Could |

### B.2 Sections

#### W-01: KPI tiles — Must

Five tiles, each: label (mono, muted), big number (Jakarta), small trend.

| Tile | Example |
| --- | --- |
| Total load (month) | `11.9 MWh` |
| Energy cost | `RM6,040` |
| Revenue | `RM18,200` |
| Margin | `66%` |
| Verified savings | `RM64.65/month` (peach) |

#### W-02: Outlet energy chart — Must

- Stacked bar chart: x = week (1–6) grouped by outlet; segments = **Peak** (orange `#FF9100`) and **Off-peak** (purple `#B375E4`), 2 px gap between segments
- Toggle: kWh / RM
- One-sentence summary above: "OUT-03 uses the most peak energy (70%)."
- "View as table" link

#### W-03: Flagged machines table — Must

| Outlet | Machine | Type | Heat | Change | RM/month | Status |
| --- | --- | --- | --- | --- | --- | --- |
| OUT-02 Shah Alam | G3 | Dryer | Gas | +20% minutes | est. | Awaiting approval |
| OUT-01 Ipoh | D4 | Dryer | Electric | +33% kWh | 182 | Serviced · Verified |

Row click → decision evidence.

#### W-04: Advice scoreboard — Must

List of approved actions:
- "OUT-01 · Service D4 — predicted RM48 → verified RM65 ✓"
- "OUT-01 · Sat 22:00 promo — off-peak share +6 pts ✓"
- "OUT-02 · Service G3 — not yet (needs 2 weeks)"
Total line: "Verified so far: RM64.65/month"

#### W-05: Run log — Must

| Time | Outlet | Type | Verdict | Mode | |
| --- | --- | --- | --- | --- | --- |
| 18 Oct 08:00 | OUT-01 | Briefing | D4 verified | Live | Open → |
| 18 Oct 07:55 | OUT-02 | Ask | Flag G3 | Sample | Open → |

#### W-06: Outlets table — Should

| Outlet | kWh/month | Peak share | Tariff verdict | Solar | Flags |
| --- | --- | --- | --- | --- | --- |
| OUT-01 Ipoh | 3,500 | 58.3% | Stay flat (after solar) | 10 kWp, RM503/mo | 0 |
| OUT-02 Shah Alam | … | … | … | … | 1 |
| OUT-03 Johor Bahru | … | ~70% | Stay flat | No roof | 0 |

#### W-07: Washer vs dryer split — Should

Donut or horizontal bars per outlet: washers vs dryers vs base load (kWh).

#### W-08: Scope 2 export — Should

Button in top bar → modal: choose outlets and period → preview table (outlet, kWh, tCO₂e, factor, method note) → **Download CSV**. Note: "Prepared for the SEDG GHG calculator. SmartFlux does not file reports."

#### W-09: Run detail — Should

Two columns: left = agent timeline (same as mobile Evidence); right = SQL, numbers, final decision cards.

#### W-10: Broadcast banner — Could

Text field + **Post to all owners** button; preview of how the banner looks in the Owner app.

### B.3 Web notes for the designer

- 12-column grid, 24 px gaps, max 1280 px.
- Tables: mono headers, 48 px rows, numbers right-aligned.
- Charts always have a text summary line and a table alternative.
- Keyboard focus ring `#C89CEC` visible on every control.

---

## Part C: Shared components to mock once

Briefing card · Decision card (6 variants) · Risk badge (read-only, advisory, operational, financial) · Status badge (verified, awaiting approval, rejected, not achieved, unresolved) · Agent timeline row (normal and "sent back") · SQL block · KPI tile · Alert card · Machine row · Bottom nav · FAB · Outlet switcher · Language toggle · Mode badge (Live / Sample) · Toast.

## Part D: Sample data to use in mockups

| Item | Value |
| --- | --- |
| Outlets | OUT-01 Ipoh · OUT-02 Shah Alam · OUT-03 Johor Bahru |
| OUT-01 month | 4,000 kWh, RM2,027 on flat tariff, peak share 54.8% |
| Solar (OUT-01) | 10 kWp, RM502.75/month, payback 5.8 years |
| Tariff after solar | Stay on flat (ToU would cost RM1.39 more) |
| Fault | Dryer D4: 2.70 vs 2.15 kWh/cycle (+26%), RM48.03/month |
| Verified | D4 service saved RM64.65/month (135% of prediction) |
| Gas dryer | G3 at OUT-02: cycles +20% longer |
| Dates | Briefing Mon 19 Oct 2026; service 6 Oct; data 7 Sep – 18 Oct |
| Models | Nemotron Lightning, Nemotron Super |

## Part E: Ready-to-paste prompts for Google Stitch

Paste one at a time; attach the palette board image for style.

**Owner Home**
> Mobile app home screen, dark theme, background #0F061E, cards #1C1230 with 16px radius, primary purple #9D4EDD, orange #FF9100 accents, peach #FFC880 for savings. Fonts: Plus Jakarta Sans headlines, Inter body, JetBrains Mono labels. App "SmartFlux" for a laundromat owner. Top bar with outlet switcher chip "OUT-01 Ipoh" and EN/BM toggle. Purple gradient briefing card "MON 19 OCT · WEEKLY BRIEFING" with three bullets and an Open button. "This month 2,131 kWh, RM1,080" with progress bar. Two alert cards: "Gas dryer G3 cycles +24% longer" with warning icon, "D4 serviced — saving verified" with check icon. Card "Solar could save RM503/month". Floating sparkle Ask button. Floating pill bottom nav: Home, Ask, Machines, Approvals with badge 1.

**Energy plan**
> Mobile screen "Energy plan", same dark style. Chip "ENERGY PLAN", headline "Install 10 kWp solar, stay on your current tariff", large peach "RM502.75/month", "Payback ≈ 5.8 years", High confidence badge. Segmented options 5 / 10 / 15 kWp with 10 marked Recommended. Two side-by-side mini cards: "Without solar: switch to ToU, saves RM7.60" and "With solar: stay on flat, ToU costs RM1.39 more". Ruled-out row with X icon: "Adding both savings (RM510.35) — they overlap". Collapsible Assumptions. Orange button "Request solar quote", text link "Show evidence".

**Evidence**
> Mobile screen "Evidence", same dark style. Header with run time and a LIVE badge. Vertical agent timeline rows in monospace: "Scout → Planner ✓", "Planner → Investigator ✓", "Investigator · Zetaris query 412 ms ✓", a highlighted row with orange left bar "Skeptic: RM510.35 adds overlapping savings → sent back", "Investigator: joint calculation ✓", "Skeptic → Reporter ✓". Below: SQL code block with copy button, a numbers table, model chips "Nemotron Lightning", "Nemotron Super".

**Approvals**
> Mobile screen "Approvals", same dark style. Tabs Pending (1) and History. Card "Service dryer D4", reason text, "Predicted saving RM48.03/month", OPERATIONAL badge with wrench icon, orange Approve button and outlined Reject button. History list with Verified (green check) and Not yet (hourglass) badges.

**Customer machines**
> Mobile screen "Machines near me", same dark style. Header "SmartFlux · OUT-01 Ipoh", small "Updated 18 Oct, 19:30" and SAMPLE badge, EN/BM toggle. Peach promo banner "Sat 22:00: RM1 off dryers". Summary "4 washers free · 2 dryers free". Filter chips All, Washers, Dryers, Free now. Two-column grid of machine tiles: "W1 Washer, FREE, RM5" with green check; "D1 Dryer, IN USE · 12 min left" with orange clock; "D4 Dryer, UNDER MAINTENANCE" greyed with wrench icon. No bottom nav.

**Admin dashboard**
> Desktop admin dashboard 1440px, dark theme #0F061E, cards #1C1230, purple #9D4EDD, orange #FF9100, peach #FFC880, Plus Jakarta Sans / Inter / JetBrains Mono. Top bar "SmartFlux Admin", date picker "as of 18 Oct 2026", button "Export Scope 2 CSV". Row of 5 KPI tiles: Total load 4.6 MWh, Energy cost RM2,340, Revenue RM26,345, Margin 91%, Verified savings RM65/month. Left: stacked bar chart of peak (orange) vs off-peak (purple) kWh per outlet per week for 3 outlets. Right: "Advice scoreboard" list with predicted vs verified savings. Below: "Flagged machines" table (outlet, machine, type, heat source, change, RM/month, status) and "Run log" table with Open links.
