import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { live } from "./liveApi";

// Guided demo in the style of an on-screen companion: a pointer flies to the thing being explained,
// draws a ring around it and narrates in a speech bubble. It presses the real buttons, so the live
// engine, the phone preview and the guardhouse react exactly as they would for a person.
// GUIDED_DEMO=true starts it on a visitor's first entry; the "Demo guide" button replays it.

// --- tiny shared store, so the phone preview can show itself during the tour ---
type TourState = { active: boolean; reminder: boolean };
let tourState: TourState = { active: false, reminder: false };
const listeners = new Set<() => void>();
const setTour = (next: Partial<TourState>) => {
  tourState = { ...tourState, ...next };
  listeners.forEach((listener) => listener());
};
export const startTour = () => setTour({ active: true, reminder: false });
export function useTourActive() {
  return useSyncExternalStore((l) => (listeners.add(l), () => listeners.delete(l)), () => tourState.active);
}
function useTourState() {
  return useSyncExternalStore((l) => (listeners.add(l), () => listeners.delete(l)), () => tourState);
}

type AlertState = "CHECKIN_PENDING" | "FAMILY_ESCALATED" | "SECURITY_ESCALATED" | "RESOLVED" | null;
type Ctx = { click: (selector: string) => Promise<void>; cancelled: () => boolean };
type Step = {
  path: string;
  target?: string; // CSS selector(s); the first visible match is circled
  title: string;
  text: string;
  run?: (ctx: Ctx) => Promise<void>; // silent setup only (reset, leave fullscreen); never a demo action
  // A demo action waits for the viewer: they press the bubble's button or the real one on the page.
  action?: { label: string; run: (ctx: Ctx) => Promise<void>; done: (alert: AlertState) => boolean };
  waitFor?: AlertState; // hold on this step until Madam Lee's alert reaches this state
  waiting?: string;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const STEPS: Step[] = [
  {
    path: "/live",
    target: "#main .page-heading",
    title: "Welcome to SimeGuardian",
    text: "I’ll walk you through one real check-in, from a quiet home to a guard at the door. Everything you’ll see is running live, on simulated data.",
    run: async () => {
      await live("/reset", {});
      await live("/settings", { stepMs: 10000 });
    },
  },
  {
    path: "/live",
    target: '[data-tour="lee-row"]',
    title: "Meet Madam Lee",
    text: "Madam Lee is 72 and lives alone at No. 12, Jalan Elmina 3. She opted in, and chose her son Daniel as her contact.",
  },
  {
    path: "/live",
    target: '[data-tour="activity-chart"]',
    title: "Her usual day",
    text: "The shaded curve is her usual pattern, learned from her own home’s electricity, water, gate-card and app activity. The bars are today.",
  },
  {
    path: "/live",
    target: '[data-tour="go-quiet"]',
    title: "Let’s mock an anomaly",
    text: "This simulates her home going quiet: no water, electricity at fridge level, no access card used. Press the button below, or the red one on the page, and watch the right side.",
    action: {
      label: "Make her home go quiet",
      run: ({ click }) => click('[data-tour="go-quiet"]'),
      done: (alert) => alert !== null && alert !== "RESOLVED",
    },
  },
  {
    path: "/live",
    target: '[data-tour="reasons"]',
    title: "It explains itself",
    text: "Every check-in says why it was sent, comparing the last two hours with her own usual pattern. The same reasons appear on the phones.",
  },
  {
    path: "/live",
    target: ".phone-dock .pd-frame",
    title: "Madam Lee is asked first",
    text: "Her phone asks “Are you OK?”. She has 5 minutes to tap I’m OK before anyone else is told. Here, 10 seconds stands for 5 minutes. Let’s say she doesn’t answer.",
  },
  {
    path: "/live",
    target: ".phone-dock .pd-frame",
    title: "Then her son Daniel",
    text: "No reply after 5 minutes, so Daniel gets an alert with the same reasons. He can call her or mark her safe. He’s in a meeting, so nobody replies.",
    waitFor: "FAMILY_ESCALATED",
    waiting: "Waiting for the 5-minute mark…",
  },
  {
    path: "/live",
    target: '[data-tour="lee-status"]',
    title: "The guardhouse is called",
    text: "Still no reply at 10 minutes, so the status changes to Guard requested. The township guardhouse now takes over.",
    waitFor: "SECURITY_ESCALATED",
    waiting: "Waiting for the 10-minute mark…",
  },
  {
    path: "/response",
    target: '[data-tour="guard-case"]',
    title: "The guardhouse workstation",
    text: "This is what the guard on shift sees: the unit, who hasn’t replied, and what to do. No usage data, no whereabouts.",
  },
  {
    path: "/response",
    target: '[data-tour="guard-action"]',
    title: "Send a guard",
    text: "The guard assigns themselves, heads over, and records what they found. Press the button below to play it through, or press the red button on the card for each step yourself.",
    action: {
      label: "Send the guard",
      run: async ({ click, cancelled }) => {
        for (let i = 0; i < 3 && !cancelled(); i++) {
          await click('[data-tour="guard-action"]');
          await sleep(1300);
        }
      },
      done: (alert) => alert === "RESOLVED",
    },
  },
  {
    path: "/response",
    target: '[data-tour="closed-shift"]',
    title: "Every outcome is recorded",
    text: "Madam Lee was safe. The case closes for everyone, with who closed it and what they found. That’s the full loop. Now a quick look at the rest.",
  },
  {
    path: "/overview",
    target: "#explorer-title",
    title: "1 · Overview",
    text: "All 120 monitored homes in Putra Heights on a 3D map of the real township, with each home’s electricity and water pattern.",
    run: async ({ click, cancelled }) => {
      await sleep(600);
      if (!cancelled() && document.querySelector('[aria-label="Exit fullscreen map"]')) await click('[aria-label="Exit fullscreen map"]');
    },
  },
  {
    path: "/pipeline",
    target: "#main .page-heading",
    title: "4 · Monitoring",
    text: "How data flows: six simulated sources, freshness checks, validation and features, before anything reaches the model.",
  },
  {
    path: "/training",
    target: "#main .page-heading",
    title: "5 · Model training",
    text: "Models are trained and tracked in MLflow on households they’ve never seen. A new version only goes live if it measures better.",
  },
  {
    path: "/demo",
    target: "#main .page-heading",
    title: "6 · Anomaly detection",
    text: "Replay a scenario through the registered model and trace one alert back to its data, model version and notifications.",
  },
  {
    path: "/demo",
    target: '[data-tour="demo-guide"]',
    title: "That’s SimeGuardian",
    text: "Explore on your own now. You can replay this guided demo any time with the Demo guide button up here.",
  },
];

function visible(selector: string): Element | null {
  for (const element of Array.from(document.querySelectorAll(selector))) {
    const rect = element.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) return element;
  }
  return null;
}

function useTargetRect(selector: string | undefined, key: number) {
  const [rect, setRect] = useState<DOMRect | null>(null);
  useEffect(() => {
    if (!selector) return setRect(null);
    let scrolled = false;
    const tick = () => {
      const element = visible(selector);
      if (element && !scrolled) {
        element.scrollIntoView({ block: "center", behavior: "smooth" });
        scrolled = true;
      }
      setRect(element ? element.getBoundingClientRect() : null);
    };
    tick();
    const timer = setInterval(tick, 150);
    return () => clearInterval(timer);
  }, [selector, key]);
  return rect;
}

const GUIDE_LIMIT = 16; // keep the bubble inside the viewport

export function GuidedDemo() {
  const { active, reminder } = useTourState();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [index, setIndex] = useState(0);
  const [alert, setAlert] = useState<AlertState>(null);
  const [busy, setBusy] = useState(false);
  const layer = useRef<HTMLDivElement>(null);
  const step = STEPS[index];
  const last = index === STEPS.length - 1;
  const reached = !step?.waitFor || alert === step.waitFor || (step.waitFor === "FAMILY_ESCALATED" && alert === "SECURITY_ESCALATED");
  const acted = !step?.action || step.action.done(alert);
  const ready = reached && acted;
  // Each step change bumps the token; work started for an earlier step checks it and stops.
  const token = useRef(0);
  const rect = useTargetRect(active ? step?.target : reminder ? '[data-tour="demo-guide"]' : undefined, index);

  const click = useCallback(async (selector: string) => {
    const element = visible(selector) as HTMLElement | null;
    element?.click();
    await sleep(400);
  }, []);

  const perform = useCallback(async (work: (ctx: Ctx) => Promise<void>, delay = 0) => {
    const mine = ++token.current;
    const cancelled = () => token.current !== mine;
    setBusy(true);
    if (delay) await sleep(delay);
    if (!cancelled()) await work({ click, cancelled }).catch(() => {});
    if (!cancelled()) setBusy(false);
  }, [click]);

  // Enter a step: go to its page, then run its silent setup, if any.
  useEffect(() => {
    if (!active || !step) return;
    token.current++;
    setBusy(false);
    if (pathname !== step.path) navigate(step.path);
    if (step.run) void perform(step.run, 700);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, index]);

  // Follow Madam Lee's escalation; waiting steps unlock Next once it reaches their stage.
  useEffect(() => {
    if (!active) return;
    const poll = () => live<{ alertState: AlertState }>("/resident/lee").then((v) => setAlert(v.alertState)).catch(() => {});
    void poll();
    const timer = setInterval(poll, 700);
    return () => clearInterval(timer);
  }, [active]);

  // Stay above the fullscreen map dialog: re-enter the top layer whenever the page or step changes.
  useEffect(() => {
    const element = layer.current;
    if (!element) return;
    if (active || reminder) {
      if (element.matches(":popover-open")) element.hidePopover();
      element.showPopover();
    } else if (element.matches(":popover-open")) element.hidePopover();
  }, [active, reminder, index, pathname]);

  const finish = useCallback((completed: boolean) => {
    token.current++;
    setIndex(0);
    setTour({ active: false, reminder: !completed });
  }, []);
  const next = useCallback(() => (last ? finish(true) : setIndex((i) => i + 1)), [last, finish]);
  const back = useCallback(() => setIndex((i) => Math.max(0, i - 1)), []);

  useEffect(() => {
    if (!active) return;
    const onKey = (event: KeyboardEvent) => {
      // Enter is left to the focused button, so one press never advances twice.
      if (event.key === "Escape") finish(false);
      else if (event.key === "ArrowRight" && ready && !busy) next();
      else if (event.key === "ArrowLeft" && !busy) back();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, ready, busy, next, back, finish]);

  useEffect(() => {
    if (!reminder) return;
    const timer = setTimeout(() => setTour({ reminder: false }), 7000);
    return () => clearTimeout(timer);
  }, [reminder]);

  if (!active && !reminder) return <div ref={layer} popover="manual" className="tour-layer" />;

  // Place the bubble beside the target (right, else left, else below, else inside its corner) so it
  // never hides what it is talking about; the pointer sits on the target's edge facing the bubble.
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const W = 340;
  const H = 230;
  const gap = 28;
  const clampTop = (y: number) => Math.min(Math.max(y, GUIDE_LIMIT), vh - H - GUIDE_LIMIT);
  let left = (vw - W) / 2;
  let top = (vh - H) / 2;
  let point = { x: vw / 2, y: vh / 2 };
  if (rect) {
    const midY = rect.top + Math.min(rect.height / 2, 80);
    if (rect.right + gap + W <= vw - GUIDE_LIMIT) {
      left = rect.right + gap;
      top = clampTop(midY - 40);
      point = { x: rect.right - 6, y: Math.min(midY, vh - 40) };
    } else if (rect.left - gap - W >= GUIDE_LIMIT) {
      left = rect.left - gap - W;
      top = clampTop(midY - 40);
      point = { x: rect.left + 6, y: Math.min(midY, vh - 40) };
    } else if (rect.bottom + gap + H <= vh - GUIDE_LIMIT) {
      left = Math.min(Math.max(rect.left, GUIDE_LIMIT), vw - W - GUIDE_LIMIT);
      top = rect.bottom + gap;
      point = { x: Math.min(rect.left + Math.min(rect.width / 2, 120), vw - 40), y: rect.bottom - 6 };
    } else {
      left = Math.min(rect.right, vw) - W - GUIDE_LIMIT;
      top = clampTop(Math.min(rect.bottom, vh) - H - GUIDE_LIMIT);
      point = { x: left - 10, y: top + 30 };
    }
  }
  const pad = 12;

  return (
    <div ref={layer} popover="manual" className="tour-layer">
      {rect && (
        <svg className="tour-ring" key={`${index}-${reminder}`} width={vw} height={vh} aria-hidden="true">
          <rect x={rect.left - pad} y={rect.top - pad} width={rect.width + pad * 2} height={rect.height + pad * 2} rx={18} pathLength={1} />
        </svg>
      )}
      <div className="tour-pointer" style={{ transform: `translate(${point.x}px, ${point.y}px)` }} aria-hidden="true">
        <svg width="34" height="34" viewBox="0 0 34 34">
          <path d="M5 3 L29 15 L18 18 L13 30 Z" fill="#d71920" stroke="#fff" strokeWidth="2.5" strokeLinejoin="round" />
        </svg>
      </div>
      <div className="tour-bubble" role="dialog" aria-live="polite" aria-label="Guided demo" style={{ left: Math.max(GUIDE_LIMIT, left), top }}>
        {reminder ? (
          <>
            <strong>Guided demo closed</strong>
            <p>You can restart it any time with the Demo guide button up here.</p>
            <div className="tour-controls">
              <span />
              <button className="button primary" onClick={() => setTour({ reminder: false })}>Got it</button>
            </div>
          </>
        ) : (
          <>
            <div className="tour-meta">
              <span>Guided demo · {index + 1} of {STEPS.length}</span>
              <button className="tour-close" aria-label="Exit guided demo" onClick={() => finish(false)}>×</button>
            </div>
            <strong>{step.title}</strong>
            <p>{step.text}</p>
            {step.waitFor && !ready && <p className="tour-waiting"><span className="tour-spinner" aria-hidden="true" />{step.waiting}</p>}
            <div className="tour-progress" aria-hidden="true"><i style={{ width: `${((index + 1) / STEPS.length) * 100}%` }} /></div>
            <div className="tour-controls">
              <button className="button secondary" onClick={back} disabled={index === 0 || busy}>Back</button>
              {step.action && !acted ? (
                <button className="button primary" onClick={() => void perform(step.action!.run)} disabled={busy}>
                  {busy ? "Working…" : step.action.label}
                </button>
              ) : (
                <button className="button primary" onClick={next} disabled={!ready || busy}>
                  {busy ? "Working…" : last ? "Finish" : "Next"}
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export const guidedDemoOnEntry = __GUIDED_DEMO__;
