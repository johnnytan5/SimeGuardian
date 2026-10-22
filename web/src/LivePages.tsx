import { useEffect, useState, type ReactNode } from "react";
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";
import { Badge, Empty, Heading, Kpi, Panel } from "./ui";
import { live, usePoll } from "./liveApi";
import { PhoneDock, phoneShow } from "./PhoneDock";
import { useTourActive } from "./GuidedDemo";

// Live phone demo: these pages drive the Node demo engine (server/) that the
// resident and family phones talk to (proxied at /live-api). The MLflow replay pages above are a separate backend.

type AlertState = "CHECKIN_PENDING" | "FAMILY_ESCALATED" | "SECURITY_ESCALATED" | "RESOLVED";
type Guard = "NONE" | "ASSIGNED" | "ON_THE_WAY" | "ARRIVED_SAFE";
type Reason = { signal: string; label: string; detail: string; concerning: boolean; percentOfUsual: number | null };
type Household = {
  id: string;
  resident: string;
  unit: string;
  familyContact: string;
  baseline: number[];
  today: number[];
  thresholdMin: number;
  lastActivity: number;
  away: boolean;
  consented: boolean;
  alert: { state: AlertState; guard: Guard; startedSim: number; reasons: Reason[] } | null;
};
type LogEvent = { sim: number; householdId: string; type: string; actor: string; text: string };
type LiveState = { sim: number; speed: number; stepMs: number; households: Household[]; log: LogEvent[] };
type SecurityItem = { id: string; unit: string; resident: string; escalatedAt: number; guard: Guard; state: AlertState };
type Method = { episode_recall: number; alert_precision: number; f1: number; false_alerts_per_household_day: number; median_detection_delay_h: number | null };
type Run = { run_id: string; policy: { selected: string; version: string }; validation: Record<string, Method>; test: Record<string, Method & { detected: number; episodes: number }> };

const clock = (sim: number) =>
  new Intl.DateTimeFormat("en-MY", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Kuala_Lumpur" }).format(sim);
const hours = (sim: number) => {
  const [h, m] = clock(sim).split(":").map(Number);
  return h + m / 60;
};
const day = (sim: number) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuala_Lumpur" }).format(sim);
const duration = (ms: number) => {
  const minutes = Math.max(0, Math.round(ms / 60000));
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
};

const STATUS: Record<string, [string, string]> = {
  OK: ["Usual routine", "green"],
  RESOLVED: ["Resolved", "green"],
  CHECKIN_PENDING: ["Asking resident", "orange"],
  FAMILY_ESCALATED: ["Family alerted", "orange"],
  SECURITY_ESCALATED: ["Guard requested", "orange"],
  OFF: ["Not enrolled", "neutral"],
  AWAY: ["Away mode", "neutral"],
};
const status = (h: Household) =>
  STATUS[!h.consented ? "OFF" : h.away ? "AWAY" : (h.alert?.state ?? "OK")];
const NEXT: Partial<Record<AlertState, string>> = {
  CHECKIN_PENDING: "Family at +5 min",
  FAMILY_ESCALATED: "Guard at +10 min",
  SECURITY_ESCALATED: "Guard dispatched",
};

function LiveError({ error, retry }: { error: string; retry: () => void }) {
  return (
    <div role="alert" className="alert error">
      <span>{error}</span>
      <button className="text-button" onClick={retry}>Retry</button>
    </div>
  );
}

function EventLog({ events }: { events: LogEvent[] }) {
  if (events.length === 0) return <Empty title="Nothing yet" copy="Events appear here as the live demo runs." />;
  return (
    <ol className="event-timeline">
      {events.slice().reverse().map((event, i) => (
        <li key={i}>
          <span className="timeline-dot" />
          <div>
            <strong>{event.text}</strong>
            <small>{clock(event.sim)} MYT · {event.actor}</small>
          </div>
        </li>
      ))}
    </ol>
  );
}

function ActivityChart({ household, sim }: { household: Household; sim: number }) {
  const rows = household.baseline.map((usual, hour) => ({ hour: hour + 0.5, usual, today: household.today[hour] }));
  const now = hours(sim);
  const quietFrom = day(household.lastActivity) === day(sim) ? hours(household.lastActivity) : 0;
  const limit = quietFrom + household.thresholdMin / 60;
  return (
    <div className="chart" style={{ height: 240 }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={rows} margin={{ top: 12, right: 8, bottom: 0, left: -18 }}>
          <defs>
            <linearGradient id="live-usual" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#9f74e7" stopOpacity={0.35} />
              <stop offset="100%" stopColor="#9f74e7" stopOpacity={0.04} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="#eee9f6" strokeDasharray="3 5" />
          <XAxis dataKey="hour" type="number" domain={[0, 24]} ticks={[0, 6, 12, 18, 24]} tickFormatter={(h) => `${String(h % 24).padStart(2, "0")}:00`} axisLine={false} tickLine={false} tick={{ fill: "#81778f", fontSize: 10 }} />
          <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: "#81778f", fontSize: 10 }} />
          {now - quietFrom > 0.05 && <ReferenceArea x1={quietFrom} x2={now} fill="#e56d76" fillOpacity={0.12} />}
          <Area dataKey="usual" type="monotone" stroke="#9f74e7" strokeWidth={1.6} fill="url(#live-usual)" isAnimationActive={false} />
          <Bar dataKey="today" fill="#493660" barSize={10} radius={[3, 3, 0, 0]} isAnimationActive={false} />
          {limit <= 24 && <ReferenceLine x={limit} stroke="#d8626e" strokeDasharray="5 4" label={{ value: "threshold", position: "insideTopRight", fill: "#c9232a", fontSize: 11 }} />}
          <ReferenceLine x={now} stroke="#d71920" strokeWidth={2} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

function ReasonTable({ reasons }: { reasons: Reason[] }) {
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr><th>Signal</th><th>Finding</th><th>Compared with her usual pattern</th><th>Concern</th></tr>
        </thead>
        <tbody>
          {reasons.map((reason) => (
            <tr key={reason.signal}>
              <td style={{ textTransform: "capitalize" }}>{reason.signal}</td>
              <td><strong>{reason.label}</strong></td>
              <td>{reason.detail}</td>
              <td><Badge tone={reason.concerning ? "orange" : "green"}>{reason.concerning ? "Concerning" : "Normal"}</Badge></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ModelEvidence() {
  const [run, setRun] = useState<Run | null>(null);
  useEffect(() => {
    live<Run>("/model").then(setRun).catch(() => setRun(null));
  }, []);
  if (!run) return <Empty title="No training run found" copy="Run ml/.venv/bin/python ml/train.py to record one." />;
  const rows = Object.entries(run.test);
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr><th>Method</th><th>Validation F1</th><th>Test episodes found</th><th>Test precision</th><th>False alerts / household-day</th><th>Median delay</th></tr>
        </thead>
        <tbody>
          {rows.map(([name, test]) => (
            <tr key={name}>
              <td>
                {name.replace("+", " + ")}{" "}
                {name === run.policy.selected && <Badge tone="green">live policy</Badge>}
              </td>
              <td>{run.validation[name].f1.toFixed(2)}</td>
              <td>{test.detected}/{test.episodes}</td>
              <td>{test.alert_precision.toFixed(2)}</td>
              <td>{test.false_alerts_per_household_day.toFixed(3)}</td>
              <td>{test.median_detection_delay_h ?? "—"} h</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Controls({ state, reload, children }: { state: LiveState | null; reload: () => void; children?: ReactNode }) {
  const act = (path: string, body?: unknown) => live(path, body ?? {}).then(reload).catch(reload);
  return (
    <div className="live-controls">
      {children}
      <button className="button secondary" onClick={() => void act("/reset")}>Reset demo</button>
      {state && (
        <>
          <label className="live-field">
            Speed
            <select value={state.speed} onChange={(event) => void act("/settings", { speed: Number(event.target.value) })}>
              <option value={60}>1 min/s</option>
              <option value={120}>2 min/s</option>
              <option value={300}>5 min/s</option>
            </select>
          </label>
          <label className="live-field">
            Each escalation step
            <select value={state.stepMs} onChange={(event) => void act("/settings", { stepMs: Number(event.target.value) })}>
              <option value={10000}>10 s</option>
              <option value={30000}>30 s</option>
              <option value={60000}>60 s</option>
              <option value={300000}>5 min (real time)</option>
            </select>
          </label>
        </>
      )}
    </div>
  );
}

export function LiveCheckIn() {
  const { data, error, load } = usePoll<LiveState>("/state");
  const [selected, setSelected] = useState("lee");
  const household = data?.households.find((item) => item.id === selected);
  const lee = data?.households.find((item) => item.id === "lee");
  const quiet = (id: string) => live(`/households/${id}/quiet`, {}).then(load).catch(load);
  const touring = useTourActive();
  const preview = phoneShow || touring;
  return (
    <>
      {preview && <PhoneDock />}
      <Heading
        eyebrow="LIVE PHONE DEMO"
        title="Live check-in"
        copy="Runs the resident → family → guard escalation on the phones in real time. Each escalation step stands for 5 minutes."
      >
        <Controls state={data} reload={() => void load()}>
          <button data-tour="go-quiet" className="button primary" disabled={!!lee?.alert && lee.alert.state !== "RESOLVED"} onClick={() => void quiet("lee")}>
            {lee?.alert && lee.alert.state !== "RESOLVED" ? "Check-in in progress" : "Madam Lee goes quiet"}
          </button>
        </Controls>
      </Heading>
      {error && <LiveError error={error} retry={() => void load()} />}
      {data && household && (
        <>
          <div className="scope-bar">
            <span><strong>Simulated time {clock(data.sim)} MYT</strong> · shared with both phones</span>
            <Badge tone="green">Madam Lee opted in</Badge>
          </div>
          <div className="kpi-grid">
            <div data-tour="lee-status"><Kpi title="Madam Lee" value={lee ? status(lee)[0] : "—"} copy={lee?.unit ?? ""} /></div>
            <Kpi title="Quiet for" value={lee ? duration(data.sim - lee.lastActivity) : "—"} copy={`Her threshold is ${lee ? lee.thresholdMin / 60 : "—"} h`} />
            <Kpi title="Next step" value={(lee?.alert && NEXT[lee.alert.state]) ?? "—"} copy="Resident first, then family, then guard" />
            <Kpi title="Detection policy" value="Rule" copy="Chosen on validation; beats the model on test" />
          </div>
          <div className="two-column">
            <Panel title="Enrolled households" copy="Five named demo homes share one simulated clock.">
              <div className="live-households">
                {data.households.map((item) => {
                  const [label, tone] = status(item);
                  return (
                    <button key={item.id} data-tour={item.id === "lee" ? "lee-row" : undefined} className="live-household" aria-pressed={item.id === selected} onClick={() => setSelected(item.id)}>
                      <span>
                        <strong>{item.resident}</strong>
                        <small>{item.unit} · contact {item.familyContact}</small>
                      </span>
                      <Badge tone={tone}>{label}</Badge>
                    </button>
                  );
                })}
              </div>
            </Panel>
            <Panel
              title={`Activity vs usual pattern · ${household.resident}`}
              copy={`Quiet for ${duration(data.sim - household.lastActivity)} · alert threshold ${household.thresholdMin / 60} h. Bars are today, the shaded curve is her usual day, the red band is the quiet gap.`}
            >
              <div data-tour="activity-chart"><ActivityChart household={household} sim={data.sim} /></div>
            </Panel>
          </div>
          <Panel
            title="Why the check-in was sent"
            copy="The same explanation the resident and family see on their phones, computed from the last quiet window against this home's own baseline."
          >
            {household.alert?.reasons.length ? (
              <div data-tour="reasons"><ReasonTable reasons={household.alert.reasons} /></div>
            ) : (
              <Empty title="No check-in for this home" copy="When a home stays quiet past its threshold, the reasons appear here." />
            )}
          </Panel>
          <div className="two-column">
            <Panel title="Event log" copy="Every step, as the phones and guard see it.">
              <EventLog events={data.log} />
            </Panel>
            <Panel title="Detection evidence" copy="Prior training run on 120 synthetic households; the untouched test set was scored once.">
              <ModelEvidence />
            </Panel>
          </div>
        </>
      )}
    </>
  );
}

const GUARD_ACTION: Partial<Record<Guard, string>> = {
  NONE: "Assign a guard",
  ASSIGNED: "Guard is on the way",
  ON_THE_WAY: "Arrived: resident is safe",
};
const GUARD_LABEL: Record<Guard, string> = {
  NONE: "Needs a guard",
  ASSIGNED: "Guard assigned",
  ON_THE_WAY: "Guard on the way",
  ARRIVED_SAFE: "Resident safe",
};
const CLOSED_BY: Record<string, string> = { security: "Guard", family: "Family", resident: "Resident", system: "System" };
const URGENCY: Record<Guard, number> = { NONE: 0, ASSIGNED: 1, ON_THE_WAY: 2, ARRIVED_SAFE: 3 };

// Guardhouse workstation for the Rescue tab: welfare checks from the live phone demo, raised once
// the resident and their family have not replied for 10 minutes. Shown above the MLflow replay's
// responder tasks. Wording is written for a guard on shift, not an operator.
export function LiveWelfareChecks() {
  const { data, error, load } = usePoll<SecurityItem[]>("/security");
  const log = usePoll<LiveState>("/state");
  const advance = (id: string) => live(`/households/${id}/guard`, {}).then(load).catch(load);
  const events = log.data?.log.filter((event) => ["security", "guard", "resolved"].includes(event.type)) ?? [];
  const closed = log.data?.log.filter((event) => event.type === "resolved") ?? [];
  const homes = Object.fromEntries((log.data?.households ?? []).map((h) => [h.id, h]));
  const now = log.data?.sim ?? 0;
  const seed = () => live("/seed-rescue", {}).then(load).then(log.load).catch(load);
  // Most urgent first: nobody assigned yet, then the longest wait.
  const queue = (data ?? []).slice().sort((a, b) => URGENCY[a.guard] - URGENCY[b.guard] || a.escalatedAt - b.escalatedAt);
  const touring = useTourActive();
  return (
    <>
      {(phoneShow || touring) && <PhoneDock />}
      <div className="scope-bar">
        <span><strong>Guardhouse workstation</strong> · Putra Heights · you see the unit and what to do; residents’ usage and whereabouts stay private</span>
        <button className="button secondary" onClick={() => void seed()}>Load a sample shift</button>
      </div>
      {data && (
        <div className="kpi-grid">
          <Kpi title="Needs a guard now" value={data.filter((item) => item.guard === "NONE").length} copy="Assign someone from the queue below" />
          <Kpi title="Guard on the way" value={data.filter((item) => item.guard === "ASSIGNED" || item.guard === "ON_THE_WAY").length} copy="Waiting for their report from the unit" />
          <Kpi title="Open checks" value={data.filter((item) => item.guard !== "ARRIVED_SAFE").length} copy="Resident and family haven’t replied" />
          <Kpi title="Closed this shift" value={closed.length} copy="By the resident, family or a guard" />
        </div>
      )}
      {error && <LiveError error={error} retry={() => void load()} />}
      {data && (queue.length ? queue.map((item) => (
        <div key={item.id} data-tour={item.id === "lee" ? "guard-case" : undefined}>
          <Panel
            title={item.unit}
            copy={`${item.resident} · no reply since ${clock(item.escalatedAt)} · waiting ${Math.max(0, Math.round((now - item.escalatedAt) / 60000))} min`}
            action={<Badge tone={item.guard === "ARRIVED_SAFE" ? "green" : "orange"}>{GUARD_LABEL[item.guard]}</Badge>}
          >
            <div className="responder-copy">
              <p>
                {item.resident} hasn’t answered the check-in on their phone, and {homes[item.id]?.familyContact ?? "their family contact"} hasn’t replied either.
              </p>
              <ol className="guard-steps">
                <li>Go to the unit and knock. Call out the resident’s name.</li>
                <li>If they answer and are fine, record that they are safe.</li>
                <li>No answer and signs of trouble? Call 999. Don’t force entry or move anyone who has fallen.</li>
              </ol>
              {GUARD_ACTION[item.guard] && (
                <button data-tour={item.id === "lee" ? "guard-action" : undefined} className="button primary" onClick={() => void advance(item.id)}>{GUARD_ACTION[item.guard]}</button>
              )}
            </div>
          </Panel>
        </div>
      )) : (
        <Panel title="Welfare-check queue">
          <Empty title="All clear, nobody is waiting" copy="A unit appears here when the resident and their family haven’t replied to a check-in for 10 minutes." />
        </Panel>
      ))}
      <div className="two-column">
        <div data-tour="closed-shift">
          <Panel title="Closed this shift" copy="Every closed check-in, who closed it and what they found.">
            {closed.length ? (
              <div className="table-scroll">
                <table>
                  <thead><tr><th>Time</th><th>Unit</th><th>Closed by</th><th>What happened</th></tr></thead>
                  <tbody>
                    {closed.slice().reverse().map((event, i) => (
                      <tr key={i}>
                        <td>{clock(event.sim)}</td>
                        <td>{homes[event.householdId] ? `${homes[event.householdId].unit} (${homes[event.householdId].resident})` : event.householdId}</td>
                        <td>{CLOSED_BY[event.actor] ?? event.actor}</td>
                        <td>{event.text}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <Empty title="Nothing closed yet" copy="Closed check-ins and what was found appear here." />
            )}
          </Panel>
        </div>
        <Panel title="Shift log" copy="Requests, assignments and outcomes, newest first.">
          <EventLog events={events} />
        </Panel>
      </div>
    </>
  );
}
