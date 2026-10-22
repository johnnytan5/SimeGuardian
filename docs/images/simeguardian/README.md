# SimeGuardian deck screenshots (22 Oct 2026)

All data is synthetic. Captured from the local demo with Playwright.

| Deck shot | File | Use on |
| --- | --- | --- |
| 1. Madam Lee's phone | `01_madam-lee_are-you-ok.png` (1179×2556, iPhone size) | Slides 5, 7 |
| 2. Daniel's phone | `02_daniel_family-alert.png` (1179×2556) | Slides 5, 7 |
| Extra phone screens (new design) | `01b_madam-lee_consent.png` (the 3-step promise), `01c_madam-lee_home.png`, `02c_daniel_mum-is-safe.png` | Optional |
| 3. Incident timeline | **`03b_event-log_demo-control.png`**: clearest, shows the whole chain in plain text (resident → Daniel → welfare check → guard arrived) | Slide 7 |
|  | `03a_incident-timeline.png`: Jiale's dashboard, incident page with model trigger, timeline and notification evidence (tall, crop as needed) | Slide 11 |
|  | `03c_security-console.png`: guard's welfare-check request | Optional |
| 4. 3D township | `04_township_3d_wide-16x9.png` | Slide 11 (wide) |
|  | `04_township_3d_square.png` | Slides 1, 6 (square) |
|  | `04_township_3d_tall.png` | Slide 12 (tall) |
|  | `04_township_top_*.png`: same three shapes, flat top-down view | Alternative |
|  | `04a_township_full-dashboard.png`: whole Overview page with side panels | Alternative |
| 5. Model page | **`05a_model_rule-vs-model.png`**: rule vs model table; numbers match the deck (rule test precision 0.778) | Slide 11 |
|  | `05b_model-registry.png`: Jiale's MLflow registry (v1 → v2 promoted) | Alternative |

## Check before using

- **Phone screens redesigned 22 Oct.** The whole screen now changes colour with the status: orange for the check-in, red when family is alerted, green for all clear. It carries the SDP logo and figurine avatars. Re-import 01 and 02 if the deck has the old versions.

- **Timing now matches the deck: 5 + 5 minutes.** Retaken 22 Oct. The phone shows "04:46 before we contact Daniel", and the log reads "No reply in 5 min" and then "No reply in 10 min — welfare check requested". The demo server was changed from 30 + 15 to 5 + 5.
- **Button names differ from the deck text.** The app says "I'm OK" (no "Contact me") and "Call Mum" / "Mark safe" (no "I'll check in" / "Mark completed"). Make the slide text match the screenshots.
- **The phone shots have no iOS status bar.** They are the Expo app rendered in a browser at iPhone size. Drop them into a phone mockup frame, or take real screenshots on the iPhone through Expo Go.
- **The township shots show simulated readings.** The map geography is real (OpenStreetMap). Caption them "simulated household data".
