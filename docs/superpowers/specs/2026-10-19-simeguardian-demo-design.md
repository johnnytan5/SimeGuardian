# SimeGuardian hackathon demo — design

Date: 19 Oct 2026. Deadline for submission: 23 Oct 2026, 11:59 p.m.

## Intent

The SDP University Hackathon requires a pitch deck, a 5-minute video or live demo link, and a prototype/repo link (see `docs/BRD.md` and the briefing reference). This design covers the **prototype** and the scene the video records.

The video has to make one thing obvious in seconds: when an older resident living alone goes quiet at home, SimeGuardian notices, asks her first, then escalates to family, then sends a guard to the door. Judges weigh impact (25%), innovation (20%) and feasibility (20%), so the demo must look real and be honest about what is simulated.

## The scene

One Mac screen, split:

- **Left:** a real iPhone running Madam Lee's resident app in Expo Go, shown on the Mac with the macOS iPhone Mirroring app (QuickTime over USB as backup).
- **Right:** a web dashboard in the browser.

### Scenario A — escalation (main story)

1. Dashboard shows a few households (Madam Lee + 3–4 others) running on simulated time. Each has a baseline activity curve; today's signals (water use, app activity, gate entries) plot on top.
2. Presenter clicks **"Madam Lee goes quiet"**. Simulated time speeds up; her inactivity gap crosses her personal threshold. Dashboard marks her "Check-in pending".
3. **Phone:** a local notification appears, then a full-screen "Are you OK?" pop-up with a large "I'm OK" button and a countdown (30 real-world minutes compressed to 10 seconds).
4. Nobody taps. Dashboard flips her to **"Escalated: family"**. Family tab shows Daniel's alert with "Call Mum" and "Mark safe" buttons.
5. Daniel's window (also compressed) runs out with no action. Status flips to **"Escalated: security"**. Security console lists a welfare-check request for her unit.
6. Presenter clicks through guard states on the console: **Assigned → On the way → Arrived: resident safe**. Alert closes; event log shows the full timeline with timestamps.

### Scenario B — happy path

Same trigger; Madam Lee taps "I'm OK" on the phone. Every screen closes the alert immediately.

A **Reset** button on the dashboard returns everything to the start so scenarios can be re-recorded.

## Parts

### 1. Resident app (Expo / React Native, TypeScript, run in Expo Go)

Expo Go only — no dev build, no EAS, no Xcode. Only libraries bundled in Expo Go may be used (e.g. `expo-notifications` for local notifications, `expo-haptics`). The project's Expo SDK must match the Expo Go version on the phone.

- **Consent/onboarding:** plain-language explanation, what is shared (status only), resident consents herself, optional family delegate (Daniel) shown as already added.
- **Home screen:** big status ("You're all set"), today's check-ins, Away mode toggle, Pause service.
- **Check-in pop-up:** full-screen, large "I'm OK" button, countdown. Also fires a local notification so it shows if the app is backgrounded.
- Large text, high contrast. Language switcher is a non-goal; English only for the demo.
- Talks to the local server over HTTP at the Mac's LAN IP (not `localhost`); the server URL must be easy to change (e.g. derived from the Expo dev-server host, with an override). Phone and Mac on the same Wi-Fi or the phone's hotspot. Polls about every second, or uses server-sent events — builder's call.

### 2. Local server (Node, on the Mac)

- Holds all demo state in memory: households, simulated clock, alert state machine, event log.
- Runs the signal simulator (fake signals per household) and the alert rule.
- Serves the web dashboard and a small JSON API used by both the dashboard and the resident app. Listens on all interfaces so the phone can reach it.
- No database, no auth. Restart = fresh demo.

### 3. Web dashboard (served by the local server)

Three tabs:

- **Demo control and baseline:** household list with status chips; per-household chart of baseline vs today's activity with the threshold line; "Madam Lee goes quiet", speed control, Reset.
- **Family (Daniel):** status only — OK / Check-in pending / Escalated — never a movement timeline. Buttons: Call Mum (fake), Mark safe.
- **Security console:** welfare-check queue with unit, time escalated, and guard state buttons. Never shows home/away for any household (BRD privacy rule).

### Alert state machine

`OK → CHECKIN_PENDING → FAMILY_ESCALATED → SECURITY_ESCALATED → RESOLVED`

- Any state before RESOLVED can be closed by the resident's "I'm OK" or the family's "Mark safe".
- Every transition is written to the event log with sim-time and who acted.
- Away mode suppresses the trigger entirely.

## Goals

- Recordable, reliable end-to-end run of Scenarios A and B on one laptop plus the mirrored iPhone.
- Resident app feels like a real resident app module ("plugs into the SDP app"), not a wireframe.
- Baseline chart makes the detection logic understandable at a glance.
- Repo is clean enough to submit as the prototype link, with a README showing how to run it.

## Non-goals

- Real ML or model training. The engine is rules plus a per-household baseline, as in the BRD.
- Real integrations (plate recognition, access cards, water sensors, Air Selangor, TNB).
- Real push notifications (APNs), SMS, voice calls or guard dispatch.
- Family app on a second phone.
- Hosted/cloud deployment. If a live demo link is wanted later, swap the local server for a hosted one.
- Multi-language UI.

## Anti-goals

- Cloning or reverse-engineering the real SDP app, or using SDP's assets/logos as if official.
- Showing "home is empty" to security, or a movement timeline to family.
- Medical framing ("health monitoring", "diagnosis").
- Anything that makes the live recording flaky (network dependence, manual timing).

## Constraints

- Xcode is not installed and the Mac has ~21 GB free, so no Xcode, iOS simulator or native build. This is why the app runs in Expo Go on a real iPhone.
- Venue Wi-Fi (14 Nov pitch) may isolate devices; fall back to the phone's hotspot or `expo start --tunnel` plus a reachable server URL.
- Node 24 is available.
- Time: ~4 days to the deadline, shared with the deck, video and validation survey.

## Decided by the user

- Phone view is an Expo app run in Expo Go on the user's real iPhone, mirrored to the Mac (replaces the earlier Xcode-simulator plan because of disk space).
- Expo Go only, no Expo build.
- Demo order: Madam Lee's pop-up first, then family escalation, then guards.
- Family view lives in the web dashboard (one phone only).

## My calls (not explicitly agreed)

- Local Node server as the shared state between phone and browser.
- TypeScript across app, server and dashboard.
- Time compression: each escalation step (check-in window, family window) waits 10 s of real time, adjustable from the dashboard. (User's call: 10 s.)
- 4–5 simulated households, with Madam Lee as the scripted one.
- Plain HTML/JS dashboard served by the Node server (no frontend framework) unless the builder finds a charting need that justifies one.
- **App is in the foreground on camera.** Polling/SSE is enough. The "notification" is a foreground banner (`UNUserNotificationCenter` delegate presenting while active), followed by the full-screen pop-up. No `simctl push` or background delivery.
- **Event log shows believable sim-time durations.** The sim clock jumps per phase so the log reads like real life: threshold crossed 10:02 → family escalated 10:32 (30-min check-in window) → security escalated 10:47 (15-min family window) → guard arrived 10:55. Real-time wait per phase is 10 s. The speed control only affects the normal "ticking along" part.
- **Resident app controls:**
  - Consent/onboarding runs on first launch and is recorded briefly. The dashboard's Reset also resets the app back to onboarding.
  - Away mode works for real: it blocks the trigger. It shows on the presenter's demo-control tab only, never on the security console.
  - "Pause service" is dropped. Away mode covers it.
  - "Today's check-ins" comes from the server's event log.
- **Madam Lee's screen follows the alert.** It shows the pop-up with countdown → "We've let Daniel know" → "Security is coming to check on you" → "All clear". It updates whenever another party closes the alert.

## Left to the builder

- Polling vs server-sent events between clients and server.
- Charting library choice.
- Folder layout (e.g. `app/` for Expo, `server/` for Node + dashboard).
- Exact visual styling, within "real township app, not SDP-branded".
