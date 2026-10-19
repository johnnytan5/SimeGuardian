# SimeGuardian — Mobile App Implementation Plan

18 October 2026 · Version 0.1 · Proposed implementation, not completed work

This plan covers the native iPhone resident and family app built with Swift and SwiftUI in Xcode. [Business and Product Requirements](REQUIREMENTS.md) remains the source for product decisions and acceptance; this file defines the mobile stack, structure, integration contracts, build sequence and verification.

## Platform decision and stack

The first app is **iPhone only**, using **Swift + SwiftUI in Xcode**. Xcode is the IDE, build/signing tool and simulator environment; Swift is the language; SwiftUI is the UI framework. This selection replaces the earlier cross-platform mobile choice. The browser-based MLOps dashboard remains a separate application using the same backend contracts.

Local tools verified on 18 October 2026: Xcode 26.6 and Apple Swift 6.3.3. No mobile project or backend implementation currently exists in this repository. Use the installed Xcode toolchain initially and record its version with the first working build.

| Layer | Selected approach | Responsibility / boundary |
| --- | --- | --- |
| Target | iPhone; proposed minimum iOS 17 | Confirm the oldest intended demonstration and pilot devices before locking the deployment target |
| Language and UI | Swift, SwiftUI, NavigationStack and standard system controls | Native resident and family interfaces in one app, with role-specific actions |
| UI state | Observation (`@Observable`), `@State`, `@Environment`; UI mutations on `@MainActor` | Small feature stores; server responses remain authoritative. Observation in SwiftUI requires iOS 17+ ([Apple guide](https://developer.apple.com/documentation/swiftui/managing-model-data-in-your-app)) |
| HTTP and decoding | Foundation URLSession, async/await and Codable | Fetch authorised snapshots, submit actions and expose loading/error/retry states |
| Foreground live updates | URLSessionWebSocketTask over an authenticated connection | Receive incident and notification events; reconnect and fetch the latest state ([Apple WebSocket API](https://developer.apple.com/documentation/foundation/urlsessionwebsockettask)) |
| Foreground alert | SwiftUI in-app banner with an incident destination | Working pop-up from a backend event; avoid interrupting an unsaved response form |
| System notifications | UserNotifications + APNs | Additional milestone for background/closed-app alerts; signing, permission and provider configuration required |
| Local storage | UserDefaults for display preferences; Keychain for session credentials | Keep incident/source history on the backend. Refresh authoritative state after launch; clear account-scoped state at sign-out |
| Tests | XCTest and XCUITest in the Xcode project | State/decoding/retry tests and resident/family interaction tests |
| Dependencies | Apple frameworks initially; no third-party mobile package required | Add a package only when a demonstrated requirement cannot be covered simply by the selected frameworks |

The mobile app does not train a model or own the synthetic utility pipeline. Dataset generation, training, inference, recovery decisions and durable response scheduling run in shared backend services and appear in the web dashboard. Backend and dashboard frameworks are separate implementation decisions; this mobile plan defines their required interfaces.

## App structure and navigation

Use one app target with a small set of feature views/stores, one API client, one foreground event connection and one notification coordinator. Introduce shared helpers only when more than one feature needs them. A proposed starting layout is:

```text
mobile/ios/
  SimeGuardian.xcodeproj
  SimeGuardian/
    App/                  app entry, session and role-scoped navigation
    Features/
      Onboarding/         resident consent, home and accepted family link
      Home/               resident or family overview
      Incidents/          alert detail, response actions and timeline
      Sharing/            contacts, away mode and withdrawal
    Models/               Codable API snapshots, events and actions
    Services/             API client, event stream, notifications, credential storage
    Resources/            assets and localised strings
  SimeGuardianTests/
  SimeGuardianUITests/
```

Use Home, Wellbeing, Alerts and Profile as the initial navigation. Resident views prioritise a large “I'm okay” action, request-contact action, current follow-up and away mode. Family views prioritise the linked resident, a minimal concern reason, “I will check in” and completed-outcome recording. Township response and MLOps operation remain web views; the phone may display their status without granting operator access.

Use [DESIGN.md](DESIGN.md) as a reference for SDP brand colours, warm accents, imagery and rounded surfaces. Build native controls with system typography, Dynamic Type, VoiceOver labels, adequate contrast and generous touch targets. Validate the smallest supported iPhone layout and large accessibility text. A development-only role/account selector belongs in the demo configuration, outside resident settings.

## Backend contract required by the app

Define these endpoints and fixture responses before building dependent screens. Paths are proposed API contracts, not existing routes. Session identity and permissions come from the backend; the client cannot choose an arbitrary actor or access another household by editing an ID.

| Contract | Required mobile behaviour |
| --- | --- |
| `GET /v1/me` | Receive the signed-in role, permitted household links and available actions |
| `POST /v1/enrolments`; `POST /v1/contact-links/{id}/accept` | Record resident consent/home and show pending versus accepted family linkage |
| `GET /v1/households/{id}/overview` | Load routine summary, six source statuses/freshness, away mode, sharing/withdrawal state and current incident, filtered for the user's role |
| `GET /v1/incidents`; `GET /v1/incidents/{id}` | Load authorised incident summaries and the latest versioned detail/timeline |
| `POST /v1/incidents/{id}/actions` | Submit acknowledgement, completed check-in, resident confirmation or request-contact action with an idempotency key; render success only after server acceptance |
| `PUT /v1/households/{id}/away-mode` | Submit start/end times and display the stored mode without closing existing incidents |
| `POST /v1/withdrawals`; `GET /v1/withdrawals/{id}` | Show request time, server-issued deadline, pending status and completion within 23 hours |
| `POST /v1/app-activity` | Send minimal meaningful resident interactions with observation time; server validates role and attribution. Exclude background refresh, push opening and family actions from resident recovery evidence |
| `/v1/events` WebSocket | Receive authorised events with event ID, incident ID, revision, stage, reason, server timestamps and deadlines; use a replay cursor or refresh snapshots after a gap |
| Device registration for the APNs milestone | Bind and update app device tokens to the signed-in account and notification environment; revoke the binding on sign-out/account change |

Persist incident and stage deadlines on the server. Use UTC in contracts and local formatting in views. Event IDs deduplicate retries; per-incident revisions prevent old events from overwriting newer state. Fetch the latest authorised incident after opening a notification or resuming the app. Treat a version conflict as a refresh-and-review case, rather than overwriting a newer human response.

An offline action remains visibly unsent; retain a draft where useful and offer an explicit retry using the same idempotency key. Do not show “Acknowledged” or “Resolved” before the backend accepts the action. If the connection resumes after a deadline, the server applies the response at receipt time and returns the actual stage/ownership.

## Notifications and server-owned timing

The mandatory first integration is a real foreground backend event displayed as an in-app SwiftUI banner. Tapping opens the current incident. The transport must not produce duplicate banners for the same notification event, and a late/stale notification must not regress the visible state.

The backend schedules family at t0, resident at t0+5 minutes if unanswered, and township at t0+10 minutes if still unanswered. It also evaluates recovery and enforces the 23-hour withdrawal deadline. The app displays these outcomes and countdowns; it must not schedule the workflow with a local timer, a long-running background socket or a client decision that the model has recovered.

For the additional system-notification milestone, request notification permission in context, configure APNs and the Xcode Push Notifications capability, and show a generic lock-screen message with an incident reference. Fetch the authorised minimal reason after opening the app. Handle permission denied, device token changes and notification taps that launch the app. Follow [Apple's permission guidance](https://developer.apple.com/documentation/usernotifications/asking-permission-to-use-notifications) and [APNs registration requirements](https://developer.apple.com/documentation/usernotifications/registering-your-app-with-apns).

Do not rely on silent background pushes or background runtime for the five- and ten-minute schedule. iOS controls background execution and silent delivery is not guaranteed ([background strategies](https://developer.apple.com/documentation/backgroundtasks/choosing-background-strategies-for-your-app), [background notification limits](https://developer.apple.com/documentation/usernotifications/pushing-background-updates-to-your-app)). APNs provider acceptance does not prove receipt or a human response. Keep delivery, opening and acknowledgement distinct in app and dashboard traces.

A local notification or simulator push can exercise the UI path during development; label it as simulation. End-to-end APNs acceptance requires signed-app/provider configuration and a real delivery test. A simulator-injected event is not proof that the backend can deliver a production push.

## Implementation order and completion gates

Build each stage on the previous stage's accepted contracts. This is a delivery sequence, not a calendar commitment.

| Stage | Work | Completion gate |
| --- | --- | --- |
| 1. Xcode foundation | Create the iPhone SwiftUI target and XCTest/XCUITest targets; set the proposed minimum OS, bundle ID and build configuration; add role-scoped fixture data and navigation | Simulator builds and launches; resident and family fixtures render with no external service; dependency/version choices recorded |
| 2. Resident and family screens | Build onboarding, contact acceptance, overview, alert detail/timeline, response forms, away mode and withdrawal states; use deterministic fixtures and SwiftUI previews | Both role journeys are reviewable, actions have loading/error states, and large text/VoiceOver can reach primary controls |
| 3. API integration | Implement URLSession/Codable contracts, session/household permissions, secure credential storage, accepted-action handling and explicit offline retry | Backend state survives relaunch; failed or repeated writes never create a false completion or duplicate response |
| 4. Live incident journey | Add the foreground WebSocket, banner/deep link, snapshot reconciliation, incident revisions and separate family/resident stages | Backend-generated incident produces the family pop-up; advancing the shared demo clock shows resident at +5 and township at +10 without phone-owned scheduling |
| 5. Recovery and withdrawal | Render AI-recovery versus human outcomes, notification updates, accepted township-task disposition and requested/pending/completed withdrawal | Sustained backend recovery updates all views; single activity does not close locally; monitoring/sharing completion appears by the 23-hour server deadline |
| 6. Optional APNs delivery | Configure signing, permission, token registration/provider, foreground/system presentation and launch-from-notification | Test actual delivery and tap-to-current-incident with the app backgrounded; denied permission remains visible; distinguish simulated tests from APNs evidence |
| 7. End-to-end hardening | Check refresh/reconnect, stale and duplicate events, role access, action conflicts, accessibility and app/dashboard trace parity | Required mobile acceptance cases pass on the intended simulator/device; record device/OS, observed failures and which push paths were exercised |

The backend work needed for stages 3–5 is a parallel project workstream, not a reason to fabricate local success states. Fixture mode permits screen development, but the anomaly → incident → pop-up acceptance requires the shared backend and a traceable inference event.

## Mobile verification and handoff

Test the behaviours that can lose or misrepresent a response: wrong-account incident access, duplicate/reordered events, stale deep links, offline submit/retry, a response arriving at the +5/+10-minute boundary, and account switching. Verify resident confirmation, explicit family outcome and AI-recovery outcome remain distinct. Verify the app shows pending withdrawal until server completion and does not continue sending resident activity after the effective withdrawal time.

Use unit tests for Codable contracts, event revision/deduplication and accepted-action state; use UI tests for the main resident/family actions and large-text navigation. Use backend contract/integration checks for durable scheduling and permission enforcement. Capture the final app and dashboard timeline for the same incident and model version.

At handoff, provide the Xcode project, recorded toolchain/OS target, fixture configuration, API/event contract, tested device/simulator list, test results and a short demo sequence. Minimum iOS support, real signing/device access and whether background APNs belongs in the hackathon demonstration remain implementation checkpoints. This plan does not create an app, configure accounts or claim that push delivery has been tested.
