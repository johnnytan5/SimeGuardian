import { useEffect, useRef, useState } from "react";
import { live, usePoll } from "./liveApi";

// PHONE_SHOW=true: a phone mockup slides in from the right while a live check-in is open, mirroring
// the Expo app's resident and family screens from the same engine state. For shared prototype links,
// where nobody is holding the real phone. Follows the escalation; the buttons act like the app's.

type AlertState = "CHECKIN_PENDING" | "FAMILY_ESCALATED" | "SECURITY_ESCALATED" | "RESOLVED";
type Reason = { signal: string; label: string; detail: string; concerning: boolean; percentOfUsual: number | null };
type Resident = { resident: string; familyContact: string; alertState: AlertState | null; guard: string; countdownSimMs: number | null; checkinWindowMs: number; reasons: Reason[] };
type Family = { resident: string; status: string; alertState: AlertState | null; since: number | null; reasons: Reason[] };

const OPEN: (AlertState | null)[] = ["CHECKIN_PENDING", "FAMILY_ESCALATED", "SECURITY_ESCALATED"];
const ALL_CLEAR_MS = 8000;
const GLYPH: Record<string, string> = { electricity: "ϟ", water: "◈", gate: "⇄", app: "▢" };
const GUARD_LINE: Record<string, string> = {
  NONE: "A guard is being assigned.",
  ASSIGNED: "A guard has been assigned.",
  ON_THE_WAY: "The guard is on the way to her door.",
};
const mmss = (ms: number) => {
  const total = Math.ceil(ms / 1000);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
};
const hhmm = (ms: number) =>
  new Intl.DateTimeFormat("en-MY", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Kuala_Lumpur" }).format(ms);

function Reasons({ reasons, title, compact }: { reasons: Reason[]; title: string; compact?: boolean }) {
  const shown = reasons.filter((r) => r.concerning).slice(0, compact ? 3 : undefined);
  if (!shown.length) return null;
  return (
    <div className="pd-reasons">
      <span>{title}</span>
      {shown.map((r) => (
        <div key={r.signal} className="pd-reason">
          <i aria-hidden="true">{GLYPH[r.signal]}</i>
          <div>
            <strong>{r.label}</strong>
            {!compact && <small>{r.detail}</small>}
          </div>
        </div>
      ))}
    </div>
  );
}

// Watch-face dial: lit ticks are the share of the five-minute window still remaining.
function Dial({ ms, windowMs, contact }: { ms: number; windowMs: number; contact: string }) {
  const lit = Math.ceil(Math.min(1, Math.max(0, ms / windowMs)) * 60);
  return (
    <div className="pd-dial">
      <svg viewBox="0 0 100 100" aria-hidden="true">
        {Array.from({ length: 60 }, (_, i) => (
          <line key={i} x1="50" y1={i % 5 ? 4 : 2.5} x2="50" y2={i % 5 ? 8.5 : 10} transform={`rotate(${i * 6} 50 50)`}
            stroke="#fff" strokeWidth={i % 5 ? 1 : 1.6} strokeLinecap="round" opacity={i < lit ? 1 : 0.22} />
        ))}
      </svg>
      <div className="pd-dial-core">
        <b>{mmss(ms)}</b>
        <small>before we contact</small>
        <strong>{contact}</strong>
      </div>
    </div>
  );
}

function Brand() {
  return (
    <div className="pd-brand">
      <img src="/brand/sime-darby-property.png" alt="" />
      <div><strong>SimeGuardian</strong><small>Sime Darby Property</small></div>
    </div>
  );
}

function ResidentScreen({ v }: { v: Resident }) {
  const ok = () => void live("/households/lee/checkin", { actor: "resident" }).catch(() => {});
  if (v.alertState === "RESOLVED") {
    return (
      <div className="pd-screen pd-ok pd-center">
        <div className="pd-tick">✓</div>
        <h3>All clear</h3>
        <p>Thank you, {v.resident}. Everyone has been told you're fine.</p>
      </div>
    );
  }
  const [title, detail, tone] =
    v.alertState === "CHECKIN_PENDING" ? ["Are you OK?", "Your home has been quiet for a while.", "pd-pending"]
    : v.alertState === "FAMILY_ESCALATED" ? [`We’ve let ${v.familyContact} know`, `${v.familyContact} may call you. If you’re fine, tap below.`, "pd-alert"]
    : ["Security is on the way", GUARD_LINE[v.guard] ?? "", "pd-alert"];
  return (
    <div className={`pd-screen ${tone}`}>
      <Brand />
      <h3>{title}</h3>
      <p>{detail}</p>
      <Reasons reasons={v.reasons} title="Why we’re asking" compact />
      {v.countdownSimMs !== null && <Dial ms={v.countdownSimMs} windowMs={v.checkinWindowMs} contact={v.familyContact} />}
      <button className="pd-button pd-light" onClick={ok}>I'm OK</button>
    </div>
  );
}

function FamilyScreen({ v }: { v: Family }) {
  const [calling, setCalling] = useState(false);
  const safe = () => void live("/households/lee/checkin", { actor: "family" }).catch(() => {});
  const resolved = v.alertState === "RESOLVED";
  const [title, detail, tone] =
    resolved ? ["Mum is safe", "Thank you. The check-in is closed.", "pd-ok"]
    : v.status === "CHECKIN_PENDING" ? ["We’ve asked Mum if she’s OK", "You’ll hear from us if she doesn’t reply.", "pd-pending"]
    : ["Mum hasn’t replied", v.alertState === "SECURITY_ESCALATED" ? "Township security has been asked to check on her at home." : "Please call her now, or mark her safe once you’ve spoken to her.", "pd-alert"];
  return (
    <div className={`pd-screen ${tone}`}>
      <Brand />
      <div className="pd-who">
        <img src="/brand/avatar-madam-lee.png" alt="" />
        <div><small>Your mum</small><strong>{v.resident}</strong></div>
      </div>
      <h3>{title}</h3>
      <p>{detail}</p>
      {!resolved && v.since !== null && <span className="pd-chip">Quiet since {hhmm(v.since)}</span>}
      {!resolved && <Reasons reasons={v.reasons} title="Why you’re seeing this" compact />}
      {!resolved && (
        <div className="pd-actions">
          {calling && <p className="pd-calling">Calling Mum… (demo)</p>}
          <button className="pd-button pd-light" onClick={() => { setCalling(true); setTimeout(() => setCalling(false), 2000); }}>Call Mum</button>
          <button className="pd-button pd-ghost" onClick={safe}>Mark safe</button>
        </div>
      )}
    </div>
  );
}

export function PhoneDock() {
  const resident = usePoll<Resident>("/resident/lee").data;
  const family = usePoll<Family>("/family/lee").data;
  const state = resident?.alertState ?? null;
  const [clearUntil, setClearUntil] = useState(0);
  const [, rerender] = useState(0);
  const [hidden, setHidden] = useState(false);
  // Follow the escalation (Madam Lee first, Daniel once family is alerted) unless the viewer picks a person.
  const stageView = state === "FAMILY_ESCALATED" || state === "SECURITY_ESCALATED" ? "family" : "resident";
  const [picked, setPicked] = useState<"resident" | "family" | null>(null);
  const prev = useRef<AlertState | null>(null);

  useEffect(() => {
    if (state === "RESOLVED" && OPEN.includes(prev.current)) {
      setClearUntil(Date.now() + ALL_CLEAR_MS);
      setTimeout(() => rerender((n) => n + 1), ALL_CLEAR_MS + 50);
    }
    if (OPEN.includes(state) && !OPEN.includes(prev.current)) setHidden(false);
    if (state !== prev.current) setPicked(null);
    prev.current = state;
  }, [state]);

  const shown = !hidden && !!resident && (OPEN.includes(state) || (state === "RESOLVED" && Date.now() < clearUntil));
  const view = picked ?? stageView;
  // Make room on the page while the phone is out, so it never covers the dashboard.
  useEffect(() => {
    document.body.classList.toggle("phone-dock-open", shown);
    return () => document.body.classList.remove("phone-dock-open");
  }, [shown]);
  return (
    <aside className={`phone-dock ${shown ? "is-shown" : ""}`} aria-hidden={!shown} aria-label="Phone preview">
      <div className="pd-switch" role="group" aria-label="Whose phone">
        <button aria-pressed={view === "resident"} onClick={() => setPicked("resident")}>Madam Lee</button>
        <button aria-pressed={view === "family"} onClick={() => setPicked("family")}>Daniel</button>
        <button aria-label="Hide phone preview" onClick={() => setHidden(true)}>×</button>
      </div>
      <div className="pd-frame">
        <div className="pd-island" />
        {resident && (view === "resident" || !family ? <ResidentScreen v={resident} /> : <FamilyScreen v={family} />)}
      </div>
    </aside>
  );
}

export const phoneShow = __PHONE_SHOW__;
