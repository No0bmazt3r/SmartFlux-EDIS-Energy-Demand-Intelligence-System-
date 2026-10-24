# SmartFlux EDIS: User Research Plan

Impact is 30 points and breaks ties. Judges' guidance says a team with a real user beats a team with better engineering and no user. This plan gets real evidence quickly and honestly.

---

## 1. Goals

| # | What we need to learn | Feeds |
| --- | --- | --- |
| R1 | Do owners worry about ToU and solar decisions? How were they sized or decided? | Impact story, Energy plan design |
| R2 | Are dryers gas or electric? | Gas-dryer logic, demo framing |
| R3 | Has a machine wasted energy or broken without warning? How did they notice? | Fault detection value |
| R4 | Does their payment system export cycle logs? In what format? | Data access, roadmap |
| R5 | Would they trust an app's recommendation? What would make them trust it? | Evidence screen, approvals, verification |
| R6 | What would they pay? Per outlet or per franchise? | Business model slide |

## 2. Who to talk to

- At least **one** owner or operator; **three** is better. Mix single-outlet and franchise.
- Where: family and friends' networks, laundromats near team members (talk to the attendant and ask for the owner's contact), laundromat owner Facebook groups, franchise sales lines (as a prospective buyer asking how the business runs).
- Format: 15 minutes by phone, WhatsApp voice, or in person.

## 3. Interview script (English; Malay version below)

1. Tell me about your outlet(s): how many machines, how long running, are you there often?
2. What's your monthly electricity bill roughly? Has it changed since mid-2025?
3. Have you heard of the ToU tariff? Did you consider it? Why or why not?
4. Has anyone offered you solar? How did they decide the size? Did you go ahead?
5. Are your dryers gas or electric? Who refills the gas?
6. Tell me about the last time a machine had a problem. How did you find out? What did it cost?
7. What payment system do you use? Can you download a record of each wash and dry?
8. If an app told you "dryer 4 is wasting RM50 a month, service it", would you act? What would you need to see first?
9. If it then told you "the service saved RM65 a month", would that change how you trust it?
10. What would a tool like this be worth to you per month?
11. Can we quote one sentence from you (first name or "an Ipoh laundromat owner")?

**Malay version (Bahasa Melayu):**
1. Boleh cerita tentang kedai dobi anda: berapa mesin, sudah berapa lama beroperasi, selalu ada di kedai?
2. Bil elektrik sebulan lebih kurang berapa? Ada berubah sejak pertengahan 2025?
3. Pernah dengar tarif ToU? Pernah pertimbangkan? Kenapa?
4. Ada orang tawarkan solar? Macam mana mereka tentukan saiz? Jadi pasang?
5. Mesin pengering guna gas atau elektrik?
6. Bila kali terakhir mesin rosak atau bermasalah? Macam mana tahu? Berapa kosnya?
7. Sistem bayaran apa yang digunakan? Boleh muat turun rekod setiap kitaran?
8. Kalau aplikasi beritahu "pengering 4 membazir RM50 sebulan, sila servis", adakah anda akan bertindak? Apa yang anda perlu lihat dulu?
9. Kalau kemudian ia beritahu "servis itu jimat RM65 sebulan", adakah anda lebih percaya?
10. Berapa nilai alat seperti ini kepada anda sebulan?
11. Boleh kami petik satu ayat daripada anda (nama pertama atau "seorang pemilik dobi di Ipoh")?

## 4. Recording template

| Field | Notes |
| --- | --- |
| Date, method | |
| Outlet count, machine count | |
| Bill per month | |
| ToU: aware / considered / switched | |
| Solar: offered / sized how / installed | |
| Dryers: gas / electric | |
| Last machine problem and cost | |
| Payment system, export possible? | |
| Trust conditions | |
| Willingness to pay | |
| Quote (with permission) | |

Store notes in `docs/research/` without phone numbers or full names.

## 5. How findings change the product

| If we hear… | We change… |
| --- | --- |
| Most dryers are gas | Lead the fault story with gas (minutes) and keep D4 as the electric case |
| Owners were sold solar on the bill | Make "sized on your real load" the headline of slide 2 |
| Payment systems can't export | Roadmap: telemetry partnership; demo stays on CSV |
| Owners don't trust apps with money | Push the verification card and approvals earlier in the demo |

## 6. Ethics

Ask permission before quoting; quote only what was said; never invent or "composite" a user; no personal data in the repo or video. If no owner is reached, say so in the deck and use public sources instead.
