# SimeGuardian

An opt-in wellbeing check for Sime Darby Property township residents who are often home alone. Township signals (car plate recognition, access cards, SDP app activity, a water flow sensor in the pilot) tell the system whether a resident is home and recently active. If an unexplained silence goes on too long, it escalates step by step: an in-app check-in, then the family contact, then a security welfare check.

Built for the Sime Darby Property University Hackathon 2026 (Township of Tomorrow).

## Run the demo

You need Node 24 on the Mac and the **Expo Go** app on an iPhone. The Mac and the phone must be on the same Wi-Fi network, or the Mac can join the phone's hotspot.

1. **Server and dashboard**
   ```bash
   cd server
   npm start
   ```
   Open <http://localhost:4000>. Tabs: Demo control, Family (Daniel), Security console.

2. **Resident app (Madam Lee)**
   ```bash
   cd app
   npm install
   npx expo start
   ```
   Scan the QR code with the iPhone Camera, and it opens in Expo Go. On the Mac, open **iPhone Mirroring** so the phone shows next to the dashboard (QuickTime → New Movie Recording → iPhone over USB is the backup).

3. **If the phone shows "Can't reach SimeGuardian server"**, start Expo with the Mac's IP set explicitly:
   ```bash
   EXPO_PUBLIC_SERVER_URL=http://<mac-ip>:4000 npx expo start
   ```
   At a venue whose Wi-Fi isolates devices, use the phone's hotspot, or `npx expo start --tunnel` together with the URL override.

### Scenario A: escalation
1. On the phone, go through onboarding and tap **I agree**.
2. Let the dashboard run for a moment, then click **Madam Lee goes quiet**.
3. The phone shows a notification, then the "Are you OK?" pop-up with a countdown.
4. Don't tap anything. After 10 s, Daniel is notified (Family tab).
5. After another 10 s, a welfare check appears on the Security console. Click through **Assign guard → Mark on the way → Mark arrived**.
6. The phone shows "All clear". The event log reads like real time (+30 min, +15 min, +2, +3, +3).

### Scenario B: happy path
Click **Reset demo**. The phone returns to onboarding. Repeat steps 1–3, then tap **I'm OK** on the phone, and every screen closes the alert.

The escalation step (default 10 s) and the clock speed can be changed on the Demo control tab.

### What is simulated
Activity signals, the guard, and the family phone call are simulated. Nothing connects to real plate recognition, access cards, water sensors, Air Selangor or TNB yet (BRD phases 2–3). The engine uses rules plus a per-household baseline, not a trained model.

## Tests

```bash
cd server && npm test
node --test app/src/timeout.test.ts   # from the repo root
```

## Docs

- [Business Requirements Document](docs/BRD.md)
- [Demo design](docs/superpowers/specs/2026-10-19-simeguardian-demo-design.md)
- [Implementation plan](docs/superpowers/plans/2026-10-19-simeguardian-demo.md)
