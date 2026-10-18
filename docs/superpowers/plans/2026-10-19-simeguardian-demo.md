# SimeGuardian Demo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A recordable demo in which Madam Lee goes quiet, gets a check-in pop-up on a real iPhone (Expo Go), then escalates to family and then to a guard, all visible live in a web dashboard.

**Architecture:** A dependency-free Node 24 server keeps all demo state in memory. Its pure engine runs the simulated clock, the signal generator, the alert rule and the escalation state machine. The server serves a plain HTML/JS dashboard (demo control, family, security tabs) and a JSON API. The Expo app polls the API once a second and renders onboarding, home or the check-in flow. The dashboard polls the same way.

**Tech Stack:** Node 24 (native TypeScript type-stripping, `node:http`, `node:test`), plain HTML/CSS/JS with inline SVG chart, Expo (latest SDK) + React Native + TypeScript, `expo-notifications`, `expo-haptics`.

**Spec:** `docs/superpowers/specs/2026-10-19-simeguardian-demo-design.md` (product context: `docs/BRD.md`)

## Global Constraints

- Expo Go only: no dev build, no EAS, no Xcode. Only libraries bundled in Expo Go. Project SDK must match the phone's Expo Go version.
- Server has **zero npm dependencies**. Run with `node src/index.ts` (Node 24 strips types). Use only erasable TS syntax (no `enum`, no `namespace`, no parameter properties). Relative imports end in `.ts`.
- Server listens on `0.0.0.0:4000`.
- Escalation step wait: **10 s real time** per phase (check-in window, family window), adjustable from the dashboard.
- Sim-time jumps per phase: check-in window **+30 min**, family window **+15 min**, guard: Assigned **+2 min** → On the way **+3 min** → Arrived **+3 min** (threshold → arrived = 53 sim-min, e.g. 10:02 → 10:55).
- Alert states: `OK → CHECKIN_PENDING → FAMILY_ESCALATED → SECURITY_ESCALATED → RESOLVED`.
- Security console never receives home/away/away-mode fields. Family view never receives the activity timeline or signal log. Enforce this in the server's view functions, not only in the UI.
- Copy is wellbeing framing only: never "health monitoring", "diagnosis", "medical".
- No SDP logos/assets. Product name "SimeGuardian"; app may say "a module for your township app".
- English only.

## Review Focus

1. **Tap races the timer:** resident taps "I'm OK" in the same tick the check-in window expires → the tap wins; the alert resolves and is never escalated after resolution. *(Task 1 test `checkIn after expiry tick still resolves`.)*
2. **Double trigger:** presenter clicks "goes quiet" twice, or on a household that already has an alert → no second alert, no duplicate log lines. *(Task 1 test `goQuiet is idempotent`.)*
3. **Away mode during an active alert:** Madam Lee turns on away mode while the pop-up is showing → treated as a resident response: alert resolves (actor `resident`), and no new alert while away. *(Task 1 test `setAway during alert resolves it`.)*
4. **Reset mid-escalation:** Reset during `FAMILY_ESCALATED` → no phase timer fires afterwards, log cleared, Madam Lee `consented=false` so the phone returns to onboarding. *(Task 1 test `reset clears pending escalation`.)*
5. **Phone can't reach server** (wrong IP, venue Wi-Fi isolation): app shows a clear "Can't reach SimeGuardian server at <url>" screen with the URL, never a stale "You're all set". *(Task 5 manual check step.)*

---

## File Structure

```
server/
  package.json            # "type": "module", scripts: start, test. No deps.
  src/engine.ts           # pure world state, clock, signals, rule, state machine
  src/engine.test.ts
  src/views.ts            # role-scoped projections (dashboard, resident, family, security)
  src/views.test.ts
  src/index.ts            # http server: API + static files + tick loop
  src/index.test.ts       # route smoke tests
  public/index.html       # dashboard (3 tabs)
  public/app.js
  public/style.css
app/                      # Expo project (create-expo-app, blank-typescript)
  App.tsx                 # screen switch
  src/api.ts              # server URL + fetch helpers
  src/useResident.ts      # 1 s polling hook
  src/screens/Onboarding.tsx
  src/screens/Home.tsx
  src/screens/CheckIn.tsx
  src/screens/Offline.tsx
README.md                 # how to run the demo
```

---

### Task 1: Engine state machine and escalation timing

**Files:**
- Create: `server/package.json`, `server/src/engine.ts`
- Test: `server/src/engine.test.ts`

**Interfaces:**
- Produces (exported from `engine.ts`):
  ```ts
  export type AlertState = 'OK' | 'CHECKIN_PENDING' | 'FAMILY_ESCALATED' | 'SECURITY_ESCALATED' | 'RESOLVED'
  export type GuardState = 'NONE' | 'ASSIGNED' | 'ON_THE_WAY' | 'ARRIVED_SAFE'
  export type Actor = 'system' | 'resident' | 'family' | 'security' | 'presenter'
  export interface Alert { state: AlertState; guard: GuardState; phaseEndsAt: number | null /* real ms */; startedSim: number }
  export interface LogEvent { sim: number; householdId: string; type: string; actor: Actor; text: string }
  export interface Household {
    id: string; resident: string; unit: string; familyContact: string
    baseline: number[]          // 24 values, expected activity events per hour (0..6)
    today: number[]             // 24 values, actual events this sim-day
    thresholdMin: number        // personal inactivity threshold
    activityEveryMin: number    // generator cadence while awake and not quiet
    lastActivity: number        // sim ms
    home: boolean; away: boolean; consented: boolean; quiet: boolean
    alert: Alert | null
  }
  export interface World { sim: number; lastReal: number; speed: number; stepMs: number; households: Household[]; log: LogEvent[] }
  export function createWorld(realNow: number): World
  export function tick(w: World, realNow: number): void
  export function goQuiet(w: World, id: string, realNow: number): void
  export function checkIn(w: World, id: string, actor: 'resident' | 'family'): void
  export function setAway(w: World, id: string, away: boolean): void
  export function consent(w: World, id: string): void
  export function advanceGuard(w: World, id: string): void
  export function reset(w: World, realNow: number): void
  export const MIN = 60_000
  ```
  All mutators throw `new Error('unknown household')` for a bad id.

- [ ] **Step 1: Create `server/package.json`**

  `{"name":"simeguardian-server","private":true,"type":"module","scripts":{"start":"node src/index.ts","test":"node --test"}}`

- [ ] **Step 2: Write failing tests in `server/src/engine.test.ts`** (`node:test` + `node:assert/strict`). Use a fake `realNow` counter; never real timers.

  ```ts
  test('createWorld seeds Madam Lee at 08:00, consented false, stepMs 10000', () => {
    const w = createWorld(0)
    const lee = w.households.find(h => h.id === 'lee')!
    assert.equal(lee.resident, 'Madam Lee'); assert.equal(lee.consented, false)
    assert.equal(new Date(w.sim).getHours(), 8); assert.equal(w.stepMs, 10_000)
    assert.ok(w.households.length >= 4 && w.households.length <= 5)
  })
  test('goQuiet jumps sim to threshold crossing and opens CHECKIN_PENDING', () => {
    const w = createWorld(0); consent(w, 'lee'); const lee = get(w, 'lee')
    goQuiet(w, 'lee', 1000)
    assert.equal(lee.alert!.state, 'CHECKIN_PENDING')
    assert.equal(w.sim - lee.lastActivity, lee.thresholdMin * MIN)
    assert.equal(lee.alert!.phaseEndsAt, 1000 + 10_000)
  })
  test('full escalation sim-times: +30, +15, guard +2 +3 +3', () => {
    const w = createWorld(0); consent(w, 'lee'); goQuiet(w, 'lee', 0)
    const t0 = w.sim
    tick(w, 10_000); assert.equal(get(w,'lee').alert!.state, 'FAMILY_ESCALATED'); assert.equal(w.sim - t0, 30 * MIN)
    tick(w, 20_000); assert.equal(get(w,'lee').alert!.state, 'SECURITY_ESCALATED'); assert.equal(w.sim - t0, 45 * MIN)
    advanceGuard(w,'lee'); advanceGuard(w,'lee'); advanceGuard(w,'lee')
    assert.equal(get(w,'lee').alert!.state, 'RESOLVED'); assert.equal(get(w,'lee').alert!.guard, 'ARRIVED_SAFE')
    assert.equal(w.sim - t0, 53 * MIN)
  })
  test('resident checkIn resolves and stops escalation', () => { /* goQuiet, checkIn resident, tick(30_000) → state RESOLVED */ })
  test('family checkIn resolves FAMILY_ESCALATED', () => { /* … actor 'family' → RESOLVED, last log actor 'family' */ })
  test('checkIn after expiry tick still resolves', () => { /* goQuiet at 0; checkIn at same realNow 10_000 BEFORE tick(10_000) → RESOLVED; tick(10_000) leaves RESOLVED */ })
  test('goQuiet is idempotent', () => { /* goQuiet twice → one alert, log has one 'threshold' event */ })
  test('setAway during alert resolves it', () => { /* goQuiet; setAway(true) → RESOLVED, actor resident; goQuiet again while away → no new alert; tick 10 sim-hours → still no new alert */ })
  test('reset clears pending escalation', () => { /* goQuiet; tick(10_000) → FAMILY; reset(w, 15_000); tick(40_000) → lee.alert null, log empty, consented false */ })
  test('not consented: goQuiet does nothing', () => { /* lee.alert stays null */ })
  test('normal households never alert across a full sim-day incl. night', () => {
    const w = createWorld(0); w.households.forEach(h => consent(w, h.id))
    for (let r = 0; r < 3000; r++) tick(w, r * 250)   // speed 120 → 3000 ticks ≈ 25 sim-hours
    assert.ok(w.sim - createWorld(0).sim >= 24 * 60 * MIN)
    assert.ok(w.households.every(h => h.alert === null))
  })
  test('goQuiet on lee does not alert other households', () => {
    const w = createWorld(0); w.households.forEach(h => consent(w, h.id)); goQuiet(w, 'lee', 0)
    tick(w, 10_000); tick(w, 20_000)
    assert.ok(w.households.filter(h => h.id !== 'lee').every(h => h.alert === null))
  })
  test('resolved alert does not re-fire', () => { /* full escalation to RESOLVED via guard; tick 2 real s → lee.alert.state still RESOLVED, no new 'threshold' log */ })
  test('unknown id throws', () => { assert.throws(() => goQuiet(createWorld(0), 'nope', 0), /unknown household/) })
  ```
  (`get = (w, id) => w.households.find(h => h.id === id)!`.) `speed = 120` means 1 real s = 2 sim-min, so one 250 ms tick = 30 sim-s.

- [ ] **Step 3: Run tests, expect failure**

  Run: `cd server && npm test` → FAIL (`Cannot find module './engine.ts'`).

- [ ] **Step 4: Implement `engine.ts`**

  - Seed 5 households: `lee` (Madam Lee, 72, "No. 12, Jalan Elmina 3", family "Daniel", thresholdMin 120, activityEveryMin 25) plus 4 others with different names/units/cadences. Baselines: morning and evening peaks, near-zero 23:00–06:00. Sim day starts at today's date 08:00 local. `lastActivity = sim` at start. `speed = 120`, `stepMs = 10_000`.
  - `tick`: if any alert is in `CHECKIN_PENDING`/`FAMILY_ESCALATED`, **do not advance the clock by speed** — sim only moves by phase jumps; otherwise `sim += (realNow - lastReal) * speed`. Always set `lastReal = realNow`. For each household that is `home && !quiet && !away`, during 06:00–23:00 add an activity whenever `sim - lastActivity >= activityEveryMin*MIN` (set `lastActivity`, `today[hour]++`). Rule: `consented && home && !away && no active alert && gap > thresholdMin*MIN && hour in 06–23` → open alert (same as goQuiet's opening). **Gap excludes quiet hours:** `gap = sim - max(lastActivity, most recent 06:00 at or before sim)`, so a normal night doesn't fire at 06:00. Run the generator **before** the rule in each tick so a phase jump (+30/+15) is refilled for normal households before they're evaluated. "Active alert" = alert exists and state ≠ `RESOLVED`; a `RESOLVED` alert is replaced only by a new trigger. Then phase expiry: `CHECKIN_PENDING` with `realNow >= phaseEndsAt` → `FAMILY_ESCALATED`, `sim += 30*MIN`, new `phaseEndsAt`; `FAMILY_ESCALATED` expired → `SECURITY_ESCALATED`, `sim += 15*MIN`, `phaseEndsAt = null`.
  - `goQuiet`: no-op if not consented or alert active. Set `quiet = true` and **backdate** `lastActivity = sim - thresholdMin*MIN` (do not move the shared clock, or other households would cross their thresholds). Open alert with `phaseEndsAt = realNow + stepMs`.
  - `advanceGuard`: only in `SECURITY_ESCALATED`; NONE→ASSIGNED (+2), →ON_THE_WAY (+3), →ARRIVED_SAFE (+3) and state `RESOLVED`.
  - Any resolution (`checkIn`, `setAway(true)` on an active alert, guard `ARRIVED_SAFE`): state `RESOLVED`, `phaseEndsAt = null`, `quiet = false`, `lastActivity = sim`. `setAway` also sets `away`.
  - Every transition pushes a `LogEvent` with human text, e.g. `"Inactive 2h 0m — check-in sent"`, `"No reply in 30 min — Daniel notified"`, `"Family window passed — welfare check requested"`, `"Guard assigned"`, `"Guard on the way"`, `"Guard arrived — resident safe"`, `"Madam Lee tapped I'm OK"`, `"Daniel marked safe"`.
  - `reset`: replace contents of `w` with `createWorld(realNow)` (mutate in place so the server's reference stays valid).

- [ ] **Step 5: Run tests, expect pass**

  Run: `cd server && npm test` → all engine tests PASS.

- [ ] **Step 6: Commit**

  `git add server && git commit -m "feat(server): engine with alert state machine and sim clock"`

---

### Task 2: Role-scoped views and HTTP server

**Files:**
- Create: `server/src/views.ts`, `server/src/index.ts`
- Test: `server/src/views.test.ts`, `server/src/index.test.ts`

**Interfaces:**
- Consumes: everything exported from `engine.ts` (Task 1).
- Produces (`views.ts`):
  ```ts
  export function dashboardView(w: World, realNow: number): { sim: number; speed: number; stepMs: number; households: Household[]; log: LogEvent[] }
  export interface ResidentView { id: string; resident: string; familyContact: string; consented: boolean; away: boolean
    alertState: AlertState | null; guard: GuardState; countdownSimMs: number | null; checkinsToday: LogEvent[]; sim: number }
  export function residentView(w: World, id: string, realNow: number): ResidentView
  export interface FamilyView { id: string; resident: string; status: 'OK' | 'CHECKIN_PENDING' | 'ESCALATED'; alertState: AlertState | null; since: number | null }
  export function familyView(w: World, id: string): FamilyView
  export interface SecurityItem { id: string; unit: string; resident: string; escalatedAt: number; guard: GuardState; state: AlertState }
  export function securityView(w: World): SecurityItem[]
  ```
- Produces (HTTP API on `:4000`, JSON, all POST bodies JSON):

  | Method | Path | Body | Effect / returns |
  | --- | --- | --- | --- |
  | GET | `/api/state` | | `dashboardView` |
  | GET | `/api/resident/:id` | | `ResidentView` |
  | GET | `/api/family/:id` | | `FamilyView` |
  | GET | `/api/security` | | `SecurityItem[]` |
  | POST | `/api/households/:id/quiet` | | `goQuiet` |
  | POST | `/api/households/:id/checkin` | `{actor:'resident'\|'family'}` | `checkIn` |
  | POST | `/api/households/:id/away` | `{away:boolean}` | `setAway` |
  | POST | `/api/households/:id/consent` | | `consent` |
  | POST | `/api/households/:id/guard` | | `advanceGuard` |
  | POST | `/api/reset` | | `reset` |
  | POST | `/api/settings` | `{speed?:number, stepMs?:number}` | sets on world |

  POSTs return `{ok:true}`. Unknown id → 404 `{error:'unknown household'}`. Bad JSON → 400. Anything not `/api/*` serves `server/public/` (`/` → `index.html`). CORS header `Access-Control-Allow-Origin: *` on API responses.
- `index.ts` exports `startServer(port: number): Promise<http.Server>`; runs `startServer(4000)` only when executed directly (`import.meta.main`). Tick loop: `setInterval(() => tick(world, Date.now()), 250)`, cleared on server `close`.

- [ ] **Step 1: Write failing tests in `views.test.ts`**

  ```ts
  test('securityView never exposes home/away', () => {
    const w = createWorld(0); consent(w,'lee'); goQuiet(w,'lee',0); tick(w,10_000); tick(w,20_000)
    const items = securityView(w); assert.equal(items.length, 1)
    for (const k of ['home','away','lastActivity','today','baseline']) assert.ok(!(k in items[0]))
  })
  test('securityView lists only SECURITY_ESCALATED or guard-in-progress alerts', () => { /* CHECKIN_PENDING household → [] */ })
  test('familyView is status only', () => { /* keys exactly id,resident,status,alertState,since; FAMILY_ESCALATED → status 'ESCALATED' */ })
  test('residentView countdown maps 10 s real to 30 sim-min', () => {
    const w = createWorld(0); consent(w,'lee'); goQuiet(w,'lee',0)
    assert.equal(residentView(w,'lee',5_000).countdownSimMs, 15 * MIN)
  })
  test('residentView countdown is null outside CHECKIN_PENDING', () => { /* … */ })
  ```
  (Countdown in `FAMILY_ESCALATED` is null; app shows "We've let Daniel know" instead.)

- [ ] **Step 2: Write failing tests in `index.test.ts`** — start on port 0, use `fetch`:
  - `GET /api/resident/nope` → 404.
  - `POST /api/households/lee/consent` then `/quiet` → `GET /api/resident/lee` has `alertState === 'CHECKIN_PENDING'`.
  - `POST /api/households/lee/checkin` with body `not json` → 400.
  - `GET /` → 200 with `text/html`.
  Close the server in `after()`.

- [ ] **Step 3: Run tests, expect failure** — `cd server && npm test` → FAIL (missing modules).

- [ ] **Step 4: Implement `views.ts` and `index.ts`** — `node:http` only; static files via `fs.readFile` with a small extension→content-type map (`.html .js .css`), reject paths containing `..`. Create a placeholder `public/index.html` (`<h1>SimeGuardian</h1>`) so the static test passes; Task 3 replaces it.

- [ ] **Step 5: Run tests, expect pass** — `cd server && npm test` → all PASS.

- [ ] **Step 6: Manual smoke** — `cd server && npm start`, then from another shell `curl -s localhost:4000/api/state | head -c 200` → JSON with `households`.

- [ ] **Step 7: Commit** — `git add server && git commit -m "feat(server): role-scoped views and HTTP API"`

---

### Task 3: Web dashboard

**Files:**
- Modify: `server/public/index.html`
- Create: `server/public/app.js`, `server/public/style.css`

**Interfaces:**
- Consumes: HTTP API from Task 2. Polls once per second: the active tab's endpoint only (`/api/state`, `/api/family/lee`, `/api/security`).

No automated tests (static UI; the views it renders are tested in Task 2). Verification is the manual run in Step 4.

- [ ] **Step 1: Layout** — header "SimeGuardian" + current sim time (HH:MM, large) + three tabs: **Demo control**, **Family — Daniel**, **Security console**. Calm, credible township-app look; status colours: OK green, Check-in pending amber, Escalated red, Resolved grey. Must read clearly at 1280×800 next to the mirrored phone (dashboard gets ~60% of the screen width).

- [ ] **Step 2: Demo control tab**
  - Household cards: resident, unit, status chip, "Away" badge if away, consented yes/no.
  - Selected household (default `lee`) chart: inline SVG, 24 hourly columns; baseline as a light filled area, `today` as bars, a vertical "now" line, and text "Quiet for Xh Ym / threshold Zh". No chart library.
  - Buttons: **Madam Lee goes quiet** (POST quiet), **Reset demo** (POST reset), speed select (60/120/300), step-seconds input (default 10 → `stepMs`).
  - Event log: newest first, `HH:MM — text`, from `log`.

- [ ] **Step 3: Family tab and Security tab**
  - Family: phone-width card. Big status line: "Mum is OK" / "Check-in sent to Mum" / "Mum hasn't responded — please check on her" / "Resolved". Buttons **Call Mum** (shows a fake "Calling…" toast for 2 s, no API call) and **Mark safe** (POST checkin `{actor:'family'}`), enabled only while alert active. No timeline.
  - Security: table of `SecurityItem`s: unit, resident, escalated at (HH:MM), guard state; one button that advances the guard with label by state: "Assign guard" → "Mark on the way" → "Mark arrived — resident safe". Empty state: "No welfare checks requested."

- [ ] **Step 4: Manual verification** — `cd server && npm start`, open `http://localhost:4000`. Click consent for lee via `curl -X POST localhost:4000/api/households/lee/consent`, then "Madam Lee goes quiet": status amber; after 10 s red "Escalated: family" and family tab shows the "hasn't responded" line; after another 10 s security tab lists the unit; three guard clicks → resolved, log shows times +30, +15, +2, +3, +3 min apart. Reset returns all to start.

- [ ] **Step 5: Commit** — `git add server/public && git commit -m "feat(dashboard): demo control, family and security tabs"`

---

### Task 4: Expo resident app

**Files:**
- Create: `app/` via `npx create-expo-app@latest app --template blank-typescript`
- Create: `app/src/api.ts`, `app/src/useResident.ts`, `app/src/screens/{Onboarding,Home,CheckIn,Offline}.tsx`
- Modify: `app/App.tsx`, `app/app.json` (name "SimeGuardian", slug `simeguardian`)

**Interfaces:**
- Consumes: `ResidentView` shape and API routes from Task 2 (copy the `ResidentView`/`AlertState`/`GuardState` types into `app/src/api.ts`; do not import across folders).
- Produces (`api.ts`):
  ```ts
  export const SERVER_URL: string   // process.env.EXPO_PUBLIC_SERVER_URL ?? `http://${host of Constants.expoConfig?.hostUri}:4000`
  export function post(path: string, body?: unknown): Promise<void>
  ```
  (`useResident.ts`): `export function useResident(id: string): { view: ResidentView | null; error: string | null }` — polls `GET /api/resident/:id` every 1000 ms; `error` set after 3 consecutive failures, cleared on next success.

No automated tests: the app is screens over a tested API. Verification is the on-device run in Step 6.

- [ ] **Step 1: Scaffold and install** — run the create command, then `cd app && npx expo install expo-notifications expo-haptics expo-constants`. Confirm the generated SDK version matches the Expo Go app on the phone (Expo Go → Settings shows supported SDK); if not, update Expo Go.

- [ ] **Step 2: `App.tsx` screen switch** (resident id fixed to `'lee'`):
  - `error` → `Offline` ("Can't reach SimeGuardian server at {SERVER_URL}" + "Check the Mac and phone are on the same Wi-Fi").
  - `!view` → loading.
  - `!view.consented` → `Onboarding`.
  - `alertState` in `CHECKIN_PENDING | FAMILY_ESCALATED | SECURITY_ESCALATED`, or `RESOLVED` within the last ~8 s of real time → `CheckIn`.
  - else → `Home`.

- [ ] **Step 3: `Onboarding`** — 2 steps. (1) "Hello, Madam Lee" + plain explanation: SimeGuardian notices if your home has been unusually quiet and checks you're OK; shares only a status with Daniel, never where you go or what you do; no cameras, nothing to wear. (2) "Daniel is your contact" + big **I agree** button → request notification permission (`Notifications.requestPermissionsAsync`) then `post('/api/households/lee/consent')`. Large type (body ≥ 20 pt, buttons ≥ 64 pt tall), high contrast.

- [ ] **Step 4: `Home`** — "You're all set, Madam Lee", "Daniel will only be told if you don't reply to a check-in", Away mode switch (POST away), list "Today's check-ins" from `checkinsToday` (HH:MM + text, empty state "No check-ins today").

- [ ] **Step 5: `CheckIn` + notification**
  - `Notifications.setNotificationHandler` at module load: show banner + list + sound while foregrounded.
  - When `alertState` transitions into `CHECKIN_PENDING` (compare with previous value in a ref), call `scheduleNotificationAsync({ content: { title: 'SimeGuardian', body: 'Are you OK, Madam Lee? Tap to let us know.' }, trigger: null })` and a `Haptics.notificationAsync(Warning)`.
  - Screen by state:
    - `CHECKIN_PENDING`: full-screen "Are you OK?", countdown from `countdownSimMs` as `MM:SS`, huge green **I'm OK** button → `post('/api/households/lee/checkin', {actor:'resident'})`.
    - `FAMILY_ESCALATED`: "We've let Daniel know" + **I'm OK** still available.
    - `SECURITY_ESCALATED`: "Security is coming to check on you" + guard state line (Assigned / On the way) + **I'm OK** still available.
    - `RESOLVED`: "All clear. Thank you." then returns to Home.

- [ ] **Step 6: On-device verification** — server running; `cd app && npx expo start`; scan QR with the iPhone Camera → opens in Expo Go; open iPhone Mirroring on the Mac.
  - Onboarding → I agree → Home.
  - Dashboard "goes quiet" → banner + pop-up on phone within ~1 s, countdown runs 30:00 → 00:00 over 10 s.
  - Let it run → phone shows "We've let Daniel know", then "Security is coming…", guard clicks update the line, then "All clear".
  - Reset → phone returns to onboarding. Second run: tap I'm OK → every dashboard tab shows resolved within ~1 s.
  - Stop the server → phone shows the Offline screen with the URL within ~3 s; restart → recovers.

- [ ] **Step 7: Commit** — `git add app && git commit -m "feat(app): Expo resident app with consent, home and check-in flow"`

---

### Task 5: Run instructions and rehearsal

**Files:**
- Modify: `README.md`

- [ ] **Step 1: README "Run the demo" section** — prerequisites (Node 24, Expo Go on iPhone, same Wi-Fi or hotspot); `cd server && npm start`; open `http://localhost:4000`; `cd app && npx expo start`, scan QR; iPhone Mirroring (QuickTime over USB as backup); `EXPO_PUBLIC_SERVER_URL=http://<mac-ip>:4000` override if the auto-detected URL fails; venue fallback `npx expo start --tunnel` + hotspot. Note what is simulated (signals, guards, family call) and what is not built (BRD phase 2/3 integrations). Link the spec and BRD.

- [ ] **Step 2: Full rehearsal** — run Scenario A and Scenario B back to back following the spec's scene list, with Reset between. Pass = both complete without touching anything except the documented buttons, and `cd server && npm test` passes.

- [ ] **Step 3: Commit** — `git add README.md && git commit -m "docs: how to run the SimeGuardian demo"`
