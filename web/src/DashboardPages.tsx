import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { api, type Role, type Snapshot } from "./api";
import { Badge, Icon, Modal, when } from "./ui";
import {
  formatSignal,
  signalParameters,
  SIGNAL_INTERVAL,
  simulateSignals,
  householdProfile,
  townshipWindow,
  type TownshipRange,
  applyDemoAnomaly,
  demoAnomalyEvidence,
  type AnomalyDemoState,
} from "./signalSimulation";
import { TownshipUsage } from "./TownshipUsage";
import { TownshipExplorer } from "./TownshipExplorer";
import { AnomalyDemo } from "./AnomalyDemo";

export const pages = [
  { name: "Overview", path: "/overview" },
  { name: "Monitoring", path: "/pipeline" },
  { name: "Inference & incidents", path: "/inference" },
  { name: "Datasets", path: "/datasets" },
  { name: "Model training", path: "/training" },
  { name: "Evaluation", path: "/evaluation" },
  { name: "Model registry", path: "/models" },
  { name: "Operations", path: "/operations" },
  { name: "Anomaly detection", path: "/demo" },
  { name: "Rescue", path: "/response" },
];
type Event = { at: number; name: string; actor: string };
type Incident = {
  id: string;
  household: string;
  status: string;
  owner: string | null;
  created_at: number;
  accepted: boolean;
  assigned_to: string | null;
  outcome: string | null;
  inference?: Inference;
  events: Event[];
  notifications: { stage: string; created_at: number; delivery: string }[];
};
type Inference = {
  at: number;
  features: Record<string, number | null>;
  score: number | null;
  version: string | null;
  run_id: string | null;
  anomaly: boolean | null;
  coverage: string;
  policy_decision: string;
  policy_version: string;
};
type Replay = {
  id: string;
  revision: number;
  scenario: string;
  minutes: number;
  inference: Inference | null;
  inferences?: Inference[];
  incident: Incident | null;
  audit: Event[];
};
type Source = {
  id: string;
  name: string;
  unit: string;
  count: number;
  last_event: number;
  feed_checked_at: number;
  status: string;
  rejected: number;
};
type Dataset = {
  id: string;
  name: string;
  seed: number;
  checksum: string;
  validation_checksum?: string;
  scope: string;
  households: string[];
  count: number;
  features: string[];
  splits: { name: string; households: number; windows: number }[];
  test_status: string;
  labels: string;
};
type RecordRow = {
  household: string;
  source?: string;
  at?: number;
  value?: number;
  unit?: string;
  attribution?: string;
  group?: string;
  day?: number;
  split?: string;
  values?: Record<string, number>;
  label?: number;
};
type DatasetDetail = Dataset & { records: RecordRow[] };
type Workspace = {
  state: Replay;
  clock: number;
  sources: Source[];
  datasets: Dataset[];
  scenarios: { id: string; name: string }[];
  features: Record<string, number | null>;
  coverage: string;
  households: number;
  scope: string;
  transport: string;
};
type Act = (action: string, extra?: Record<string, unknown>) => Promise<void>;

function Heading({
  eyebrow = "TOWNSHIP WELLBEING",
  title,
  copy,
  children,
}: {
  eyebrow?: string;
  title: string;
  copy: string;
  children?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        <p>{copy}</p>
      </div>
      {children}
    </div>
  );
}
function Panel({
  title,
  copy,
  children,
  action,
  className = "",
}: {
  title: string;
  copy?: string;
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <section className={`panel ${className}`}>
      <div className="panel-heading">
        <div>
          <h2>{title}</h2>
          {copy && <p>{copy}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
function Empty({
  title,
  copy,
  children,
}: {
  title: string;
  copy: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty">
      <Icon name="shield" size={28} />
      <h3>{title}</h3>
      <p>{copy}</p>
      {children}
    </div>
  );
}
function Kpi({
  title,
  value,
  copy,
  tone = "",
}: {
  title: string;
  value: ReactNode;
  copy: string;
  tone?: string;
}) {
  return (
    <article className={`kpi ${tone}`}>
      <div className="kpi-label">
        {title}
        <Icon name="grid" size={16} />
      </div>
      <div className="kpi-value">{value}</div>
      <p>{copy}</p>
    </article>
  );
}
const label = (value: string) =>
  value.replaceAll("_", " ").replaceAll("-", " ");
const time = (value: number) =>
  new Intl.DateTimeFormat("en-MY", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Kuala_Lumpur",
  }).format(value);
function Timeline({ events }: { events: Event[] }) {
  return (
    <ol className="event-timeline">
      {events.map((event, i) => (
        <li key={i}>
          <span className="timeline-dot" />
          <div>
            <strong>{event.name}</strong>
            <small>
              {when(event.at)} MYT · {event.actor}
            </small>
          </div>
        </li>
      ))}
    </ol>
  );
}

export function DashboardPages({
  role,
  models,
  refreshModels,
}: {
  role: Role;
  models: Snapshot | null;
  refreshModels: () => Promise<void>;
}) {
  return role === "responder" ? (
    <ResponsePage />
  ) : (
    <OperatorPages models={models} refreshModels={refreshModels} />
  );
}

function OperatorPages({
  models,
  refreshModels,
}: {
  models: Snapshot | null;
  refreshModels: () => Promise<void>;
}) {
  const { pathname } = useLocation();
  const [data, setData] = useState<Workspace | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const load = useCallback(async () => {
    try {
      setData(await api<Workspace>("/api/workspace"));
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 5000);
    const refresh = () => void load();
    window.addEventListener("workspace-refresh", refresh);
    return () => {
      clearInterval(timer);
      window.removeEventListener("workspace-refresh", refresh);
    };
  }, [load]);
  const act: Act = async (action, extra = {}) => {
    if (!data || busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      setData(
        await api<Workspace>("/api/demo", {
          method: "POST",
          body: JSON.stringify({
            action,
            revision: data.state.revision,
            ...extra,
          }),
        }),
      );
      setNotice(
        action === "score"
          ? "Inference recorded from the current replay window."
          : action === "advance"
            ? "Shared simulation clock advanced."
            : action === "family_ack"
              ? "Family owns follow-up. The incident remains open."
              : "Replay updated. Model and dataset evidence is preserved.",
      );
      void refreshModels();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  if (!data)
    return (
      <>
        <Heading
          title="Your wellbeing workspace"
          copy="Connecting to the local development workspace…"
        />
        {error ? (
          <div role="alert" className="alert error">
            {error}
            <button className="text-button" onClick={() => void load()}>
              Retry
            </button>
          </div>
        ) : (
          <div className="empty" role="status">
            <span className="spinner" /> Loading workspace…
          </div>
        )}
      </>
    );
  const props = { data, models, act, busy };
  return (
    <>
      {error && (
        <div role="alert" className="alert error">
          <span>{error} Loaded replay data may be stale.</span>
          <button className="text-button" onClick={() => void load()}>
            Refresh
          </button>
        </div>
      )}
      {notice && (
        <div role="status" className="alert success">
          <span>{notice}</span>
          <button
            className="icon-button"
            aria-label="Dismiss message"
            onClick={() => setNotice("")}
          >
            <Icon name="close" />
          </button>
        </div>
      )}
      {pathname === "/overview" || pathname === "/pipeline" ? (
        <Pipeline {...props} overview={pathname === "/overview"} />
      ) : pathname === "/datasets" ? (
        <Datasets data={data} />
      ) : pathname.startsWith("/datasets/") ? (
        <DatasetExplorer id={pathname.slice(10)} />
      ) : pathname === "/inference" ? (
        <InferencePage {...props} />
      ) : pathname.startsWith("/incidents/") ? (
        <IncidentPage {...props} id={pathname.slice(11)} />
      ) : pathname === "/operations" ? (
        <Operations {...props} />
      ) : pathname === "/demo" ? (
        <Demo {...props} />
      ) : pathname === "/response" ? (
        <>
          <Heading
            title="Rescue"
            copy="A separate, restricted view for assigned check-ins."
          />
          <Panel title="Open the responder workspace">
            <Empty
              title="Switch to the seeded responder identity"
              copy="Use “Switch to responder” above. The backend issues a different session and restricts access to assigned tasks."
            />
          </Panel>
        </>
      ) : (
        <>
          <Heading
            title="Page not found"
            copy="This address is not part of the dashboard."
          />
          <Link className="button secondary" to="/pipeline">
            Return to monitoring
          </Link>
        </>
      )}
    </>
  );
}
type PageProps = {
  data: Workspace;
  models: Snapshot | null;
  act: Act;
  busy: boolean;
};

function ReplayBar({ data }: { data: Workspace }) {
  return (
    <div className="scope-bar">
      <div>
        <span className="scope-dot" />
        <strong>Synthetic replay</strong>
        <span className="scope-separator">/</span>
        <span>
          {data.scenarios.find((s) => s.id === data.state.scenario)?.name}
        </span>
      </div>
      <span className="scope-right">
        <Icon name="clock" size={15} />
        {when(data.clock)} MYT
      </span>
    </div>
  );
}

function Pipeline({ data, overview }: PageProps & { overview: boolean }) {
  const { hash } = useLocation();
  const [selected, setSelected] = useState("electricity");
  const [household, setHousehold] = useState("SG-001");
  const [range, setRange] = useState<TownshipRange>("week");
  const [demo, setDemo] = useState<AnomalyDemoState | null>(null);
  const [reducedMotion, setReducedMotion] = useState(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const [paused, setPaused] = useState(reducedMotion);
  const [start] = useState(data.clock);
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    if (!overview && hash === "#household-signals") {
      document.getElementById("household-signals")?.scrollIntoView({ block: "start" });
    }
  }, [overview, hash]);
  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const change = () => {
      setReducedMotion(preference.matches);
      if (preference.matches) setPaused(true);
    };
    preference.addEventListener("change", change);
    return () => preference.removeEventListener("change", change);
  }, []);
  useEffect(() => {
    if (paused) return;
    const timer = window.setInterval(() => {
      if (!document.hidden) {
        setFrame((current) => current + 1);
        setDemo((current) => current && current.step < 9 ? { ...current, step: current.step + 1 } : current);
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [paused]);
  const normalSignals = useMemo(
    () => Array.from({ length: 97 }, (_, index) =>
      simulateSignals(start + (frame + index - 96) * SIGNAL_INTERVAL, household),
    ),
    [start, frame, household],
  );
  const signals = useMemo(
    () => normalSignals.map((point) => applyDemoAnomaly(point, household, demo)),
    [normalSignals, household, demo],
  );
  const households = data.datasets.find((dataset) => dataset.id === "township-ui-v1")?.households ?? [];
  const township = useMemo(
    () => townshipWindow(start + frame * SIGNAL_INTERVAL, range, households, demo),
    [start, frame, range, households, demo],
  );
  const peaks = Object.fromEntries(data.sources.map((item) => [
    item.id, Math.max(...normalSignals.map((point) => point[item.id]), 1),
  ]));
  const detected = !!demo && demo.step === 9 && demoAnomalyEvidence(normalSignals, signals, demo.from).detected;
  const chooseHousehold = (id: string) => {
    if (id !== household) setDemo(null);
    setHousehold(id);
  };
  const startDemo = () => {
    setRange("day");
    setSelected("electricity");
    setDemo({ household, from: start + frame * SIGNAL_INTERVAL - 6 * 3_600_000, step: 0 });
    setPaused(false);
  };
  const latest = signals[signals.length - 1];
  const source = data.sources.find((item) => item.id === selected)!;
  const count = data.sources.reduce((total, item) => total + item.count, 0);
  if (overview) return (
    <>
      <Heading
        title="Overview"
        copy="Township usage, household locations and detected demo concerns in one view."
      >
        <Link className="button secondary" to="/pipeline">View monitoring <Icon name="arrow" size={16} /></Link>
      </Heading>
      <TownshipExplorer
        window={township} range={range} onRange={setRange} signal={selected}
        onSignal={setSelected} household={household} onHousehold={chooseHousehold}
        paused={paused} onPause={() => setPaused((current) => !current)}
        anomaly={detected ? demo : null} demo={demo}
        onStartDemo={startDemo} onClearDemo={() => setDemo(null)}
      />
    </>
  );
  return (
    <>
      <Heading
        title="Monitoring"
        copy="Compare household routines and inspect the six signals behind each home."
      >
        <Link className="button secondary" to="/overview">Township overview <Icon name="arrow" size={16} /></Link>
      </Heading>
      <ReplayBar data={data} />
      <AnomalyDemo
        demo={demo}
        household={household}
        expected={normalSignals}
        observed={signals}
        paused={paused}
        reducedMotion={reducedMotion}
        onStart={startDemo}
        onClear={() => setDemo(null)}
        onPause={() => setPaused((current) => !current)}
      />
      <TownshipUsage
        window={township}
        range={range}
        onRange={setRange}
        sources={data.sources}
        signal={selected}
        onSignal={setSelected}
        household={household}
        onHousehold={chooseHousehold}
        paused={paused}
        onPause={() => setPaused((current) => !current)}
        reducedMotion={reducedMotion}
        anomaly={detected ? demo : null}
      />
      <div id="household-signals" className="household-anchor">
      <Panel
        title="Daily signal flow"
        copy={`${household} · ${householdProfile(household).name} · ${demo ? "Anomaly demonstration across all six signals." : "A closer look at the last 24 hours across all six signals."}`}
        className={`signal-panel ${detected ? "signal-anomaly" : ""}`}
        action={
          <label className="household-picker">Household
            <select aria-label="Household" value={household} onChange={(event) => chooseHousehold(event.target.value)}>
              {households.map((id) => <option key={id}>{id}</option>)}
            </select>
          </label>
        }
      >
        <div className="signal-window">
          <div>
            <span className="eyebrow">ROLLING 24 HOURS</span>
            <strong>
              {time(signals[0].at)} —{" "}
              <time
                dateTime={new Date(latest.at).toISOString()}
                aria-label="Simulation time"
              >
                {time(latest.at)}
              </time>{" "}
              MYT
            </strong>
          </div>
          <span>15 simulated minutes / second · hourly usage</span>
        </div>
        <div
          className="signal-chart"
          role="img"
          aria-label={`${household}: simulated daily activity for electricity, water, parking, mall, gate and resident app. Curves show relative activity; hourly values appear in the signal cards below.`}
        >
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={signals}
              margin={{ top: 18, right: 18, left: -15, bottom: 4 }}
            >
              <defs>
                {data.sources.map((item) => (
                  <linearGradient
                    key={item.id}
                    id={`signal-${item.id}`}
                    x1="0" y1="0" x2="0" y2="1"
                  >
                    <stop offset="0%" stopColor={signalParameters[item.id].color} stopOpacity={0.45} />
                    <stop offset="100%" stopColor={signalParameters[item.id].color} stopOpacity={0.03} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid vertical={false} stroke="#eee9f6" strokeDasharray="3 5" />
              <XAxis
                dataKey="at"
                type="number"
                domain={[signals[0].at, latest.at]}
                ticks={[0, 24, 48, 72, 96].map((index) => signals[index].at)}
                tickFormatter={time}
                axisLine={false}
                tickLine={false}
                tick={{ fill: "#81778f", fontSize: 10 }}
                minTickGap={20}
              />
              <YAxis
                domain={[0, 100]}
                ticks={[0, 25, 50, 75, 100]}
                tickFormatter={(value) => `${value}%`}
                axisLine={false}
                tickLine={false}
                tick={{ fill: "#81778f", fontSize: 10 }}
                width={55}
              />
              {demo && demo.step >= 3 && <ReferenceArea x1={Math.max(demo.from, signals[0].at)} x2={latest.at} fill="#e56d76" fillOpacity={0.1} />}
              <Tooltip
                content={({ active, payload, label }) => active && payload?.length ? (
                  <div className="signal-tooltip">
                    <strong>{time(Number(label))} MYT · simulated hour</strong>
                    {data.sources.map((item) => (
                      <div key={item.id}>
                        <span style={{ color: signalParameters[item.id].color }}>{item.name}</span>
                        <b>{formatSignal(item.id, payload[0].payload[item.id])} {item.unit === "event" ? "events" : item.unit}</b>
                      </div>
                    ))}
                  </div>
                ) : null}
              />
              {[...data.sources.filter((item) => item.id !== selected), source].map((item) => (
                <Area
                  key={item.id}
                  name={item.name}
                  dataKey={(point) => point[item.id] / peaks[item.id] * 100}
                  type="monotone"
                  stroke={detected && ["electricity", "water"].includes(item.id) ? "#d8626e" : signalParameters[item.id].color}
                  strokeWidth={item.id === selected ? 2.8 : 1.4}
                  strokeOpacity={item.id === selected ? 1 : 0.65}
                  fill={`url(#signal-${item.id})`}
                  fillOpacity={item.id === selected ? 1 : 0.6}
                  activeDot={{ r: 4, stroke: "#fff", strokeWidth: 2 }}
                  isAnimationActive={!paused && !reducedMotion}
                  animationDuration={850}
                  animationEasing="linear"
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <p className="signal-scale">
          Relative to each signal’s usual peak in this home’s 24-hour window. Native
          hourly values below; signals are not added together.
        </p>
        <div className="source-grid signal-readings" aria-label="Simulated hourly signal values">
          {data.sources.map((item) => (
            <button
              key={item.id}
              className={`source-card ${selected === item.id ? "selected" : ""} ${demo && demo.step >= 3 && ["electricity", "water"].includes(item.id) ? "anomaly-reading" : ""}`}
              style={{ "--signal-color": signalParameters[item.id].color } as CSSProperties}
              onClick={() => setSelected(item.id)}
              aria-pressed={selected === item.id}
            >
              <strong><span className="signal-dot" />{item.name}</strong>
              <span className="source-count">
                <span className="signal-value">{formatSignal(item.id, latest[item.id])}</span>
                <small>{item.unit === "event" ? "events" : item.unit} / hour</small>
              </span>
              <span className="signal-card-note">{demo && demo.step >= 3 ? "Demo · reduced activity" : "Simulated activity"}</span>
            </button>
          ))}
        </div>
        <div className="panel-footer">
          {demo ? "Anomaly" : "Normal-day"} illustration · independent of the replay scenario, source fixture and model inputs.
        </div>
      </Panel>
      </div>
      <Panel
        title="Replay stages"
        copy="Counts are scoped to their dataset. The source preview is separate from the four-feature model fixture."
      >
        <div className={`pipeline-stages ${paused || reducedMotion ? "" : "flowing"}`}>
          {[
            ["Source fixture", count.toLocaleString(), "Generated records"],
            [
              "Schema checks",
              count.toLocaleString(),
              "Finite values and declared units",
            ],
            ["Model features", "4", "Explicit scenario inputs"],
            [
              "Inference",
              String(
                data.state.inferences?.length ?? (data.state.inference ? 1 : 0),
              ),
              "Recorded in current replay",
            ],
            [
              "Notifications",
              String(data.state.incident?.notifications.length ?? 0),
              "Simulated creation records",
            ],
          ].map(([name, value, copy], i) => (
            <div className="pipeline-stage" key={name}>
              <span className="stage-number">0{i + 1}</span>
              <strong>{value}</strong>
              <h3>{name}</h3>
              <p>{copy}</p>
              {i < 4 && (
                <span className={`stage-flow ${i === 1 ? "preview-gap" : ""}`} aria-hidden="true">
                  <Icon name="arrow" size={14} />
                </span>
              )}
            </div>
          ))}
        </div>
        <p className="panel-copy">
          The causal six-source feature pipeline is pending. Source preview
          records are not silently passed to the trained model. Missing or stale
          utilities block incident creation.
        </p>
      </Panel>
      <Panel
        title="Model input parameters"
        copy="SG-001 replay window · these four inputs are separate from the animated household illustrations."
      >
        <dl className="signal-features">
          {Object.entries(data.features).map(([name, value]) => (
            <div key={name}>
              <dt>{label(name)}</dt>
              <dd>
                {value === null ? "Missing" : value.toLocaleString("en-MY", { maximumFractionDigits: 3 })}
                <small>{name.endsWith("_ratio") ? "× baseline" : "interactions"}</small>
              </dd>
            </div>
          ))}
        </dl>
      </Panel>
      <div className="two-column">
        <Panel
          title={`${source.name} details`}
          copy="Feed checks and resident activity are different timestamps."
        >
          <dl className="model-facts padded">
            <div>
              <dt>Source fixture records</dt>
              <dd>{source.count.toLocaleString()}</dd>
            </div>
            <div>
              <dt>Record unit</dt>
              <dd>{source.unit}</dd>
            </div>
            <div>
              <dt>Last fixture activity</dt>
              <dd>{when(source.last_event)} MYT</dd>
            </div>
            <div>
              <dt>Simulated feed check</dt>
              <dd>{when(source.feed_checked_at)} MYT</dd>
            </div>
            <div>
              <dt>Declared schema violations</dt>
              <dd>{source.rejected}</dd>
            </div>
            <div>
              <dt>Scenario status</dt>
              <dd>
                <Badge
                  tone={source.status === "available" ? "green" : "orange"}
                >
                  {source.status}
                </Badge>
              </dd>
            </div>
          </dl>
          <div className="panel-copy">
            <Link to="/datasets/township-ui-v1" className="text-button">
              Inspect source records →
            </Link>
          </div>
        </Panel>
        <Panel
          title="Coverage rules"
          copy="Sparse activity is not a missing feed."
        >
          <ul className="principles">
            <li>
              Electricity and water must both be fresh and corroborate low
              activity.
            </li>
            <li>
              Parking and gate events from the same trip share one evidence
              group.
            </li>
            <li>
              Shared cards and family activity do not prove resident activity.
            </li>
            <li>
              Resident-linked activity blocks a conflicting inactivity concern.
            </li>
            <li>Away status pauses new inactivity incidents.</li>
          </ul>
        </Panel>
      </div>
    </>
  );
}

function Datasets({ data }: { data: Workspace }) {
  return (
    <>
      <Heading
        title="Datasets & lineage"
        copy="Know exactly which records trained the model and which records power the UI."
      />
      <div className="dataset-grid">
        {data.datasets.map((dataset) => (
          <Panel
            key={dataset.id}
            title={dataset.name}
            copy={dataset.id}
            action={<Badge tone="neutral">Seed {dataset.seed}</Badge>}
          >
            <div className="dataset-stat">
              <strong>{dataset.count.toLocaleString()}</strong>
              <span>
                {dataset.features.length ? "feature windows" : "source records"}{" "}
                · {dataset.households.length} households
              </span>
            </div>
            <p className="panel-copy">{dataset.scope}</p>
            <dl className="model-facts padded">
              <div>
                <dt>Test partition</dt>
                <dd>{dataset.test_status}</dd>
              </div>
              <div>
                <dt>Version</dt>
                <dd>{dataset.id}</dd>
              </div>
            </dl>
            <div className="checksum">
              <small>
                SHA-256{" "}
                {dataset.features.length
                  ? "· updated training"
                  : "· source records"}
              </small>
              <code>{dataset.checksum}</code>
            </div>
            <div className="panel-copy">
              <Link
                to={`/datasets/${dataset.id}`}
                className="button secondary full"
              >
                Explore dataset <Icon name="arrow" size={16} />
              </Link>
            </div>
          </Panel>
        ))}
      </div>
      <Panel title="Keep evaluation independent">
        <ul className="principles">
          <li>
            Training uses 16 households. Validation uses 8 different households
            and later days.
          </li>
          <li>
            The initial training partition is included in the updated training
            partition.
          </li>
          <li>
            Concern labels are evaluation annotations. They are excluded from
            model features.
          </li>
          <li>
            The final test partition is not generated or exposed to tuning.
          </li>
        </ul>
      </Panel>
    </>
  );
}

function DatasetExplorer({ id }: { id: string }) {
  const [query, setQuery] = useSearchParams();
  const [data, setData] = useState<DatasetDetail | null>(null);
  const [error, setError] = useState("");
  const household = query.get("household") ?? "all";
  const source = query.get("source") ?? "all";
  const pageValue = Number(query.get("page") ?? 0);
  const requestedPage =
    Number.isSafeInteger(pageValue) && pageValue >= 0 ? pageValue : 0;
  function filter(key: string, value: string) {
    const next = new URLSearchParams(query);
    next.set(key, value);
    if (key !== "page") next.delete("page");
    setQuery(next);
  }
  useEffect(() => {
    let cancelled = false;
    setData(null);
    setError("");
    api<DatasetDetail>(`/api/datasets/${encodeURIComponent(id)}`)
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);
  const rows =
    data?.records.filter(
      (row) =>
        (household === "all" || row.household === household) &&
        (source === "all" || row.source === source || row.split === source),
    ) ?? [];
  const page = Math.min(
    requestedPage,
    Math.max(0, Math.ceil(rows.length / 20) - 1),
  );
  const visible = rows.slice(page * 20, (page + 1) * 20);
  const feature = data?.features.length;
  return (
    <>
      <Heading
        eyebrow="DATASET EXPLORER"
        title={data?.name ?? "Dataset explorer"}
        copy={data?.scope ?? "Loading the recorded fixture…"}
      >
        <Link to="/datasets" className="button secondary">
          All datasets
        </Link>
      </Heading>
      {error && (
        <div role="alert" className="alert error">
          {error}
        </div>
      )}
      {!data && !error && (
        <p role="status" className="empty">
          Loading dataset…
        </p>
      )}
      {data && (
        <>
          <div className="scope-bar">
            <span>
              <strong>{data.id}</strong> · seed {data.seed} ·{" "}
              {data.count.toLocaleString()} records
            </span>
            <Badge tone="neutral">{data.test_status}</Badge>
          </div>
          <Panel title="Manifest & split membership" copy={data.labels}>
            <div className="split-grid">
              {data.splits.map((split) => (
                <div key={split.name}>
                  <small>{split.name}</small>
                  <strong>{split.windows.toLocaleString()}</strong>
                  <span>
                    {split.households} households ·{" "}
                    {feature ? "windows" : "records"}
                  </span>
                </div>
              ))}
            </div>
            <div className="checksum">
              <small>
                {feature ? "Updated training" : "Source records"} SHA-256
              </small>
              <code>{data.checksum}</code>
              {data.validation_checksum && (
                <>
                  <small>Validation SHA-256</small>
                  <code>{data.validation_checksum}</code>
                </>
              )}
            </div>
          </Panel>
          <Panel
            title={feature ? "Feature distribution" : "Source distribution"}
            copy="Counts below reflect the current household and source/split filters."
          >
            {feature ? (
              <div className="distribution-grid">
                {data.features.map((key) => {
                  const values = rows.map((row) => row.values![key]);
                  const max = values.length ? Math.max(...values) : 0;
                  const bins = Array.from(
                    { length: 8 },
                    (_, i) =>
                      values.filter((v) =>
                        max === 0
                          ? i === 0
                          : Math.min(7, Math.floor((v / max) * 8)) === i,
                      ).length,
                  );
                  const peak = Math.max(1, ...bins);
                  return (
                    <div key={key} className="distribution">
                      <strong>{label(key)}</strong>
                      <div
                        className="histogram"
                        role="img"
                        aria-label={`${label(key)}: ${values.length} values, minimum ${values.length ? Math.min(...values).toFixed(3) : "unavailable"}, maximum ${max.toFixed(3)}. Bin counts: ${bins.join(", ")}`}
                      >
                        {bins.map((count, i) => (
                          <span
                            key={i}
                            style={{ height: `${(count / peak) * 100}%` }}
                            title={`${count} windows`}
                          />
                        ))}
                      </div>
                      <small>
                        {values.length} windows · max {max.toFixed(3)}
                        {key.endsWith("ratio")
                          ? " × baseline"
                          : " interactions"}
                      </small>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="source-bars">
                {["electricity", "water", "parking", "mall", "gate", "app"].map(
                  (key) => {
                    const count = rows.filter(
                      (row) => row.source === key,
                    ).length;
                    return (
                      <div key={key}>
                        <span>{label(key)}</span>
                        <meter
                          min={0}
                          max={Math.max(1, rows.length)}
                          value={count}
                          aria-label={`${key} record count`}
                        />
                        <strong>{count}</strong>
                      </div>
                    );
                  },
                )}
              </div>
            )}
          </Panel>
          <Panel
            title={
              feature
                ? "Household feature windows"
                : "Household source timeline"
            }
            copy={
              feature
                ? "Relative day index · labels shown only as annotations."
                : "15-minute utility intervals · sparse events retain attribution and trip groups."
            }
          >
            <div className="filter-bar">
              <label>
                Household
                <select
                  aria-label="Household"
                  value={household}
                  onChange={(e) => {
                    filter("household", e.target.value);
                  }}
                >
                  <option value="all">All households</option>
                  {data.households.map((home) => (
                    <option key={home}>{home}</option>
                  ))}
                </select>
              </label>
              <label>
                {feature ? "Partition" : "Source"}
                <select
                  aria-label={feature ? "Partition" : "Source"}
                  value={source}
                  onChange={(e) => {
                    filter("source", e.target.value);
                  }}
                >
                  <option value="all">
                    {feature ? "All partitions" : "All sources"}
                  </option>
                  {(feature
                    ? ["training", "validation"]
                    : ["electricity", "water", "parking", "mall", "gate", "app"]
                  ).map((key) => (
                    <option key={key} value={key}>
                      {label(key)}
                    </option>
                  ))}
                </select>
              </label>
              <span>{rows.length.toLocaleString()} matching records</span>
            </div>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Household</th>
                    <th>{feature ? "Day / split" : "Timestamp (MYT)"}</th>
                    {feature ? (
                      data.features.map((key) => (
                        <th key={key}>{label(key)}</th>
                      ))
                    ) : (
                      <>
                        <th>Source</th>
                        <th>Value / unit</th>
                        <th>Attribution</th>
                        <th>Evidence group</th>
                      </>
                    )}
                    <th>{feature ? "Evaluation annotation" : "Validation"}</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((row, i) => (
                    <tr key={i}>
                      <td>
                        <strong>{row.household}</strong>
                      </td>
                      <td>
                        {feature ? (
                          <>
                            Day {row.day}
                            <small className="cell-note">{row.split}</small>
                          </>
                        ) : (
                          when(row.at!)
                        )}
                      </td>
                      {feature ? (
                        data.features.map((key) => (
                          <td key={key}>
                            {row.values![key].toFixed(3)}
                            {key.endsWith("ratio") ? " ×" : ""}
                          </td>
                        ))
                      ) : (
                        <>
                          <td>{label(row.source!)}</td>
                          <td>
                            {row.value} {row.unit}
                          </td>
                          <td>{row.attribution}</td>
                          <td>
                            <code>{row.group}</code>
                          </td>
                        </>
                      )}
                      <td>
                        {feature ? (
                          <Badge tone={row.label ? "orange" : "neutral"}>
                            {row.label
                              ? "Synthetic concern"
                              : "Synthetic benign"}
                          </Badge>
                        ) : (
                          "Schema valid"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!rows.length && (
              <p className="empty">No records match these filters.</p>
            )}
            <div className="pagination">
              <span>
                {rows.length ? page * 20 + 1 : 0}–
                {Math.min((page + 1) * 20, rows.length)} of {rows.length}
              </span>
              <button
                className="button secondary"
                disabled={page === 0}
                onClick={() => filter("page", String(page - 1))}
              >
                Previous
              </button>
              <button
                className="button secondary"
                disabled={(page + 1) * 20 >= rows.length}
                onClick={() => filter("page", String(page + 1))}
              >
                Next
              </button>
            </div>
          </Panel>
        </>
      )}
    </>
  );
}

function FeatureValues({ values }: { values: Record<string, number | null> }) {
  return (
    <dl className="model-facts padded">
      {Object.entries(values).map(([key, value]) => (
        <div key={key}>
          <dt>{label(key)}</dt>
          <dd>
            {value === null ? (
              <Badge tone="orange">Missing · never zero-filled</Badge>
            ) : (
              `${value.toFixed(2)} ${key.endsWith("ratio") ? "× baseline" : "interactions"}`
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function InferencePage({ data, models, act, busy }: PageProps) {
  const inference = data.state.inference;
  const incident = data.state.incident;
  return (
    <>
      <Heading
        title="Inference & incidents"
        copy="Trace the model score, application policy, and the human response."
      >
        <button
          className="button primary"
          disabled={busy}
          onClick={() => void act("score")}
        >
          {busy ? "Running…" : "Run inference"}
          <Icon name="arrow" size={16} />
        </button>
      </Heading>
      <ReplayBar data={data} />
      <div className="two-column">
        <Panel
          title="Current scenario window"
          copy="Explicit synthetic model inputs · these are separate from the source-explorer fixture."
          action={
            <Link to="/demo" className="text-button">
              Change scenario →
            </Link>
          }
        >
          <FeatureValues values={data.features} />
          <p className="panel-copy">
            Coverage/policy: <strong>{label(data.coverage)}</strong>. The model
            uses the registered champion
            {models?.aliases.champion ? ` v${models.aliases.champion}` : ""} at
            the time you run inference.
          </p>
        </Panel>
        <Panel
          title="Recorded inference"
          copy="decision_function score · negative values are model anomalies."
        >
          {inference ? (
            <>
              <div className="score-result">
                <small>Model score · not a health-risk probability</small>
                <strong>{inference.score?.toFixed(4) ?? "Not scored"}</strong>
                <Badge
                  tone={
                    inference.policy_decision === "create-incident"
                      ? "orange"
                      : "neutral"
                  }
                >
                  {label(inference.policy_decision)}
                </Badge>
              </div>
              <dl className="model-facts padded">
                <div>
                  <dt>Recorded at</dt>
                  <dd>{when(inference.at)} MYT</dd>
                </div>
                <div>
                  <dt>Model version</dt>
                  <dd>
                    {inference.version ? (
                      <Link
                        to={`/training/${inference.run_id}`}
                        className="text-button"
                      >
                        v{inference.version} · inspect run →
                      </Link>
                    ) : (
                      "Skipped: incomplete inputs"
                    )}
                  </dd>
                </div>
                <div>
                  <dt>Policy version</dt>
                  <dd>{inference.policy_version}</dd>
                </div>
              </dl>
            </>
          ) : (
            <Empty
              title="Ready for an explicit inference"
              copy="Run the current window through the registered model. Missing utilities skip model scoring and block a new concern."
            />
          )}
        </Panel>
      </div>
      <Panel
        title="Incident queue"
        copy="One shared incident per replay. Ownership and delivery are tracked separately."
      >
        {incident ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Incident</th>
                  <th>Household</th>
                  <th>Status</th>
                  <th>Owner</th>
                  <th>Notifications</th>
                  <th>Trace</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>
                    <strong>{incident.id}</strong>
                    <small className="cell-note">
                      Created {time(incident.created_at)} MYT
                    </small>
                  </td>
                  <td>{incident.household}</td>
                  <td>
                    <Badge
                      tone={incident.status === "open" ? "orange" : "green"}
                    >
                      {incident.status}
                    </Badge>
                  </td>
                  <td>{incident.owner ?? "Unassigned"}</td>
                  <td>
                    {incident.notifications.length} simulated · receipt unknown
                  </td>
                  <td>
                    <Link
                      className="text-button"
                      to={`/incidents/${incident.id}`}
                    >
                      Open timeline →
                    </Link>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            title="No incident in this replay"
            copy="Both fresh utilities, no conflicting activity, and a model anomaly are required to create the demo concern."
          />
        )}
      </Panel>
    </>
  );
}

function IncidentPage({ data, act, busy, id }: PageProps & { id: string }) {
  const incident = data.state.incident;
  if (!incident || incident.id !== id)
    return (
      <>
        <Heading
          title="Incident unavailable"
          copy="This incident is outside the current replay or was removed by a replay reset."
        />
        <Link to="/inference" className="button secondary">
          Return to inference
        </Link>
      </>
    );
  return (
    <>
      <Heading
        eyebrow="SHARED INCIDENT TRACE"
        title={incident.id}
        copy={`${incident.household} · created ${when(incident.created_at)} MYT`}
      >
        <Link to="/inference" className="button secondary">
          All incidents
        </Link>
      </Heading>
      <ReplayBar data={data} />
      {incident.inference && (
        <Panel
          title="Recorded incident trigger"
          copy={`Policy ${incident.inference.policy_version} · score ${incident.inference.score?.toFixed(4) ?? "unavailable"} · ${when(incident.inference.at)} MYT`}
          action={
            <Link
              className="text-button"
              to={`/training/${incident.inference.run_id}`}
            >
              Model v{incident.inference.version} · inspect run →
            </Link>
          }
        >
          <FeatureValues values={incident.inference.features} />
          <p className="panel-copy">
            These inputs and the numeric model version are saved with this
            incident. Later scoring and registry changes do not replace its
            trigger evidence.
          </p>
        </Panel>
      )}
      <div className="incident-summary">
        <Badge tone={incident.status === "open" ? "orange" : "green"}>
          {incident.status}
        </Badge>
        <strong>
          {incident.owner
            ? `Owner: ${incident.owner}`
            : "Awaiting responsibility"}
        </strong>
        <span>
          {incident.outcome ?? "No completed check-in outcome recorded"}
        </span>
      </div>
      <div className="two-column">
        <Panel
          title="Incident timeline"
          copy="Persisted transitions from the shared replay."
        >
          <Timeline events={incident.events} />
        </Panel>
        <Panel
          title="Notification evidence"
          copy="Creation does not establish delivery, receipt, or acknowledgement."
        >
          <div className="notification-list">
            {incident.notifications.map((notification) => (
              <div key={notification.stage}>
                <span className="journey-icon">
                  <Icon name="shield" />
                </span>
                <div>
                  <strong>{label(notification.stage)}</strong>
                  <small>Created {time(notification.created_at)} MYT</small>
                  <Badge tone="orange">{notification.delivery}</Badge>
                </div>
              </div>
            ))}
          </div>
          <p className="panel-copy">
            {data.transport}. Unanswered deadlines use persisted notification
            creation time; refreshing this page does not restart them.
          </p>
        </Panel>
      </div>
      <Panel
        title="Follow-up controls"
        copy="Synthetic actor actions for demonstrating responsibility and escalation."
      >
        <div className="inline-actions">
          <button
            className="button secondary"
            disabled={busy || incident.status !== "open" || !!incident.owner}
            onClick={() => void act("family_ack")}
          >
            Simulate family taking responsibility
          </button>
          <button
            className="button secondary"
            disabled={busy}
            onClick={() => void act("advance", { minutes: 5 })}
          >
            Advance 5 minutes
          </button>
          <Link className="text-button" to="/response">
            View township workspace →
          </Link>
        </div>
        <p className="panel-copy">
          Taking responsibility stops unsent unanswered stages and keeps the
          incident open. A township responder must accept and record an outcome
          to complete their assigned check-in.
        </p>
      </Panel>
    </>
  );
}

function Operations({ data, models }: PageProps) {
  const incident = data.state.incident;
  const notifications = incident?.notifications ?? [];
  const failed =
    models?.jobs.filter((job) => job.status === "failed").length ?? 0;
  return (
    <>
      <Heading
        title="Operations & coverage"
        copy="Keep availability, execution and evidence limits visible."
      />
      <ReplayBar data={data} />
      <div className="kpi-grid">
        <Kpi
          title="Recorded inference"
          value={
            data.state.inferences?.length ?? (data.state.inference ? 1 : 0)
          }
          copy="Current replay · explicit operator runs"
        />
        <Kpi
          title="Notification records"
          value={notifications.length}
          copy="Simulated creation · no delivery receipts"
        />
        <Kpi
          title="Failed training jobs"
          value={models ? failed : "—"}
          copy="Latest 20 persisted local jobs"
        />
        <Kpi
          title="Drift readiness"
          value="Limited"
          copy="One window · not enough evidence"
        />
      </div>
      <Panel
        title="Source freshness"
        copy="Feed check age is measured against the shared simulation clock. Sparse event silence does not imply feed failure."
      >
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Source</th>
                <th>Feed status</th>
                <th>Check age</th>
                <th>Last fixture activity (MYT)</th>
                <th>Coverage interpretation</th>
              </tr>
            </thead>
            <tbody>
              {data.sources.map((source) => (
                <tr key={source.id}>
                  <td>
                    <strong>{source.name}</strong>
                  </td>
                  <td>
                    <Badge
                      tone={source.status === "available" ? "green" : "orange"}
                    >
                      {source.status}
                    </Badge>
                  </td>
                  <td>
                    {Math.round((data.clock - source.feed_checked_at) / 60000)}{" "}
                    min
                  </td>
                  <td>{when(source.last_event)}</td>
                  <td>
                    {source.status === "delayed"
                      ? "Block new inactivity concern"
                      : ["water", "electricity"].includes(source.id)
                        ? "Household utility evidence"
                        : "Sparse, attribution-dependent events"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
      <div className="two-column">
        <Panel
          title="Execution & delivery"
          copy="Actual training state and replay transport limitations."
        >
          <dl className="model-facts padded">
            <div>
              <dt>Training process</dt>
              <dd>
                {models?.jobs.find((job) =>
                  ["queued", "running"].includes(job.status),
                )?.status ?? (models ? "No active job" : "MLflow unavailable")}
              </dd>
            </div>
            <div>
              <dt>Escalation worker</dt>
              <dd>Explicit shared-clock advancement</dd>
            </div>
            <div>
              <dt>iOS transport</dt>
              <dd>Not connected</dd>
            </div>
            <div>
              <dt>Delivery latency</dt>
              <dd>Unmeasured · no receipts</dd>
            </div>
            <div>
              <dt>Receipt missingness</dt>
              <dd>
                {notifications.length} / {notifications.length} unknown
              </dd>
            </div>
          </dl>
          <p className="panel-copy">
            A local API refresh is not a worker heartbeat. Training failures are
            retained in Training; notification retries and device delivery
            remain pending.
          </p>
        </Panel>
        <Panel
          title="Feature drift review"
          copy="smoke-features-v1 · no automatic retraining or promotion."
        >
          <div className="drift-state">
            <Icon name="layers" size={30} />
            <Badge tone="orange">Insufficient recent samples</Badge>
            <p>
              {data.state.inference
                ? "1 recorded scenario window"
                : "0 recorded scenario windows"}{" "}
              against a versioned training fixture. No statistical drift result
              is reported.
            </p>
            <Link className="text-button" to="/datasets/smoke-features-v1">
              Inspect reference distributions →
            </Link>
          </div>
        </Panel>
      </div>
    </>
  );
}

function Demo({ data, act, busy }: PageProps) {
  const [scenario, setScenario] = useState(data.state.scenario);
  const [reset, setReset] = useState(false);
  return (
    <>
      <Heading
        title="Anomaly detection"
        copy="A repeatable walkthrough with one shared clock and real model evidence."
      />
      <ReplayBar data={data} />
      <div className="two-column">
        <Panel
          title="1. Choose a scenario"
          copy="Loading starts a new replay. Existing MLflow runs and datasets are preserved."
        >
          <div className="scenario-options">
            {data.scenarios.map((option) => (
              <label
                key={option.id}
                className={
                  scenario === option.id
                    ? "scenario-option selected"
                    : "scenario-option"
                }
              >
                <input
                  type="radio"
                  name="scenario"
                  value={option.id}
                  checked={scenario === option.id}
                  onChange={() => setScenario(option.id)}
                />
                <span>
                  <strong>{option.name}</strong>
                  <small>
                    {
                      {
                        concern: "Both utilities low, no resident activity",
                        missing_water: "Missing utility blocks a concern",
                        resident_activity:
                          "Resident activity conflicts with inactivity",
                        away: "Away status pauses new concerns",
                        usual: "Usual utility and app activity",
                      }[option.id]
                    }
                  </small>
                </span>
              </label>
            ))}
          </div>
          <div className="panel-copy">
            <button
              className="button primary full"
              disabled={busy}
              onClick={() => void act("load", { scenario })}
            >
              Load scenario <Icon name="arrow" size={16} />
            </button>
          </div>
        </Panel>
        <div>
          <Panel
            title="2. Run & follow the replay"
            copy="The browser does not invent progress or advance time automatically."
          >
            <div className="clock-display">
              <small>SHARED SIMULATION CLOCK · MYT</small>
              <strong>{time(data.clock)}</strong>
              <span>
                {data.state.minutes} minutes advanced · run {data.state.id}
              </span>
            </div>
            <div className="demo-actions">
              <button
                className="button primary"
                disabled={busy}
                onClick={() => void act("score")}
              >
                {busy ? "Working…" : "Run registered model"}
                <Icon name="flask" size={16} />
              </button>
              <button
                className="button secondary"
                disabled={busy}
                onClick={() => void act("advance", { minutes: 5 })}
              >
                Advance +5 min
              </button>
              <button
                className="button secondary"
                disabled={busy}
                onClick={() => void act("advance", { minutes: 10 })}
              >
                Advance +10 min
              </button>
            </div>
            <div className="panel-copy">
              <Link
                className="text-button"
                to={
                  data.state.incident
                    ? `/incidents/${data.state.incident.id}`
                    : "/inference"
                }
              >
                Inspect current trace →
              </Link>
            </div>
          </Panel>
          <Panel
            title="Replay boundary"
            copy="Only this synthetic replay can be reset."
          >
            <p className="panel-copy">
              Reset clears scenario, clock, current inference and incident.
              Training jobs, datasets, model versions and the reset audit are
              retained.
            </p>
            <div className="panel-copy">
              <button
                className="button secondary"
                disabled={busy}
                onClick={() => setReset(true)}
              >
                Reset replay
              </button>
            </div>
          </Panel>
        </div>
      </div>
      <Panel
        title="Replay audit"
        copy="Recent actions in the current run. Reset events are also retained in the local audit store."
      >
        {data.state.audit.length ? (
          <Timeline events={data.state.audit.slice(-12)} />
        ) : (
          <Empty
            title="Ready to begin"
            copy="Load a named scenario to start the recorded walkthrough."
          />
        )}
      </Panel>
      {reset && (
        <Modal
          title="Reset this synthetic replay?"
          onClose={() => !busy && setReset(false)}
        >
          <p className="modal-copy">
            The current replay incident and simulation clock will be cleared.
            Dataset and MLflow evidence will be preserved.
          </p>
          <div className="modal-actions">
            <button
              className="button secondary"
              onClick={() => setReset(false)}
            >
              Cancel
            </button>
            <button
              className="button primary"
              disabled={busy}
              onClick={async () => {
                await act("reset");
                setReset(false);
              }}
            >
              Confirm reset
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}

type Task = Omit<Incident, "notifications" | "assigned_to">;
type ResponseData = {
  revision: number;
  clock: number;
  identity: string;
  tasks: Task[];
  scope: string;
};
function ResponsePage() {
  const [data, setData] = useState<ResponseData | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState("");
  const [confirm, setConfirm] = useState<Task | null>(null);
  const load = useCallback(async () => {
    try {
      setData(await api<ResponseData>("/api/response"));
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 5000);
    return () => clearInterval(timer);
  }, [load]);
  async function respond(task: Task, action: string) {
    if (!data) return;
    setBusy(true);
    setError("");
    try {
      setData(
        await api<ResponseData>(`/api/response/${task.id}`, {
          method: "POST",
          body: JSON.stringify({ action, revision: data.revision, outcome }),
        }),
      );
      setConfirm(null);
      setOutcome("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Heading
        eyebrow="ASSIGNED TOWNSHIP WORKSPACE"
        title="Your assigned check-ins"
        copy="Take responsibility, complete a human check-in, and record the outcome."
      />
      <div className="scope-bar">
        <span>
          <strong>Responder 01</strong> · restricted synthetic identity
        </span>
        <Badge tone="neutral">Assigned work only</Badge>
      </div>
      {error && (
        <div role="alert" className="alert error">
          <span>{error}</span>
          <button className="text-button" onClick={() => void load()}>
            Refresh
          </button>
        </div>
      )}
      {!data ? (
        <p className="empty" role="status">
          Loading assigned tasks…
        </p>
      ) : data.tasks.length ? (
        data.tasks.map((task) => (
          <Panel
            key={task.id}
            title={`${task.household} · wellbeing check-in`}
            copy={`${task.id} · ${when(task.created_at)} MYT`}
            action={
              <Badge tone={task.status === "open" ? "orange" : "green"}>
                {task.status}
              </Badge>
            }
          >
            <div className="responder-copy">
              <p>
                A household wellbeing check-in needs follow-up. This synthetic
                workspace shows only the information needed for your assigned
                task.
              </p>
              <dl className="model-facts">
                <div>
                  <dt>Responsibility</dt>
                  <dd>{task.owner ?? "Awaiting your acceptance"}</dd>
                </div>
                <div>
                  <dt>Completed outcome</dt>
                  <dd>{task.outcome ?? "Not recorded"}</dd>
                </div>
              </dl>
              {task.status === "open" &&
                (!task.accepted ? (
                  <button
                    className="button primary"
                    disabled={busy}
                    onClick={() => void respond(task, "accept")}
                  >
                    Accept responsibility
                  </button>
                ) : (
                  <button
                    className="button primary"
                    disabled={busy}
                    onClick={() => setConfirm(task)}
                  >
                    Record completed check-in
                  </button>
                ))}
            </div>
            <Timeline events={task.events} />
          </Panel>
        ))
      ) : (
        <Panel title="Assigned check-ins">
          <Empty
            title="No assigned work"
            copy="An unanswered concern reaches township at +10 minutes in the operator replay. Only work assigned to responder-01 appears here."
          />
        </Panel>
      )}
      {confirm && (
        <Modal
          title="Record a completed check-in"
          onClose={() => !busy && setConfirm(null)}
        >
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void respond(confirm, "complete");
            }}
          >
            {error && (
              <p role="alert" className="alert error">
                {error}
              </p>
            )}
            <label>
              Completed outcome
              <textarea
                value={outcome}
                onChange={(event) => setOutcome(event.target.value)}
                required
                minLength={3}
                maxLength={500}
                placeholder="Describe the completed contact and any follow-up."
              />
            </label>
            <p className="field-help">
              Record a completed human check-in. Accepting responsibility alone
              does not resolve an incident.
            </p>
            <div className="modal-actions">
              <button
                type="button"
                className="button secondary"
                disabled={busy}
                onClick={() => setConfirm(null)}
              >
                Cancel
              </button>
              <button
                className="button primary"
                disabled={busy || outcome.trim().length < 3}
              >
                Complete check-in
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
