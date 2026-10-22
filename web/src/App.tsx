import { useCallback, useEffect, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  api,
  type Job,
  type ModelVersion,
  type RunDetail,
  type Snapshot,
} from "./api";

import { useLocation, useNavigate, Link } from "react-router-dom";
import {
  Badge,
  Icon,
  Modal,
  metric,
  score,
  percentage,
  when,
  runName,
} from "./ui";
import { DashboardPages, pages } from "./DashboardPages";
import { DemoFlow, demoSteps } from "./DemoFlow";
import { getRole, switchRole } from "./api";
import { GuidedDemo, guidedDemoOnEntry, startTour } from "./GuidedDemo";

export default function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const currentPage = pages.find((p) =>
    location.pathname === p.path || location.pathname.startsWith(`${p.path}/`),
  );
  const view = location.pathname.startsWith("/incidents/")
    ? "Incident trace"
    : (currentPage?.name ?? "Page not found");
  const mlopsPage =
    getRole() === "operator" &&
    ["Model training", "Evaluation", "Model registry"].includes(view);
  const role = getRole();
  const activeStep = demoSteps.find((step) => role === "responder"
    ? step.path === "/response"
    : step.routes.some((route) => location.pathname === route || location.pathname.startsWith(`${route}/`)));
  const [sidebarOpen, setSidebarOpen] = useState(false);
  // GUIDED_DEMO=true: start the guided demo once per browser session, on the operator's first entry.
  useEffect(() => {
    // Automated test browsers (navigator.webdriver) skip the auto-start; the Demo guide button still works.
    if (!guidedDemoOnEntry || role !== "operator" || navigator.webdriver) return;
    try {
      if (sessionStorage.getItem("simeguardian-guide-seen")) return;
      sessionStorage.setItem("simeguardian-guide-seen", "1");
    } catch {
      // Storage unavailable (private mode): still show the guide.
    }
    startTour();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [data, setData] = useState<Snapshot | null>(null);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [training, setTraining] = useState(false);
  const [detail, setDetail] = useState<RunDetail | null>(null);
  const [jobDetail, setJobDetail] = useState<
    (Job & { log: string; log_truncated: boolean }) | null
  >(null);
  const [selection, setSelection] = useState<string[]>([]);
  const [action, setAction] = useState<{
    type: "promote" | "rollback";
    version?: string;
  } | null>(null);
  const [search, setSearch] = useState("");
  const load = useCallback(async () => {
    try {
      if (role !== "operator") {
        setLoading(false);
        return;
      }
      const snapshot = await api<Snapshot>("/api/mlops");
      setData(snapshot);
      setError("");
      setSelection((current) =>
        current.length
          ? current.filter((id) =>
              snapshot.versions.some((v) => v.run.id === id),
            )
          : [
              snapshot.versions[0]?.run.id,
              snapshot.versions.at(-1)?.run.id,
            ].filter(
              (id, index, all): id is string =>
                !!id && all.indexOf(id) === index,
            ),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [role]);
  useEffect(() => {
    void load();
    const timer = setInterval(() => {
      void load();
    }, 4000);
    return () => clearInterval(timer);
  }, [load]);

  const versions = data?.versions ?? [];
  const champion = versions.find((v) => v.version === data?.aliases.champion);
  const previous = versions.find(
    (v) => v.version === data?.aliases.previous_champion,
  );
  const latest = versions.at(-1);
  const chartVersions = versions.filter(
    (v) =>
      v.run.tags.validation_digest &&
      v.run.tags.validation_digest ===
        (champion ?? latest)?.run.tags.validation_digest,
  );
  const selected = versions.filter((v) => selection.includes(v.run.id));
  const activeJob = data?.jobs.find((j) =>
    ["queued", "running"].includes(j.status),
  );
  const comparable =
    selected.length === 2 &&
    !!selected[0].run.tags.validation_digest &&
    selected[0].run.tags.validation_digest ===
      selected[1].run.tags.validation_digest;
  const benchmark = metric(champion ?? latest, "validation_windows");
  const benign =
    (metric(champion, "validation_false_positives") ?? 0) +
    (metric(champion, "validation_true_negatives") ?? 0);
  const visible = versions
    .filter((v) =>
      `${v.version} ${v.run.name} ${v.run.id}`
        .toLowerCase()
        .includes(search.toLowerCase()),
    )
    .reverse();

  async function inspect(id: string) {
    if (location.pathname !== `/training/${id}`) {
      navigate(`/training/${id}`);
      return;
    }
    setBusy(true);
    setActionError("");
    try {
      setDetail(await api<RunDetail>(`/api/runs/${id}`));
    } catch (e) {
      setActionError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    const id = location.pathname.match(/^\/training\/([a-f0-9]{32})$/)?.[1];
    if (id && role === "operator") void inspect(id);
    else setDetail(null);
  }, [location.pathname, role]);

  useEffect(() => {
    const id = location.pathname.match(
      /^\/training\/jobs\/([a-f0-9]{32})$/,
    )?.[1];
    if (!id || role !== "operator") {
      setJobDetail(null);
      return;
    }
    let cancelled = false;
    api<Job & { log: string; log_truncated: boolean }>(`/api/jobs/${id}`)
      .then((result) => {
        if (!cancelled) setJobDetail(result);
      })
      .catch((e) => {
        if (!cancelled) setActionError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [location.pathname, role]);

  async function startTraining(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setActionError("");
    const form = new FormData(event.currentTarget);
    try {
      await api<Job>("/api/training-runs", {
        method: "POST",
        body: JSON.stringify({
          routine: form.get("routine"),
          n_estimators: Number(form.get("n_estimators")),
          contamination: Number(form.get("contamination")),
          random_state: Number(form.get("random_state")),
        }),
      });
      setTraining(false);
      setNotice(
        "Training started. The new version will remain a candidate until you promote it.",
      );
      await load();
    } catch (e) {
      setActionError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function modelAction() {
    if (!action) return;
    setBusy(true);
    setActionError("");
    try {
      await api(
        action.type === "promote"
          ? `/api/models/${action.version}/promote`
          : "/api/models/rollback",
        {
          method: "POST",
          body: JSON.stringify({
            expected_champion: data?.aliases.champion ?? null,
          }),
        },
      );
      setNotice(
        action.type === "promote"
          ? `Version ${action.version} is now the registered champion.`
          : "The previous champion has been restored.",
      );
      setAction(null);
      await load();
    } catch (e) {
      setActionError((e as Error).message);
      setAction(null);
      await load();
    } finally {
      setBusy(false);
    }
  }

  const table = (
    <section className="panel runs-panel">
      <div className="panel-heading">
        <div>
          <h2>
            {view === "Model registry"
              ? "Registered model versions"
              : "Experiment runs"}{" "}
            <span className="count">{versions.length}</span>
          </h2>
          <p>Select two runs to compare their validation results.</p>
        </div>
        <label className="search">
          <span className="sr-only">Search experiments</span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search runs or versions…"
          />
        </label>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>
                <span className="sr-only">Compare</span>
              </th>
              <th>Experiment / version</th>
              <th>Status</th>
              <th>Training windows</th>
              <th>F1 score</th>
              <th>False positives</th>
              {view === "Model registry" && <th>Action</th>}
            </tr>
          </thead>
          <tbody>
            {visible.map((version) => (
              <tr
                key={version.version}
                className={
                  selection.includes(version.run.id) ? "selected-row" : ""
                }
              >
                <td>
                  <input
                    type="checkbox"
                    aria-label={`Compare version ${version.version}`}
                    checked={selection.includes(version.run.id)}
                    onChange={() =>
                      setSelection((current) =>
                        current.includes(version.run.id)
                          ? current.filter((id) => id !== version.run.id)
                          : [...current.slice(-1), version.run.id],
                      )
                    }
                  />
                </td>
                <td>
                  <button
                    className="run-link"
                    onClick={() => void inspect(version.run.id)}
                    disabled={busy}
                  >
                    {runName(version.run.name)}
                  </button>
                  <div className="row-sub">
                    <span>v{version.version}</span>
                    <span>·</span>
                    {when(version.run.started_at)} MYT
                  </div>
                </td>
                <td>
                  {version.aliases.includes("champion") ? (
                    <Badge tone="green">
                      <Icon name="check" size={12} />
                      Champion
                    </Badge>
                  ) : (
                    <Badge tone="neutral">Candidate</Badge>
                  )}
                </td>
                <td>{version.run.parameters.training_windows ?? "—"}</td>
                <td className="numeric strong">
                  {score(metric(version, "validation_window_f1"))}
                </td>
                <td className="numeric">
                  {metric(version, "validation_false_positives") ?? "—"}
                </td>
                {view === "Model registry" && <td>
                  <button
                    className="text-button"
                    disabled={busy || !!error || !version.can_promote}
                    title={version.gate_reason}
                    onClick={() =>
                      setAction({ type: "promote", version: version.version })
                    }
                  >
                    {version.aliases.includes("champion")
                      ? "Current champion"
                      : version.can_promote
                        ? "Promote"
                        : "Gate not passed"}
                  </button>
                </td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!versions.length && (
        <div className="empty">
          <Icon name="flask" size={28} />
          <h3>
            {loading
              ? "Loading your experiments…"
              : "Your first experiment starts here"}
          </h3>
          <p>Train an initial model, then compare it with a routine update.</p>
        </div>
      )}
      {versions.length > 0 && !visible.length && (
        <p className="empty">No runs match your search.</p>
      )}
      <div className="panel-footer">
        <span>
          <span className="small-dot" />
          Actual recorded runs · latest {data?.history_limit ?? 100} versions
        </span>
        <span>Timezone: MYT (UTC+8)</span>
      </div>
    </section>
  );

  return (
    <div className={`workspace ${sidebarOpen ? "" : "sidebar-hidden"}`}>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <aside id="workspace-sidebar" className="sidebar" hidden={!sidebarOpen}>
        <div className="brand">
          <img
            className="brand-logo"
            src="/brand/sime-darby-property.png"
            alt="Sime Darby Property"
            width={250}
            height={189}
          />
          <div>
            Sime<span>Guardian</span>
            <small>TOWNSHIP WELLBEING</small>
          </div>
        </div>
        <div className="workspace-label">{role === "operator" ? "DEMO JOURNEY" : "RESPONDER WORKSPACE"}</div>
        <nav aria-label="Workspace">
          {demoSteps
            .filter((item) => role === "operator" || item.path === "/response")
            .map(({ name, path, icon }) => (
              <div key={path}>
                <Link
                  to={path}
                  viewTransition
                  className={activeStep?.path === path ? "nav-item active" : "nav-item"}
                  onClick={() => setSearch("")}
                  aria-current={activeStep?.path === path ? "page" : undefined}
                >
                  <Icon name={icon} />
                  {name}
                  {activeStep?.path === path && <span className="nav-mark" />}
                </Link>
              </div>
            ))}
        </nav>
        <div className="sidebar-note">
          <div className="note-icon">
            <Icon name="shield" size={18} />
          </div>
          <strong>Built for better check-ins</strong>
          <p>
            From household signals to a human check-in. One traceable journey.
          </p>
          <span>Sime Darby Property Hackathon 2026</span>
        </div>
        <div className="operator">
          <div className="avatar">OP</div>
          <div>
            <strong>
              {role === "operator" ? "Local operator" : "Responder 01"}
            </strong>
            <small>Local synthetic identity</small>
          </div>
          <span className="online-dot" />
        </div>
      </aside>
      <div className="main-shell">
        <GuidedDemo />
        <header className="topbar">
          <DemoFlow />
          <div className="topbar-toolbar">
            <div className="topbar-brand">
              <button
                className="icon-button sidebar-toggle"
                aria-label={sidebarOpen ? "Hide sidebar" : "Show sidebar"}
                aria-expanded={sidebarOpen}
                aria-controls="workspace-sidebar"
                onClick={() => setSidebarOpen(!sidebarOpen)}
              >
                <Icon name={sidebarOpen ? "close" : "menu"} />
              </button>
              <Link to={role === "responder" ? "/response" : "/overview"} className="topbar-name">Sime<span>Guardian</span></Link>
            </div>
            <div className="topbar-right">
              <span className={`connection ${error ? "offline" : ""}`}>
                <span className="small-dot" />
                {error && mlopsPage
                  ? "Tracking needs attention"
                  : loading
                    ? "Connecting…"
                    : "Local prototype"}
              </span>
              <button data-tour="demo-guide" className="button secondary demo-guide-button" onClick={startTour}>
                Demo guide
              </button>
              <button
                className="icon-button"
                aria-label="Refresh workspace"
                onClick={() => {
                  void load();
                  window.dispatchEvent(new Event("workspace-refresh"));
                }}
              >
                <Icon name="refresh" />
              </button>
              <button
                className="role-switch"
                onClick={() => {
                  switchRole(role === "operator" ? "responder" : "operator");
                  window.location.assign(
                    role === "operator" ? "/response" : "/demo",
                  );
                }}
              >
                <span className="top-avatar">
                  {role === "operator" ? "OP" : "R1"}
                </span>
                {role === "operator"
                  ? "Switch to responder"
                  : "Return to operator"}
              </button>
            </div>
          </div>
        </header>
        <main id="main">
          {!mlopsPage && (
            <DashboardPages role={role} models={data} refreshModels={load} />
          )}
          {mlopsPage && role === "operator" && (
            <>
              <div className="page-heading">
                <div>
                  <span className="eyebrow">MODEL LIFECYCLE</span>
                  <h1>{view}</h1>
                  <p>
                    Better models. Clearer evidence. Everything in one
                    workspace.
                  </p>
                </div>
                <button
                  className="button primary"
                  disabled={busy || !!activeJob || !!error || loading}
                  onClick={() => {
                    setActionError("");
                    setTraining(true);
                  }}
                >
                  <Icon name="flask" size={17} />
                  Train new model
                </button>
              </div>
              {view === "Model training" && (
                <div className="training-tools">
                  <Link className="text-button" to="/datasets">View training data →</Link>
                  <details>
                    <summary>Advanced model controls</summary>
                    <div className="training-links">
                      <Link className="text-button" to="/models">Model registry</Link>
                      <Link className="text-button" to="/evaluation">Detailed evaluation</Link>
                    </div>
                  </details>
                </div>
              )}
              <div className="scope-bar">
                <div>
                  <span className="scope-dot" />
                  <strong>Synthetic validation</strong>
                  <span className="scope-separator">/</span>
                  <span>
                    {benchmark ?? "—"} feature windows · fixed household split
                  </span>
                </div>
                <span className="scope-right">
                  Test set untouched
                  <Icon name="shield" size={15} />
                </span>
              </div>
              {error && (
                <div role="alert" className="alert error">
                  <div>
                    <strong>Something needs attention</strong>
                    <p>
                      {error}
                      {data
                        ? " Previously loaded results are shown until the next successful refresh."
                        : ""}
                    </p>
                  </div>
                  <button className="text-button" onClick={() => void load()}>
                    Retry
                  </button>
                </div>
              )}
              {actionError && !training && (
                <div role="alert" className="alert error">
                  <span>{actionError}</span>
                  <button
                    className="icon-button"
                    aria-label="Dismiss error"
                    onClick={() => setActionError("")}
                  >
                    <Icon name="close" size={16} />
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
                    <Icon name="close" size={16} />
                  </button>
                </div>
              )}
              {activeJob && (
                <div role="status" className="alert progress">
                  <span className="spinner" />
                  <div>
                    <strong>
                      {activeJob.status === "queued"
                        ? "Training queued"
                        : "Training in progress"}
                    </strong>
                    <p>
                      {String(activeJob.parameters.n_estimators)} trees ·{" "}
                      {activeJob.parameters.routine === "updated"
                        ? "updated routine data"
                        : "initial routine data"}{" "}
                      · status comes from the training process
                    </p>
                  </div>
                </div>
              )}
              {data?.jobs[0]?.status === "failed" && (
                <div role="alert" className="alert error">
                  <div>
                    <strong>Latest training job failed</strong>
                    <p>{data.jobs[0].error}</p>
                  </div>
                </div>
              )}

              {(view === "Model training" || view === "Evaluation") && (
                <>
                  <div className="kpi-grid">
                    <article className="kpi">
                      <div className="kpi-label">
                        Champion model
                        <Icon name="layers" size={16} />
                      </div>
                      <div className="kpi-value">
                        {champion ? `v${champion.version}` : "—"}
                        <Badge tone={champion ? "green" : "neutral"}>
                          {champion ? "Registered" : "Not selected"}
                        </Badge>
                      </div>
                      <p>
                        Isolation Forest<span>·</span>
                        {champion?.run.parameters.n_estimators ?? "—"} trees
                      </p>
                    </article>
                    <article className="kpi">
                      <div className="kpi-label">
                        Validation F1
                        <Icon name="flask" size={16} />
                      </div>
                      <div className="kpi-value">
                        {score(metric(champion, "validation_window_f1"))}
                      </div>
                      <p>
                        {previous &&
                        champion?.run.tags.validation_digest ===
                          previous.run.tags.validation_digest ? (
                          <>
                            <span className="positive">
                              {(metric(champion, "validation_window_f1") ?? 0) -
                                (metric(previous, "validation_window_f1") ??
                                  0) >=
                              0
                                ? "+"
                                : ""}
                              {(
                                (metric(champion, "validation_window_f1") ??
                                  0) -
                                (metric(previous, "validation_window_f1") ?? 0)
                              ).toFixed(3)}
                            </span>{" "}
                            vs previous champion
                          </>
                        ) : (
                          "Window-level score · 0 to 1"
                        )}
                      </p>
                    </article>
                    <article className="kpi">
                      <div className="kpi-label">
                        Validation recall
                        <Icon name="check" size={16} />
                      </div>
                      <div className="kpi-value">
                        {percentage(
                          metric(champion, "validation_window_recall"),
                        )}
                      </div>
                      <p>
                        {metric(champion, "validation_true_positives") ?? "—"}{" "}
                        of{" "}
                        {champion
                          ? (metric(champion, "validation_true_positives") ??
                              0) +
                            (metric(champion, "validation_false_negatives") ??
                              0)
                          : "—"}{" "}
                        concern windows
                      </p>
                    </article>
                    <article className="kpi">
                      <div className="kpi-label">
                        False positives
                        <Icon name="shield" size={16} />
                      </div>
                      <div className="kpi-value">
                        {metric(champion, "validation_false_positives") ?? "—"}
                        <span className="kpi-unit">
                          / {champion ? benign : "—"}
                        </span>
                      </div>
                      <p>Benign validation windows flagged</p>
                    </article>
                  </div>
                  <div className="analysis-grid">
                    <section className="panel evolution">
                      <div className="panel-heading">
                        <div>
                          <h2>Model evolution</h2>
                          <p>
                            Measured validation F1 across registered versions
                          </p>
                        </div>
                        <span className="legend">
                          <span />
                          Validation F1
                        </span>
                      </div>
                      {chartVersions.length > 0 ? (
                        <>
                          <div
                            className="chart"
                            role="img"
                            aria-label={`Validation F1 by model version. ${chartVersions.map((v) => `Version ${v.version}: ${score(metric(v, "validation_window_f1"))}`).join(". ")}`}
                          >
                            <ResponsiveContainer width="100%" height="100%">
                              <LineChart
                                data={chartVersions.map((v) => ({
                                  version: `v${v.version}`,
                                  f1: metric(v, "validation_window_f1"),
                                  benchmark: v.run.tags.validation_digest,
                                }))}
                                margin={{
                                  left: -20,
                                  right: 24,
                                  top: 12,
                                  bottom: 0,
                                }}
                              >
                                <CartesianGrid
                                  strokeDasharray="3 4"
                                  vertical={false}
                                  stroke="#eeedf0"
                                />
                                <XAxis
                                  dataKey="version"
                                  axisLine={false}
                                  tickLine={false}
                                  tick={{ fill: "#85848d", fontSize: 12 }}
                                  dy={10}
                                />
                                <YAxis
                                  domain={[0, 1]}
                                  tickCount={6}
                                  axisLine={false}
                                  tickLine={false}
                                  tick={{ fill: "#85848d", fontSize: 11 }}
                                />
                                <Tooltip
                                  formatter={(value) => [
                                    Number(value).toFixed(3),
                                    "Validation F1",
                                  ]}
                                  contentStyle={{
                                    borderRadius: 10,
                                    border: "1px solid #e9e7eb",
                                    fontSize: 12,
                                  }}
                                />
                                <Line
                                  isAnimationActive={false}
                                  type="linear"
                                  dataKey="f1"
                                  stroke="#d71920"
                                  strokeWidth={2.5}
                                  dot={{ r: 4, fill: "#fff", strokeWidth: 2 }}
                                  activeDot={{ r: 6 }}
                                />
                              </LineChart>
                            </ResponsiveContainer>
                          </div>
                          <div className="chart-caption">
                            <Icon name="check" size={14} />
                            Same validation benchmark · matching versions shown
                            <span>{chartVersions.length} versions</span>
                          </div>
                        </>
                      ) : (
                        <div className="empty">
                          Train your first model to start its evolution history.
                        </div>
                      )}
                    </section>
                    <section className="panel champion-panel">
                      <div className="panel-heading">
                        <div>
                          <h2>Champion model</h2>
                          <p>The version selected in the registry</p>
                        </div>
                        <span className="model-icon">
                          <Icon name="layers" size={19} />
                        </span>
                      </div>
                      <div className="champion-title">
                        <span className="large-version">
                          {champion ? `v${champion.version}` : "—"}
                        </span>
                        <div>
                          <strong>
                            {champion
                              ? runName(champion.run.name)
                              : "No champion selected"}
                          </strong>
                          <span>Isolation Forest</span>
                        </div>
                      </div>
                      <dl className="model-facts">
                        <div>
                          <dt>Training windows</dt>
                          <dd>
                            {champion?.run.parameters.training_windows ?? "—"}
                          </dd>
                        </div>
                        <div>
                          <dt>Validation precision</dt>
                          <dd>
                            {percentage(
                              metric(champion, "validation_window_precision"),
                            )}
                          </dd>
                        </div>
                        <div>
                          <dt>Feature version</dt>
                          <dd>{champion?.run.tags.feature_version ?? "—"}</dd>
                        </div>
                        <div>
                          <dt>Model status</dt>
                          <dd>
                            <span className="positive">
                              {champion
                                ? "Ready in registry"
                                : "Awaiting training"}
                            </span>
                          </dd>
                        </div>
                      </dl>
                      <button
                        className="button secondary full"
                        disabled={!champion || busy}
                        onClick={() =>
                          champion && void inspect(champion.run.id)
                        }
                      >
                        Inspect model evidence
                        <Icon name="arrow" size={16} />
                      </button>
                    </section>
                  </div>
                </>
              )}

              {view === "Evaluation" && champion && (
                <section className="panel evaluation-counts">
                  <div className="panel-heading">
                    <div>
                      <h2>Validation confusion counts</h2>
                      <p>
                        Model-only · fixed benchmark · no episode-level claims
                      </p>
                    </div>
                    <Link
                      to="/datasets/smoke-features-v1"
                      className="text-button"
                    >
                      Inspect dataset →
                    </Link>
                  </div>
                  <div className="comparison-grid">
                    {[
                      ["True positives", "validation_true_positives"],
                      ["False negatives", "validation_false_negatives"],
                      ["True negatives", "validation_true_negatives"],
                      ["False positives", "validation_false_positives"],
                    ].map(([label, key]) => (
                      <div key={key}>
                        <span>{label}</span>
                        <strong>{metric(champion, key) ?? "—"}</strong>
                      </div>
                    ))}
                  </div>
                  <p className="panel-copy">
                    Rule-only and combined episode reports are pending the
                    causal six-source pipeline. Threshold selection uses the
                    validation set; the final test set has not been generated or
                    used.
                  </p>
                </section>
              )}
              {view === "Model registry" && (
                <div className="scope-bar">
                  <span>
                    <strong>Replay inference</strong> resolves the numeric
                    champion at each explicit run.
                  </span>
                  <span>Production serving: not connected</span>
                </div>
              )}
              {table}
              {selected.length === 2 && (
                <section className="panel comparison">
                  <div className="panel-heading">
                    <div>
                      <h2>Run comparison</h2>
                      <p>
                        Version {selected[0].version} → version{" "}
                        {selected[1].version} ·{" "}
                        {comparable
                          ? "matching validation fingerprint"
                          : "different or missing validation fingerprints"}
                      </p>
                    </div>
                    <Badge tone={comparable ? "green" : "orange"}>
                      {comparable ? "Comparable" : "Review benchmark"}
                    </Badge>
                  </div>
                  <div className="comparison-grid">
                    {[
                      ["F1 score", "validation_window_f1"],
                      ["Precision", "validation_window_precision"],
                      ["Recall", "validation_window_recall"],
                      ["False positives", "validation_false_positives"],
                    ].map(([label, key]) => (
                      <div key={key}>
                        <span>{label}</span>
                        <strong>
                          {key.includes("false")
                            ? metric(selected[0], key)
                            : score(metric(selected[0], key))}
                          <Icon name="arrow" size={16} />
                          {key.includes("false")
                            ? metric(selected[1], key)
                            : score(metric(selected[1], key))}
                        </strong>
                      </div>
                    ))}
                  </div>
                  {!comparable && (
                    <p className="comparison-warning">
                      These values use different validation evidence. A direct
                      improvement claim is unavailable.
                    </p>
                  )}
                </section>
              )}
              {view === "Model registry" && (
                <section className="panel registry-actions">
                  <div>
                    <h2>Restore a previous champion</h2>
                    <p>
                      {previous
                        ? `Version ${previous.version} is available. Rollback records an explicit audit event.`
                        : "A previous champion becomes available after a model is replaced."}
                    </p>
                  </div>
                  <button
                    className="button secondary"
                    disabled={!previous || busy || !!error}
                    onClick={() => setAction({ type: "rollback" })}
                  >
                    <Icon name="refresh" size={16} />
                    Roll back champion
                  </button>
                </section>
              )}
              {view === "Model registry" &&
                data?.runs.some((run) => run.tags.event_type) && (
                  <section className="panel job-history">
                    <div className="panel-heading">
                      <div>
                        <h2>Registry activity</h2>
                        <p>Recorded promotion and rollback events</p>
                      </div>
                    </div>
                    {data.runs
                      .filter((run) => run.tags.event_type)
                      .slice(0, 10)
                      .map((run) => (
                        <div className="job-row" key={run.id}>
                          <Icon name="layers" size={17} />
                          <div>
                            <strong>
                              {run.tags.event_type === "promotion"
                                ? "Model promotion"
                                : "Model rollback"}
                              {run.tags.to_version
                                ? ` · v${run.tags.from_version} → v${run.tags.to_version}`
                                : ""}
                            </strong>
                            <small>{when(run.started_at)} MYT</small>
                          </div>
                          <Badge
                            tone={
                              run.status === "FINISHED" ? "green" : "orange"
                            }
                          >
                            {run.status}
                          </Badge>
                          <button
                            className="text-button"
                            onClick={() => void inspect(run.id)}
                          >
                            View evidence
                            <Icon name="arrow" size={14} />
                          </button>
                        </div>
                      ))}
                  </section>
                )}
              {data?.jobs.length ? (
                <section className="panel job-history">
                  <div className="panel-heading">
                    <div>
                      <h2>Training activity</h2>
                      <p>Persisted job outcomes from this workspace</p>
                    </div>
                  </div>
                  {data.jobs.slice(0, 4).map((job) => (
                    <div className="job-row" key={job.id}>
                      <Icon name="clock" size={17} />
                      <div>
                        <strong>
                          {job.parameters.routine === "updated"
                            ? "Routine update"
                            : "Initial routine"}{" "}
                          · {job.parameters.n_estimators} trees
                        </strong>
                        <small>{when(job.created_at * 1000)} MYT</small>
                      </div>
                      <Badge
                        tone={
                          job.status === "completed"
                            ? "green"
                            : job.status === "failed"
                              ? "orange"
                              : "neutral"
                        }
                      >
                        {job.status}
                      </Badge>
                      <Link
                        to={`/training/jobs/${job.id}`}
                        className="text-button"
                      >
                        View log
                      </Link>
                      {job.result?.[0] && (
                        <button
                          className="text-button"
                          onClick={() => void inspect(job.result![0].run_id)}
                        >
                          View result
                          <Icon name="arrow" size={14} />
                        </button>
                      )}
                    </div>
                  ))}
                </section>
              ) : null}
            </>
          )}
          <footer className="page-footer">
            <span>
              <Icon name="shield" size={14} />
              Synthetic prototype · all times MYT (UTC+8)
            </span>
            <span>Powered by FastAPI + MLflow</span>
          </footer>
        </main>
      </div>

      {jobDetail && (
        <Modal
          title="Training job log"
          onClose={() => {
            setJobDetail(null);
            navigate("/training");
          }}
        >
          <div className="evidence-summary">
            <Badge>{jobDetail.status}</Badge>
            <code>{jobDetail.id}</code>
          </div>
          <p className="modal-copy">
            Recorded {when(jobDetail.created_at * 1000)} MYT ·{" "}
            {jobDetail.log_truncated
              ? "Last 20 kB of output"
              : "Local worker output"}
          </p>
          {jobDetail.error && (
            <div role="alert" className="alert error">
              {jobDetail.error}
            </div>
          )}
          <pre className="job-log">
            {jobDetail.log || "The worker has not written output yet."}
          </pre>
        </Modal>
      )}
      {training && (
        <Modal
          title="Train a new model"
          onClose={() => !busy && setTraining(false)}
        >
          <form onSubmit={(event) => void startTraining(event)}>
            {actionError && (
              <div role="alert" className="alert error">
                {actionError}
              </div>
            )}
            <p className="modal-copy">
              Create a real experiment and registered candidate. The champion
              stays unchanged until you promote a version.
            </p>
            <label>
              Training dataset
              <select name="routine" defaultValue="updated">
                <option value="initial">
                  Initial routine · days 15–45 · 496 windows
                </option>
                <option value="updated">
                  Updated routine · days 15–60 · 736 windows
                </option>
              </select>
            </label>
            <div className="form-row">
              <label>
                Number of trees
                <input
                  name="n_estimators"
                  type="number"
                  min="10"
                  max="500"
                  defaultValue="100"
                  required
                />
              </label>
              <label>
                Contamination
                <input
                  name="contamination"
                  type="number"
                  min="0.001"
                  max="0.2"
                  step="0.001"
                  defaultValue="0.02"
                  required
                />
              </label>
            </div>
            <p className="field-help">
              Contamination sets the training cutoff. It is not a health-risk
              probability.
            </p>
            <label>
              Random seed
              <input
                name="random_state"
                type="number"
                min="0"
                max="2147483647"
                defaultValue="42"
                required
              />
            </label>
            <div className="form-note">
              <Icon name="shield" size={17} />
              <span>
                Every run uses the same synthetic validation benchmark. The test
                partition is not used.
              </span>
            </div>
            <div className="modal-actions">
              <button
                type="button"
                className="button secondary"
                disabled={busy}
                onClick={() => setTraining(false)}
              >
                Cancel
              </button>
              <button className="button primary" disabled={busy}>
                {busy ? "Starting…" : "Start training"}
                <Icon name="arrow" size={16} />
              </button>
            </div>
          </form>
        </Modal>
      )}
      {action && (
        <Modal
          title={
            action.type === "promote"
              ? `Promote version ${action.version}?`
              : "Restore the previous champion?"
          }
          onClose={() => !busy && setAction(null)}
        >
          <p className="modal-copy">
            {action.type === "promote"
              ? "The server rechecks the validation benchmark, quality gates and model signature before changing the registered champion."
              : `Version ${data?.aliases.previous_champion} will replace version ${data?.aliases.champion}. This action creates a rollback audit record.`}
          </p>
          <div className="form-note">
            <Icon name="shield" size={18} />
            <span>
              This changes the MLflow registry selection and the next explicit
              demo inference. Previously recorded incident evidence stays
              unchanged.
            </span>
          </div>
          <div className="modal-actions">
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => setAction(null)}
            >
              Cancel
            </button>
            <button
              className="button primary"
              disabled={busy}
              onClick={() => void modelAction()}
            >
              {busy
                ? "Applying…"
                : action.type === "promote"
                  ? "Confirm promotion"
                  : "Confirm rollback"}
            </button>
          </div>
        </Modal>
      )}
      {detail && (
        <Modal
          title={`${runName(detail.name)} · evidence`}
          onClose={() => {
            setDetail(null);
            navigate("/training");
          }}
        >
          <div className="evidence-summary">
            <Badge tone="green">{detail.status}</Badge>
            <code>{detail.id}</code>
          </div>
          <p className="modal-copy">
            Recorded {when(detail.started_at)} MYT ·{" "}
            {detail.tags.data_scope ??
              detail.tags.event_type ??
              "operator audit"}
          </p>
          <div className="evidence-metrics">
            <div>
              <small>Validation F1</small>
              <strong>{score(detail.metrics.validation_window_f1)}</strong>
            </div>
            <div>
              <small>Recall</small>
              <strong>
                {percentage(detail.metrics.validation_window_recall)}
              </strong>
            </div>
            <div>
              <small>False positives</small>
              <strong>
                {detail.metrics.validation_false_positives ?? "—"}
              </strong>
            </div>
          </div>
          <h3>Training parameters</h3>
          <dl className="model-facts">
            {Object.entries(detail.parameters).map(([key, value]) => (
              <div key={key}>
                <dt>{key.replaceAll("_", " ")}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
          <h3>Lineage & artifacts</h3>
          {Object.entries(detail.artifacts).map(([name, artifact]) => (
            <details key={name}>
              <summary>{name.replaceAll("_", " ")}</summary>
              <pre>{JSON.stringify(artifact, null, 2)}</pre>
            </details>
          ))}
          <details>
            <summary>Run provenance</summary>
            <pre>
              {JSON.stringify(
                {
                  feature_version: detail.tags.feature_version,
                  validation_digest: detail.tags.validation_digest,
                  parent_run_id: detail.tags.parent_run_id,
                  code_sha256: detail.tags.code_sha256,
                  test_status: detail.tags.test_status,
                },
                null,
                2,
              )}
            </pre>
          </details>
        </Modal>
      )}
    </div>
  );
}
