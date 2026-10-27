# Demo video guide

How to record the SmartFlux demo video: setup, what to test first, the shot list with clicks and narration, what not to say, and how to upload. Every number below is what the app shows on a fresh `pnpm demo`. If your screen shows something different, stop and reset (see [Retakes](#retakes)).

- **Length:** aim for 3:45. The hard limit is 4:00, and judges stop watching after that.
- **Format:** 1080p (720p minimum), real screen footage, clear voice, no copyrighted music.
- **Deadline:** submit by 27 Oct 12:00 UTC (20:00 Malaysia time). The final cutoff is 23:45 UTC (07:45 Malaysia time, 28 Oct).
- **Gates this video covers:** G11 (video exists, 1–4 min) and half of G14 (Track 3 named). Demo is worth 15 of 100 points.

---

## 1. Setup (once, about 15 minutes)

### Machine

- Node 22.13 or newer, and pnpm. Check with `node -v` and `node -e "require('node:sqlite')"` (it should print nothing).
- From the repo root, run `pnpm install`.
- **No `.env` is needed.** Sample mode runs the real agents on the sample data. If a `.env` exists, check that it contains no keys you'd mind showing, and keep it closed while recording.

### Start the app on a fresh history

```bash
rm -rf data/hmem logs data/users.db   # wipe any earlier demo state (all three are gitignored)
pnpm demo                             # builds the web app, seeds the 8 example sessions, serves http://localhost:8000
```

The terminal should print:

```
Demo history: running the 8 example sessions once (13 Sep → 4 Oct → 18 Oct), so the dashboard isn't empty…
Demo history: 8 runs stored (reasoning: replay, 1 steps used the rules agents). …
SmartFlux API on http://0.0.0.0:8000 (data: local, reasoning: replay)
```

"1 steps used the rules agents" is expected: the weekly briefing's wording step has not been re-recorded since the 26 Oct fix. It doesn't change anything on screen.

### Browser windows

Sign-in is stored per browser profile, so use **separate windows** for the roles:

| Window | Role (one click on the sign-in screen) | Size | Used in scenes |
|---|---|---|---|
| A: normal Chrome window | **Super admin** (Aisyah) | Desktop, maximised, 1440 px or wider | 2, 6, 7 |
| B: Incognito window, DevTools device mode | **Admin** (Hafiz, OUT-01 Ipoh) | iPhone 12 Pro (390 × 844) | 3, 4, 5 |
| C: Guest-profile window, DevTools device mode | **Customer** (Mei) | iPhone 12 Pro (390 × 844) | 6 |

- Device mode: open DevTools (F12), press Ctrl+Shift+M, pick "iPhone 12 Pro" and set zoom to 100%. Then **undock DevTools into a separate window** (⋮ → Dock side → undock) so it doesn't appear in the recording.
- The customer app is phone-only. At desktop width it shows "Open SmartFlux on your phone". That's intended, not a bug.
- After each page loads, wait about a second. If you see words like `check_circle` or `schedule` instead of icons, the icon font hasn't loaded yet; refresh the page.

### Recorder

- **OBS Studio** (free) set to 1920×1080 and 30 fps. Or use the Windows Game Bar (Win+G), which records one window at a time.
- Close Slack, WhatsApp, email and notifications (Windows: Focus assist on).
- Use a headset or quiet room for the voice. If the voice is bad, record the screen silently and add narration afterwards in Clipchamp or CapCut.
- Two short phone-width recordings stitched together are fine. You don't need one continuous take.

---

## 2. Test before you record (10 minutes)

Click through this list once. If any step fails, reset and try again, and message Sharvin if it still fails.

| # | Do this | You should see |
|---|---|---|
| T1 | B (Admin) → Home | "Hello, Hafiz", OUT-01 Ipoh, date **18 Oct 2026**, a purple **Weekly briefing** card: "Servicing D4 saved RM64.65/month", "No dryer is wasting energy", "Stay on your current flat tariff" |
| T2 | B → Home → **Open plan** (Energy plan card) | "Install 10 kWp solar, stay on your current tariff", **RM502.75/month**, payback ≈ 5.8 years, 5 / 10 / 15 kWp options |
| T3 | Scroll the plan | "Tariff without vs with solar": without solar, **Switch to ToU** (saves RM7.6); with solar, **Stay on flat** (ToU would cost RM1.39 more). Under Ruled out: "Adding both savings (RM7.6 + RM502.75 = RM510.35): they overlap" |
| T4 | B → Approvals | Pending **1**: Request solar quote · 10 kWp, RM502.75. Recent decisions: Service dryer D4 **Verified**, Switch to ToU **Withdrawn** |
| T5 | B → Home date picker → **4 Oct** → Machines | D4 flagged: "uses 2.70 kWh per cycle vs its normal 2.15 (+26%)" |
| T6 | A (Super admin) → HQ → **Agent interventions** | The 5-step trace (Scout → Planner → Investigator → **Skeptic: 1 sent back** → Reporter → You), the orange "Sent back" box with **RM510.35**, and two approval cards: **OUT-02 · Service G3** and **OUT-01 · Solar quote** |
| T7 | A → the G3 card | The reason in English: "G3 wastes about RM84.79/month". **Don't click Approve yet**: approving is a scene. |
| T8 | C (Customer) → Outlets → **SmartFlux Shah Alam → Select** | G3 shows **Ready** (free) |
| T9 | Terminal: `pnpm agent --input input_examples/06-energy-plan.json` | JSONL lines scroll by, then a result with "Install 10 kWp solar, stay on your current tariff" |

If you clicked Approve during testing, [reset](#retakes) before the real take.

---

## 3. Shot list (3:45)

Narration is written to be read aloud at a calm pace. You can say it in English or Malay, but keep the on-screen language **EN** except in scene 6, where switching to BM is part of the shot.

### Scene 1 · 0:00–0:15 · The problem (window A, signed out, landing page)

**Show:** `http://localhost:8000/` (the landing page). Scroll slowly once.

**Say:**
> "A laundromat in Malaysia has thirty-odd machines, one TNB bill, and three big questions: should I switch to the ToU tariff, should I install solar, and which machine is wasting money? Today the owner gets a bill and a guess. SmartFlux is our Track 3 agent for that owner."

On-screen text (add when editing): **Track 3 · Reasoning agents**.

### Scene 2 · 0:15–0:40 · How it thinks (window A, HQ → Agent interventions)

**Show:** click **Super admin** on the sign-in screen, then **Agent interventions** in the sidebar. Keep the run picker on "18 Oct · OUT-01 · Install 10 kWp solar…". Point the mouse along the five steps.

**Say:**
> "Five agents work on every question. Scout reads it, the Planner picks what to test, the Investigator runs real queries and calculators, and the Skeptic re-checks every ringgit figure from the data on its own. If it can't verify a claim, it sends the work back. Here it did."

Hover over the orange **Sent back** box (RM7.60 + RM502.75 = RM510.35).

### Scene 3 · 0:40–1:25 · The joint decision, the twist (window B, owner phone)

**Show:** Home → **Open plan**. Go slowly here; this is the strongest scene.

1. Top card: **Install 10 kWp solar, stay on your current tariff, RM502.75/month, payback ≈ 5.8 years**.
2. Solar options: 5 / **10 (Recommended)** / 15 kWp.
3. Scroll to **Tariff without vs with solar**: without solar, ToU saves RM7.6; **with solar, ToU would cost RM1.39 more**.
4. Scroll to **Ruled out**: "RM7.6 + RM502.75 = RM510.35: they overlap".
5. Tap **Show evidence**, scroll the agent timeline to the Skeptic step that says **sent back**, then scroll to **Numbers** (every RM came from a calculator).

**Say:**
> "The owner asks: solar, ToU, or both? Solar saves five hundred and three ringgit a month. But here's the twist: on today's bill ToU looks cheaper, yet once solar covers the afternoon, the peak share goes up and ToU would cost more. So the answer is solar, and stay on the flat tariff. The first draft simply added the two savings together, five hundred and ten ringgit. The Skeptic caught the double count and sent it back. Every number here links to the query and calculator that produced it."

### Scene 4 · 1:25–2:05 · It finds a faulty machine, and remembers (window B)

**Show:** Home → tap the **date** field.

1. Pick **13 Sep**: no advice yet. The agents learn each machine's normal level.
2. Pick **4 Oct** → **Machines** → D4: "**2.70 kWh per cycle vs its normal 2.15 (+26%)**", cycles 53 → 61 min, other dryers +1%.
3. Tap D4, then **Evidence**. Show the Ruled out list: humid weather (other dryers rose only 1.1%), more customers (no), public holiday (no).

**Say:**
> "There are no sub-meters. SmartFlux works out each machine's energy from the meter and the payment system's cycle log. On the thirteenth of September it learned what normal looks like and stored it in memory. Three weeks later, dryer D4 uses twenty-six percent more per cycle. Was it just a humid week? The Skeptic checked: the other dryers barely moved, so it's D4. The owner approved a service."

### Scene 5 · 2:05–2:35 · Did it work? (window B)

**Show:** date back to **18 Oct**.

1. Home: the **Weekly briefing** card arrived unprompted. Tap **Open**.
2. **Approvals → History**: Service dryer D4: **predicted RM48.03 vs actual RM64.65**, Verified. Switch to ToU: **Withdrawn** (the solar plan replaced it).
3. Home: **Verified savings RM64.65/month**.

**Say:**
> "Most tools stop at advice. SmartFlux comes back and checks. Every Monday it briefs the owner without being asked. D4 was serviced, and the measured saving is sixty-four ringgit a month, against forty-eight predicted. And when the solar plan replaced the earlier ToU advice, it withdrew that advice itself, so the owner is never asked to approve two plans that contradict each other."

### Scene 6 · 2:35–3:05 · Approve, and customers see it (windows A and C)

1. **Window A**, HQ → Agent interventions → card **OUT-02 · Service G3** ("G3 wastes about RM84.79/month", gas dryer, cycles +24% longer, 51 → 63 min).
2. Click **BM** in the top bar: the card switches to Malay ("G3 membazir…"). Click **EN** to switch back.
3. Click **Approve**.
4. **Window C** (customer phone): Outlets → **Shah Alam** → G3 now shows a **Maintenance** badge (it showed **Ready** before).

**Say:**
> "Nothing reaches a machine, a customer or TNB until a person approves it. This one is a gas dryer, found from cycle times alone, and the app works in English and Malay. The owner approves, and customers at Shah Alam immediately see G3 as under maintenance, so nobody wastes a trip."

### Scene 7 · 3:05–3:30 · HQ for the franchise (window A)

Click through quickly, about 5 seconds each:

1. **Overview**: verified savings RM64.65/mo, the daily load with the TNB peak window shaded. Click **Export Scope 2 CSV**.
2. **Agent interventions**: scroll to the **Advice scoreboard** (predicted vs verified, Withdrawn, Awaiting).
3. **Data and AI**: queries, model calls and Skeptic send-backs counted from the run logs.
4. **Audit log**: who approved what, and when.

**Say:**
> "For the franchise owner, HQ shows every outlet: what the agent advised, what was approved, what was measured afterwards, and a Scope 2 carbon export that SMEs are now being asked for."

Don't stop on the **Outlets** table at the bottom of the Overview. Its "Tariff verdict" column shows the grid-only verdict (Switch to ToU) next to the solar plan, and a judge may read that as a contradiction.

### Scene 8 · 3:30–3:45 · Runs anywhere, and the close (terminal)

**Show:** a terminal with a large font (Ctrl + to zoom in), the repo folder, **no `.env` open**:

```bash
pnpm agent --input input_examples/06-energy-plan.json
```

Let the JSON lines scroll by, then stop on the result.

**Say:**
> "Clone the repo and run one command: no keys, and the same agents on sample data. TNB tells you what you spent. SmartFlux tells you what to do about it, and proves it worked."

End card (add when editing): SmartFlux · Track 3 · the GitHub link · team names.

---

## 4. What not to say or show

Judges check claims against the repo. Each of these would cost points if a judge catches it:

- **Don't say that Zetaris or Nightshift ran live**, unless the team actually completes the live run and commits its logs before submitting. The app's top bar honestly says **Data SQLite · Reasoning replay**. Say instead: "the AI answers you see were recorded from NVIDIA's Nemotron models and replayed", and "in live mode the same queries go through Zetaris". Don't hide the badge.
- **Don't invent an owner quote** or say "owners told us…". We haven't interviewed an owner yet. Use the problem statement in Scene 1 as written.
- **Don't show keys**: no `.env`, no Nightshift Providers tab, no terminal history with tokens. Check every frame before uploading.
- **Don't call the data real.** The business data is synthetic; the weather and public holidays are real. If asked, say "synthetic data from three outlets, built on real weather".
- **Don't say "sensors" or "IoT".** The point is that no sub-meters are needed: it uses the main meter and the payment system's cycle log.
- Avoid the HQ **Outlets** table, as noted in Scene 7.

---

## 5. If the live run happens first (optional, replaces part of Scene 7)

If someone gets Zetaris and Nightshift working before you record (`pnpm live`, then `pnpm smoke` passes):

- Add 15 seconds after Scene 2 showing the Zetaris UI: the Postgres datasource, the Open-Meteo weather REST table, and the `smartflux.energy` semantic model.
- In HQ → **Data and AI**, show live `zetaris.query` counts and the Nightshift model on each step.
- The top bar should then read **Data Zetaris · Reasoning nightshift**. Only then may the narration say "live through Zetaris and Nightshift".

Take 15 seconds out of Scene 7 to make room.

---

## 6. Retakes

Approving G3 (and anything else you approve) is saved. To start over:

1. Stop the server (Ctrl+C in the `pnpm demo` terminal).
2. Run `rm -rf data/hmem logs data/users.db`.
3. Run `pnpm demo` again. It re-seeds the same 8 sessions, with the same numbers.
4. Sign in again in each window (the old sign-ins are cleared).

| Problem | Fix |
|---|---|
| Icons show as words (`check_circle`) | Wait a second and refresh; the icon font loads from Google Fonts, so it needs internet |
| The customer sees "Open SmartFlux on your phone" | Device mode is off in that window; press Ctrl+Shift+M |
| `EADDRINUSE :8000` | An old server is still running; close its terminal, or run `PORT=8001 pnpm demo` and use :8001 |
| Different numbers from this guide | The memory isn't fresh; reset as above |
| The date picker won't go earlier than 7 Sep or later than 18 Oct | Intended: that's the sample window |

---

## 7. After recording

1. Edit: trim dead time and add the Track 3 title and the end card. Check the length is **under 4:00**.
2. Scrub every frame near a terminal or settings screen for keys (TODO 15.4).
3. Upload to YouTube as **Unlisted** (not Private). Title: "SmartFlux EDIS: Open Agent Hackathon 2026, Track 3".
4. Open the link in a **private/incognito window** while signed out to confirm it plays.
5. Paste the link into:
   - the HackOS submission form,
   - `README.md` (top, next to the Track 3 line),
   - `docs/submission-pack.md` (the Demo video row).
6. Tick TODO 15.1 and 15.4.

## 8. Checklist

- [ ] Fresh reset, then `pnpm demo`
- [ ] Tests T1–T9 pass
- [ ] Notifications off, `.env` closed
- [ ] Scenes 1–8 recorded
- [ ] Under 4:00, Track 3 on screen
- [ ] No keys in any frame
- [ ] No live Zetaris/Nightshift claim (unless section 5 happened)
- [ ] Uploaded unlisted, link tested logged out
- [ ] Link in HackOS form, README and submission pack
