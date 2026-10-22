# SimeGuardian — Pitch Deck Content (Draft)

| Item | Detail |
| --- | --- |
| Deliverable | Slide-by-slide content for the organiser template (`SDP_University_Hackathon_TOWNSHIP-OF-TOMORROW-Template.pptx`, 13 slides). Content only; layout and visuals are a separate pass. |
| Version | 0.1 draft, 22 October 2026 |
| Author | Tan Hao Wen (drafted with Claude using the IT Business Analyst skill) |
| Reviewers | Lim Jiale, rest of team |
| Status | For team review |
| Deadline | Proposal due 23 October 2026, 11:59 p.m. |

**Sources ingested**

| ID | Source | Version / date | Use |
| --- | --- | --- | --- |
| S1 | `docs/REQUIREMENTS.md` | v0.6, 18 Oct 2026 | Canonical: problem, evidence, scope, workflow, pilot, KPIs, risks |
| S2 | `README.md` | main @ 22 Oct 2026 | What the running demo actually does today |
| S3 | `ml/runs/latest.json` | run-20261019-062713 | Real training and evaluation numbers |
| S4 | Jiale's commits (`backend/`, `web/`, `docs/DASHBOARD.md`, `docs/MLFLOW.md`) | 20–21 Oct 2026 | MLflow registry, operations dashboard, 3D township view |
| S5 | Organiser template | 13 slides | Slide order and prompts |

Confidence tags used below: **Confirmed** (in code or 2+ sources), **Likely** (one authoritative source), **Proposal** (a design/pilot hypothesis, must be labelled as such on the slide).

Writing rule for every slide: keep the slide text short (headline + 3–5 bullets). Detail goes in speaker notes.

---

## Slide 1 — Title

- **Title:** SimeGuardian
- **Subtitle:** Making sure someone notices when an elderly resident's day goes quiet
- **Line 3:** Township of Tomorrow · Theme 1: People, Community Wellbeing
- **Footer:** Team name · University (fill in)

---

## Slide 2 — Team Information

Fill from team records. Nothing in the repo provides these.

| Field | Content |
| --- | --- |
| Team Name | _TBC_ |
| Team Leader | _TBC_ |
| University | _TBC_ |
| Members (2–5) | Tan Hao Wen · Lim Jiale · _others TBC_ |
| Email / Contact | _TBC_ |

Optional one-line role per member (e.g. "product & requirements", "ML & dashboard", "mobile app").

---

## Slide 3 — 1. The Problem

**Headline:** More Malaysian seniors live alone, and nobody notices when their routine stops.

**Bullets**
- 18.8% of adults 60+ lived alone in 2025, up from 6.3% in 2018 (NHMS) — almost 3×. _Confirmed (S1)_
- An estimated ~3,500 people a year die alone at home before anyone notices (expert estimate, Bernama 2026). _Likely (S1)_
- Living alone more than doubles fall risk; ~68% of seniors have 2+ chronic diseases (NHMS 2025). _Likely (S1)_
- **Nobody is home in the day:** Malaysian households average 1.8 income earners (DOSM HIS 2024), and 70.7% of Selangor women are in the labour force, a national record of 56.6% (DOSM 2025). The adult children who used to check in are at work. _Confirmed (S1; first stated in the original BRD, commit 4415218)_
- After handover, families and township teams have no shared way to notice a change, decide who checks in, and confirm someone did.

**Who is affected and why it matters:** elderly residents living alone, their working adult children, and township teams who are already present but have no protocol.

**Speaker notes:** State plainly that the figures show the size of the problem, not that our system detects emergencies. The gap we target is the *follow-through*: noticing, deciding, confirming.

---

## Slide 4 — 2. Target User

**Headline:** Built first for residents 60+ who live alone, and the people who look out for them.

| User | Challenge today | What they need |
| --- | --- | --- |
| **Madam Lee, 72** — widowed, lives alone in a guarded SDP precinct; uses WhatsApp, refuses a pendant ("makes her feel old") | No one nearby notices if her day goes wrong; wearables feel stigmatising | Support without a device, and control over who is told |
| **Daniel, 41** — her son, dual-income household (wife also works), 25 km away in KL; the likely payer | Calls most evenings but cannot know she's fine during the day | A clear signal only when it matters, and to know if someone already responded |
| **Township responder** (guard / management) | Present on site but no trigger or protocol | One assigned incident with only the details needed |

**Footnote line:** Opt-in; no health diagnosis required. Expansion to other residents after the first cohort is validated.

**Source:** S1 personas and roles. _Confirmed_

---

## Slide 5 — 3. Your Solution

**Headline:** SimeGuardian turns signals the township already has into a check-in, then makes sure a human follows up.

**How it helps, in three lines**
1. **Notice:** learns each household's normal day from data the township already produces: electricity, water, car-plate parking, gate access card, mall visits, app activity. No new hardware.
2. **Ask the resident first:** an unexplained quiet period triggers an "Are you OK?" pop-up on her phone.
3. **Escalate until someone answers:** no reply in 5 min → family; another 5 min → township responder. Every outcome is recorded.

**Key promise line:** No cameras, no wearables, no medical claims. It's a wellbeing check, not an emergency detector.

**Speaker notes:** Asking the resident first respects her autonomy and avoids alarming Daniel over a nap. Family and AI-observed recovery can also close an incident, always labelled differently.

**Traceability:** FR-3, FR-4, FR-5, FR-7 (S1).

---

## Slide 6 — 4. Innovation

**Headline:** Not another gadget: a software layer on top of the township itself.

| Existing approach | Limitation | SimeGuardian |
| --- | --- | --- |
| Panic pendants / fall alarms | Must be worn and pressed; stigma; ~RM500 price expectation in local study | Nothing to wear or charge; no hardware cost |
| Smart-meter watching (Japan: Kyushu Electric, R65) | One utility signal, email to family only | Six signals combined, with home/away context to cut false alarms |
| Phone calls from family | Depends on someone remembering; no record | Automatic trigger, timed escalation, shared timeline |

**What's unique (bullets)**
- **Developer-run:** the property developer connects services residents already use; no single utility can do this alone.
- **Resident-first escalation ladder:** resident → family → township, with explicit ownership so nobody double-handles.
- **Honest AI:** we train a model *and* a transparent rule, compare them on held-out households, and deploy whichever wins. Every alert traces back to its data, model version and reason.

**Speaker notes:** Local novelty has not been formally established; say "we found utility-based watching overseas; we haven't found a township-level, multi-signal service with a human response protocol in Malaysia." _Proposal framing (S1)_

---

## Slide 7 — 5. How it Works

**Headline:** From a quiet household to a confirmed human check-in, in four stages.

**Flow (to be drawn as a diagram):**

1. **Signals in** — six simulated source groups: electricity, water, parking/car plate, gate access card, mall, resident app.
2. **Learn & detect** — 14-day personal baseline per household and time of day → rule check (both electricity *and* water below 20% of normal for 60 min) and an Isolation Forest anomaly model → safeguards: away mode, stale-feed handling, conflicting activity linked to the resident.
3. **Check in & escalate** — t0 resident pop-up ("I'm okay" / "Contact me") → t0+5 min family (Call Mum / I'll check in / Mark completed) → t0+10 min township responder (assign guard → on the way → arrived).
4. **Resolve & record** — closed by resident, family, township, or AI-observed sustained recovery (2+ independent signals for 30 min), each labelled separately. Everything appears on one timeline in the operations dashboard.

**Theme fit (one line):** Physical wellbeing through timely follow-up; mental wellbeing through human contact. No mood or loneliness inference.

**Safeguard examples (small text or notes)**
- Only one utility looks unusual → no alert.
- A feed is missing → "insufficient data", never treated as zero.
- Mum's card used at the gate 20 min ago → conflicting evidence, no alert.
- Daniel's own app use never counts as Mum being active.

**Source:** S1 architecture and alert handling; S2 demo flow. _Confirmed_

---

## Slide 8 — 6. Impact

**Headline:** Faster human contact for seniors, peace of mind for families, a measurable wellbeing story for SDP.

| Who benefits | Outcome |
| --- | --- |
| Residents | Independence without a wearable; someone checks in when the day goes quiet |
| Families | Told only when it matters; see who has responded |
| Township teams | Clear trigger, assignment and record instead of ad-hoc calls |
| SDP | "Age-ready township" differentiation, post-handover engagement, an ESG social metric (households covered, check-ins resolved, response times) |

**Demand signals (label sources on slide):**
- Global personal emergency response market is about **US$6.2–6.4 billion in 2025**, growing about **6% a year** ([Future Market Insights](https://www.futuremarketinsights.com/reports/personal-emergency-response-system-market): US$6.2B → US$11.5B by 2035, 6.3% CAGR; [Persistence](https://www.persistencemarketresearch.com/market-research/personal-emergency-response-systems-market.asp): US$6.4B). _Likely; vendor estimates range US$3.5–9.4B depending on definition, so quote the middle pair and the source._
- Local appetite: in a Malaysian study of 336 adults 50+, **64% were interested** in fall detectors but **91.7% had never heard of them**, and most expected to pay under RM500 ([Frontiers, 2021](https://www.frontiersin.org/journals/public-health/articles/10.3389/fpubh.2021.612538/full)). _Confirmed (S1)_
- Ageing-care spending for older Malaysians is projected to exceed **RM21 billion a year by 2040** ([CodeBlue, 2026](https://codeblue.galencentre.org/2026/07/facing-the-silver-tsunami-why-malaysia-must-overhaul-its-aged-care-infrastructure-dr-rajeentheran-suntheralingam/)). _Likely; this is health-care cost, not monitoring sales_

**Pilot targets (label as "proposed"):**
- ≤ 1 false alarm per household per month reaching family
- Median family alert → recorded human check-in < 30 min
- Township welfare check < 15 min after escalation (in drills)
- ≥ 80% of families feel more confident · ≥ 70% of households stay enrolled

**Speaker notes:** These are targets to test in a pilot, not results. The prototype proves the workflow and the AI pipeline, not real-world detection rates.

**Source:** S1 Impact and KPIs, Business value. _Proposal_

---

## Slide 9 — 7. Feasibility

**Headline:** Realistic because it reuses what townships already run. No sensors to install.

**Resources**
- Software only: data feeds + app + dashboard. Running cost to estimate: data access, hosting, notifications, responder time.
- Working prototype already built (see slide 11).

**Stakeholders**
| Party | Role | Status |
| --- | --- | --- |
| Sime Darby Property | Sponsor; pilot funder | To confirm |
| Residents & families | Opt in, select contacts | Pilot recruitment proposed |
| JMB / management body, security contractor | Responder staffing; gate/plate data | To confirm per township |
| TNB, Air Selangor | Consented interval utility data | Not yet approached |
| Parking & mall operators | Minimal linked visit events | Not yet approached |

**Deployment approach:** one guarded precinct, 30–50 opt-in elderly households, ~3 months, free to participants (SDP-funded). _Proposal_

**Key risks → mitigations (pick 3 for the slide)**
- Utility data not available fast enough → confirm feeds before pilot; pause rather than add hardware.
- Too many false alarms → 2-week shadow mode before any real alert.
- Privacy worries → opt-in, minimal sharing, withdrawal completed within 23 hours, PDPA legal review before real data.

**Source:** S1 parties, pilot plan, risks. _Proposal_

---

## Slide 10 — 7. Implementation

_Template numbers this "7" again; see Questions & Gaps._

**Headline:** A 13-week pilot that earns trust before it sends a real alert.

| Phase | Weeks | What happens | Go / no-go |
| --- | --- | --- | --- |
| 0. Setup | 1–3 | Permissions, data feeds, consent, family contacts, responder roster | ≥ 30 households and all prerequisites, else defer |
| 1. Shadow mode | 4–5 | Learn real baselines; review would-be alerts without sending | Data quality and false-alarm rate acceptable |
| 2. Response drills | 6–9 | Consented drills of resident → family → township | Delivery, ownership and staffing proven |
| 3. Live service | 10–12 | Real alerts if ready; resident and family surveys | Feedback and KPIs recorded |
| Decision | 13 | Report to SDP: expand, adjust or stop | Proposed gate criteria (slide 8) |

**Tech stack line (small):** Expo (React Native) resident/family app · FastAPI backend · MLflow model tracking & registry · React operations dashboard · scikit-learn.

**Speaker notes:** Drills matter because a 3-month pilot may see no real emergencies; drills prove the response chain works. Expansion to other residents only after this cohort is validated.

**Source:** S1 pilot plan; S2/S4 stack. _Proposal (pilot), Confirmed (stack)_

---

## Slide 11 — 7. Visual Concept

**Headline:** A working prototype, not a mock-up.

Screenshots to capture (one strip or 2×2 grid):
1. **Madam Lee's phone:** "Are you OK?" pop-up with countdown.
2. **Daniel's phone:** family alert with Call Mum / Mark safe.
3. **Operations dashboard:** incident timeline from data → model → resident → family → township.
4. **3D township view (Putra Heights):** households and signal sources on the map.
5. **Model page:** rule vs model comparison on held-out households.

**Caption line:** All data is synthetic: 120 simulated elderly households × 90 days, 15-minute readings.

**Evidence box (real numbers, run 2026-10-19, untouched test set of 18 households):**

| | Episode recall | Alert precision | False alerts / household-day |
| --- | --- | --- | --- |
| Rule baseline (active) | 0.80 | 0.78 | 0.007 |
| Isolation Forest + corroboration | 0.80 | 0.58 | 0.019 |

**Speaker notes:** The rule won on validation, so it is the active policy; the model stays in the registry for retraining as real data arrives. Say it plainly: synthetic scores don't predict real-world accuracy. Choosing the rule because it measured better shows the pipeline works as intended.

**Source:** S3, S4. _Confirmed_

---

## Slide 12 — 8. Why Your Team Should Win

_Limit: 100 words. Draft below is 86 words._

> Malaysia's seniors living alone tripled in seven years, and today no one is responsible for noticing when their day goes quiet. SimeGuardian gives Sime Darby Property a way to look after residents long after handover, using signals its townships already produce, with no cameras or wearables. We built it end to end: a resident and family app, a timed escalation ladder, and an AI pipeline we test honestly on held-out data. It is privacy-first and opt-in, and ready for a 3-month pilot in one precinct.

---

## Slide 13 — Thank You

- **Thank you**
- One-line ask: "We'd like to pilot SimeGuardian with 30–50 households in one SDP precinct."
- Contact email / QR to demo video or repo (TBC).

---

## Claims check — what the deck may and may not say

| Safe to say | Do not say |
| --- | --- |
| "Prompts a human check-in when a routine changes" | "Detects falls / emergencies / health problems" |
| "Trained and evaluated on synthetic data" | Any accuracy claim about real residents |
| "Proposed pilot targets" | Targets presented as results |
| "No new hardware" | "Water flow sensor in the pilot" (README wording conflicts; see Q2) |
| "Rule currently outperforms the model; we deploy what measures better" | "Our AI model beats rules" |
| "SDP-funded pilot proposed; RM25–35/month family contribution is a hypothesis" | A confirmed price |

## Questions & Gaps Log

| # | Gap or contradiction | Sources | Action / owner |
| --- | --- | --- | --- |
| Q1 | **App stack:** REQUIREMENTS says native SwiftUI iPhone app; the built app is Expo Go (React Native). Deck uses Expo. | S1 vs S2 | Confirm; update REQUIREMENTS after submission |
| Q2 | **Hardware:** README mentions "a water flow sensor in the pilot"; REQUIREMENTS forbids new hardware. Deck says no hardware. | S1 vs S2 | Fix README wording |
| Q3 | **Two dashboards:** `server/` (Demo control, Security console, Model tab) and Jiale's `backend/` + `web/` (MLflow, 3D township). Which one is used for screenshots and the live demo? | S2, S4 | Team decision before screenshots |
| Q4 | **Metrics source:** numbers above come from `ml/runs/latest.json`. The MLflow registry in `backend/` may hold different runs. Use one source consistently. | S3 vs S4 | Jiale to confirm champion version and metrics |
| Q5 | Team details (name, university, members, contact) missing. | — | Fill before export |
| Q6 | Template numbering repeats "7." on Feasibility, Implementation and Visual Concept. | S5 | Keep organiser numbering or renumber 7–9; check with organisers if strict |
| Q7 | Judging criteria: the hackathon reference file lives on Jiale's machine and was not reviewed here. Check the deck against the actual scoring rubric. | S1 link | Jiale |
| Q8 | Demand validation (15+ family survey, 1–2 security interviews) was planned "before 23 October". If done, add a result line to slide 3 or 4; if not, leave it out. | S1 | Team |
| Q10 | **Device sales figures:** the original BRD said "team to add the figures and source already gathered"; they never reached the repo. No Malaysia-specific monitoring-device sales figure was found online; slide 8 uses global market estimates plus the local interest study. If a teammate has the original figures, swap them in. | BRD 4415218 | Team |
| Q9 | Demo timing: live demo escalates every 10 s; the real policy is 5 min. Label accelerated time on screen. | S1, S2 | Presenter |

## Glossary

| Term | Meaning |
| --- | --- |
| t0 | Moment the resident's check-in pop-up is created; family stage at t0+5 min, township at t0+10 min |
| Away mode | Resident-declared absence that pauses new inactivity alerts |
| Isolation Forest | Unsupervised anomaly-detection model (scikit-learn) |
| MLflow | Tool that records training runs and manages model versions (registry, promotion, rollback) |
| JMB / MC | Joint Management Body / Management Corporation, which runs a strata township after handover |
| PDPA | Malaysia's Personal Data Protection Act |
| Shadow mode | Pilot phase where alerts are computed and reviewed but not sent |
