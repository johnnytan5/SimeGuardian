import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Icon } from "./ui";
import { DemoFlow } from "./DemoFlow";
import { Link } from "react-router-dom";
import { formatSignal, townshipRanges, usageColors, usagePattern, type AnomalyDemoState, type SignalSample, type TownshipRange, type townshipWindow } from "./signalSimulation";
import { demoPlots, landmarks, mappedBuildingCount, googleSatelliteUrl, validateGeography, townshipReferences, type Utility } from "./townshipLayout";
import type { createTownshipScene } from "./townshipScene";
import "./township.css";

type View = "3d" | "top" | "plan";
type Scene = ReturnType<typeof createTownshipScene>;
const stamp = new Intl.DateTimeFormat("en-MY", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Kuala_Lumpur" });
const concernColor = "#bd334d";
const hour = new Intl.DateTimeFormat("en-MY", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Kuala_Lumpur" });
const day = new Intl.DateTimeFormat("en-MY", { day: "numeric", month: "short", timeZone: "Asia/Kuala_Lumpur" });

function Pattern({ points, utility, id, from }: { points: SignalSample[]; utility: Utility; id: string; from?: number }) {
  const pattern = usagePattern(points, utility);
  const peak = Math.max(0.001, ...points.map((p) => p[utility]));
  return <svg className="map-pattern" viewBox="0 0 160 42" role="img" aria-label={`${id} ${utility} usage pattern, oldest to newest`}>
    <polyline points={points.map((p, i) => `${i / Math.max(1, points.length - 1) * 158 + 1},${28 - p[utility] / peak * 26}`).join(" ")} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    {points.map((p, i) => <rect key={i} x={i / points.length * 160} y="34" width={160 / points.length - 0.7} height="8" fill={usageColors[pattern.bands[i]]} stroke={from !== undefined && p.at >= from ? concernColor : "none"} strokeWidth="1.5">
      <title>{stamp.format(p.at)} MYT · {formatSignal(utility, p[utility])} {utility === "water" ? "L" : "kWh"}{from !== undefined && p.at >= from ? " · demo anomaly window" : ""}</title>
    </rect>)}
  </svg>;
}

export function TownshipExplorer({ window: usage, range, onRange, signal, onSignal, household, onHousehold, paused, onPause, anomaly, demo, onStartDemo, onClearDemo }: {
  window: ReturnType<typeof townshipWindow>;
  range: TownshipRange;
  onRange: (value: TownshipRange) => void;
  signal: string;
  onSignal: (value: string) => void;
  household: string;
  onHousehold: (value: string) => void;
  paused: boolean;
  onPause: () => void;
  anomaly: AnomalyDemoState | null;
  demo: AnomalyDemoState | null;
  onStartDemo: () => void;
  onClearDemo: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const exitButton = useRef<HTMLButtonElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const labels = useRef<HTMLDivElement>(null);
  const scene = useRef<Scene | null>(null);
  const focusNext = useRef<string | null>(null);
  const select = useRef(onHousehold);
  const [view, setView] = useState<View>("top");
  const [expanded, setExpanded] = useState(true);
  const [leftOpen, setLeftOpen] = useState(() => window.innerWidth > 1000);
  const [rightOpen, setRightOpen] = useState(() => window.innerWidth > 1000);
  const [readings, setReadings] = useState(false);
  const [search, setSearch] = useState("");
  const [onlyAnomalies, setOnlyAnomalies] = useState(false);
  const [charts, setCharts] = useState({ electricity: true, water: true });
  const [ready, setReady] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const utility: Utility = signal === "water" ? "water" : "electricity";
  const homes = useMemo(() => usage.homes.map((home) => ({
    ...home, plot: demoPlots.find((plot) => plot.id === home.id),
    electricity: usagePattern(home.points, "electricity"), water: usagePattern(home.points, "water"),
  })), [usage]);
  const home = homes.find((item) => item.id === household);
  const flagged = homes.find((item) => item.id === anomaly?.household && item.plot);
  const at = usage.totals.at(-1)?.at;
  const unit = utility === "water" ? "L" : "kWh";
  const bucket = townshipRanges[range].bucketHours;
  const isModel = view !== "plan";
  const total = (key: Utility) => homes.reduce((sum, item) => sum + item[key].total, 0);
  const filtered = homes.filter((item) => (!onlyAnomalies || item.id === flagged?.id)
    && `${item.id} ${item.plot?.zone ?? ""} ${item.profile.name}`.toLowerCase().includes(search.toLowerCase().trim()));
  const togglePanel = (side: "left" | "right") => {
    if (side === "left") { setLeftOpen(!leftOpen); if (window.innerWidth <= 1000) setRightOpen(false); }
    else { setRightOpen(!rightOpen); if (window.innerWidth <= 1000) setLeftOpen(false); }
  };
  const selectHome = (id: string) => {
    onHousehold(id);
    setRightOpen(true);
    if (window.innerWidth <= 1000) setLeftOpen(false);
  };
  select.current = selectHome;
  const locate = (id: string) => {
    onHousehold(id);
    if (window.innerWidth <= 1000) { setLeftOpen(false); setRightOpen(false); }
    else setRightOpen(true);
    if (isModel) scene.current?.focus(id);
    else { focusNext.current = id; setView("top"); }
  };

  useEffect(() => {
    const element = dialog.current!;
    const overflow = document.body.style.overflow;
    element.close();
    if (expanded) { element.showModal(); document.body.style.overflow = "hidden"; }
    else element.show();
    exitButton.current?.focus({ preventScroll: true });
    return () => { element.close(); document.body.style.overflow = overflow; };
  }, [expanded]);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 1000px)");
    const change = () => { setLeftOpen(!media.matches); setRightOpen(!media.matches); };
    media.addEventListener("change", change);
    return () => media.removeEventListener("change", change);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const abort = new AbortController();
    const timeout = window.setTimeout(() => abort.abort(), 30000);
    setReady(false); setUnavailable(false);
    Promise.all([
      import("./townshipScene"),
      fetch("/township/putra-geography.json", { signal: abort.signal }).then(async (response) => {
        if (!response.ok) throw new Error("Township map could not be loaded.");
        return validateGeography(await response.json());
      }),
    ]).then(([{ createTownshipScene }, geography]) => {
      if (cancelled || !host.current || !labels.current) return;
      scene.current = createTownshipScene(host.current, labels.current, geography, (id) => select.current(id), () => setUnavailable(true));
      setReady(true);
    }).catch(() => { if (!cancelled) setUnavailable(true); }).finally(() => window.clearTimeout(timeout));
    return () => { cancelled = true; abort.abort(); window.clearTimeout(timeout); scene.current?.dispose(); scene.current = null; };
  }, [attempt]);

  useEffect(() => {
    scene.current?.update(new Map(homes.map((item) => [item.id, usageColors[item[utility].band]])), household, readings, flagged?.id);
  }, [homes, utility, household, readings, flagged, ready, leftOpen, rightOpen, expanded, charts]);

  useEffect(() => {
    if (isModel) {
      scene.current?.reset(view === "top");
      if (focusNext.current) { scene.current?.focus(focusNext.current); focusNext.current = null; }
    }
  }, [view, ready, isModel]);

  return <dialog ref={dialog} id="township-explorer" className={`township-explorer ${expanded ? "explorer-fullscreen" : ""} ${leftOpen ? "explorer-left-open" : ""} ${rightOpen ? "explorer-right-open" : ""} ${paused ? "explorer-paused" : ""}`} aria-labelledby="explorer-title"
    onCancel={(event) => { event.preventDefault(); setExpanded(false); }}>
    {expanded && <div className="explorer-flow-bar"><DemoFlow /></div>}
    <div className="explorer-content">
    <div className="explorer-viewport">
      <div className="explorer-model" hidden={!isModel || unavailable}>
        <div className="explorer-canvas" ref={host} data-ready={ready} data-view={view} />
        <div className="explorer-labels" ref={labels}>
          <svg className="explorer-leaders" aria-hidden="true">{homes.filter((item) => item.plot).map((item) => <line key={item.id} data-leader={item.id} stroke={flagged?.id === item.id ? concernColor : "#777779"} />)}</svg>
          {landmarks.map((landmark) => <span key={landmark.name} data-anchor={landmark.name} className="map-landmark">{landmark.name}</span>)}
          {homes.filter((item) => item.plot).map((item) => <button key={item.id} data-anchor={item.id} className={`map-home-label ${flagged?.id === item.id ? "map-home-concern" : ""}`}
            data-building-id={item.plot!.buildingId} data-latitude={item.plot!.point[1]} data-longitude={item.plot!.point[0]}
            title={`${item.id} rooftop · ${item.plot!.point[1].toFixed(6)}° N, ${item.plot!.point[0].toFixed(6)}° E · simulated monitoring`}
            aria-label={`Select ${item.id}: ${formatSignal("electricity", item.electricity.total)} kWh and ${formatSignal("water", item.water.total)} litres over ${townshipRanges[range].label}${flagged?.id === item.id ? ", demo anomaly detected" : ""}`}
            aria-pressed={household === item.id} onClick={() => selectHome(item.id)}>
            <span className="map-home-reading"><strong>{flagged?.id === item.id && <b aria-hidden="true">!</b>}{item.id}<small>{flagged?.id === item.id ? "ANOMALY" : unit}</small></strong>
              <Pattern points={item.points} utility={utility} id={item.id} from={flagged?.id === item.id ? anomaly?.from : undefined} />
              <span className="map-reading-total">{formatSignal(utility, item[utility].total)} {unit}<small>{townshipRanges[range].label}</small></span>
              <span className="map-roof-coordinate">{item.plot!.point[1].toFixed(6)}, {item.plot!.point[0].toFixed(6)}</span>
            </span>
            <span className="map-home-dot" style={{ background: flagged?.id === item.id ? concernColor : usageColors[item[utility].band], "--coverage-color": flagged?.id === item.id ? concernColor : usageColors[item[utility].band], "--pulse-delay": `${-(Number(item.id.slice(3)) % 12) * 0.23}s` } as CSSProperties}>{flagged?.id === item.id ? "!" : ""}</span>
          </button>)}
        </div>
        {!ready && <div className="explorer-loading" role="status">
          <div className="explorer-loading-card">
            <div className="explorer-loading-mark" aria-hidden="true"><img src="/brand/sime-darby-property.png" alt="" width={250} height={189} /></div>
            <strong>Building the township…</strong>
            <span>Preparing your 3D map</span>
          </div>
        </div>}
      </div>
      {isModel && unavailable && <div className="explorer-fallback" role="status"><img src={townshipReferences[0].image} alt="Official illustrated map of Putra Heights" /><strong>The 3D view could not be loaded.</strong><p>Household readings and the 2D map are still available.</p><button className="button secondary" onClick={() => setAttempt((value) => value + 1)}>Retry 3D view</button></div>}
      {!isModel && <figure className="explorer-reference"><img src={townshipReferences[0].image} alt="Township map" /><figcaption>Official illustrated map · <a href={townshipReferences[0].url} target="_blank" rel="noreferrer">Sime Darby Property ↗</a></figcaption></figure>}
    </div>

    <header className="explorer-heading" data-map-obstacle>
      <div className="explorer-brand"><img src="/brand/sime-darby-property.png" alt="Sime Darby Property" /><span>SimeGuardian<small>TOWNSHIP OPERATIONS</small></span></div>
      <div className="explorer-toolbar">
        <div className="explorer-layers" role="group" aria-label="3D utility layer"><button aria-pressed={utility === "electricity"} onClick={() => onSignal("electricity")}><span aria-hidden="true">ϟ</span> Electricity</button><button aria-pressed={utility === "water"} onClick={() => onSignal("water")}><span aria-hidden="true">◈</span> Water</button></div>
        <label className="explorer-period"><Icon name="clock" size={14} /><span className="sr-only">History window</span><select aria-label="3D usage period" value={range} onChange={(event) => onRange(event.target.value as TownshipRange)}>{Object.entries(townshipRanges).map(([key, value]) => <option key={key} value={key}>{value.label}</option>)}</select></label>
      </div>
      <div className="explorer-header-actions">
        <button aria-label="Household list" aria-expanded={leftOpen} aria-controls="explorer-households-panel" onClick={() => togglePanel("left")}><Icon name="layers" size={15} /><span>Households</span></button>
        <button aria-label="Household inspector" aria-expanded={rightOpen} aria-controls="explorer-inspector-panel" onClick={() => togglePanel("right")}><Icon name="grid" size={15} /><span>Inspector</span></button>
        <button ref={exitButton} onClick={() => setExpanded(!expanded)} aria-label={expanded ? "Exit fullscreen map" : "Expand map fullscreen"}><Icon name={expanded ? "close" : "arrow"} size={16} /><span>{expanded ? "Overview" : "Fullscreen"}</span></button>
      </div>
    </header>

    <section className="explorer-summary" aria-label="Township summary" data-map-obstacle>
      <div className="explorer-township-title"><span className="eyebrow">SELANGOR · MALAYSIA</span><h2 id="explorer-title">Putra Heights</h2><p>Township utility monitoring <span className="explorer-demo-tag">SIMULATED DATA</span></p></div>
      <dl className="explorer-kpis">
        <div><dt>Monitored homes</dt><dd>{homes.filter((item) => item.plot).length.toString().padStart(2, "0")}<Icon name="grid" size={16} /></dd><small>{mappedBuildingCount.toLocaleString()} mapped buildings</small></div>
        <div className={flagged ? "has-anomaly" : ""}><dt>Detected anomalies</dt><dd>{flagged ? "01" : "00"}<Icon name="shield" size={16} /></dd><small>{flagged ? `${flagged.id} · demo concern` : "Demo detection rule"}</small></div>
        <div><dt>Electricity <span>· {townshipRanges[range].label}</span></dt><dd data-testid="map-total-electricity">{homes.length ? formatSignal("electricity", total("electricity")) : "—"}<small>kWh</small></dd><small>All monitored households</small></div>
        <div><dt>Water <span>· {townshipRanges[range].label}</span></dt><dd data-testid="map-total-water">{homes.length ? formatSignal("water", total("water")) : "—"}<small>L</small></dd><small>All monitored households</small></div>
      </dl>
    </section>

    <div className="explorer-map-options" data-map-obstacle>
      <div className="explorer-view-switch" role="group" aria-label="Township view">{([["top", "Top view"], ["3d", "3D model"], ["plan", "2D map"]] as const).map(([key, name]) => <button key={key} aria-pressed={view === key} onClick={() => setView(key)}>{name}</button>)}</div>
      <label className="explorer-annotations"><input type="checkbox" checked={readings} onChange={(event) => setReadings(event.target.checked)} /> Show all patterns</label>
      <details className="explorer-legend"><summary>Legend</summary><div className="explorer-legend-content" data-map-obstacle><strong>Usage relative to each home’s average</strong><div className="explorer-color-scale" aria-hidden="true">{usageColors.map((color) => <i key={color} style={{ background: color }} />)}</div><div className="explorer-legend-labels">{["<0.5×", "0.5–1×", "1–1.5×", "1.5–2×", "≥2×"].map((text) => <span key={text}>{text}</span>)}</div><p>Roofs & dots: latest {bucket === 1 ? "hour" : `${bucket} hours`}. Strips: oldest → newest.<br />Pulsing dots = simulated household monitoring. Hover or select for rooftop coordinates.<br /><b className="explorer-anomaly-key">! Red outline = detected demo anomaly.</b><br />High or low usage alone is not an anomaly. Unmarked buildings have no readings.</p></div></details>
    </div>

    <aside id="explorer-households-panel" className="explorer-float explorer-left" aria-label="Household monitoring" hidden={!leftOpen} data-map-obstacle>
      <div className="explorer-panel-title"><strong>Household operations</strong><span className="explorer-count">{homes.length}</span></div>
      <label className="explorer-search"><span className="sr-only">Search mapped households</span><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><circle cx="10" cy="10" r="6" /><path d="m15 15 5 5" /></svg><input type="search" placeholder="Search household or neighbourhood" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
      <div className="explorer-house-filters" role="group" aria-label="Filter mapped households"><button aria-pressed={!onlyAnomalies} onClick={() => setOnlyAnomalies(false)}>All <span>{homes.length}</span></button><button aria-pressed={onlyAnomalies} onClick={() => setOnlyAnomalies(true)}>Anomalies <span>{flagged ? 1 : 0}</span></button></div>
      <div className={`explorer-alert-summary ${flagged ? "has-anomaly" : ""}`} role="status" aria-live="polite"><strong>{flagged ? "1 demo anomaly located" : "No detected demo anomalies"}</strong>
        {flagged && <button onClick={() => locate(flagged.id)} disabled={!ready || unavailable}>Locate anomaly <Icon name="arrow" size={13} /></button>}
      </div>
      <div className="explorer-house-list" role="group" aria-label="Mapped household readings">
        {filtered.map((item) => <button key={item.id} className={`explorer-house-row ${flagged?.id === item.id ? "has-anomaly" : ""}`} aria-label={`Locate ${item.id}`} onClick={() => locate(item.id)} aria-current={item.id === household ? "true" : undefined}>
          <span className="explorer-house-row-title"><span className="explorer-house-symbol"><Icon name="grid" size={17} /></span><strong>{item.id}<small>{item.plot?.zone ?? "Unmapped household"}</small></strong><span className="explorer-row-state">{flagged?.id === item.id ? "! Anomaly" : "No flag"}</span></span>
          <span className="explorer-row-readings"><span>ϟ {formatSignal("electricity", item.electricity.total)} <small>kWh</small></span><span>◈ {formatSignal("water", item.water.total)} <small>L</small></span></span>
        </button>)}
        {!filtered.length && <p className="explorer-empty">{onlyAnomalies ? "No detected anomalies match this search." : "No households match your search."}</p>}
      </div>
      <div className="explorer-list-footer">{filtered.length} of {homes.length} households <span>{townshipRanges[range].label} totals</span></div>
      <p className="explorer-source-note">Demo meters on mapped footprints. Heights and façades are estimated.</p>
    </aside>

    <aside id="explorer-inspector-panel" className="explorer-float explorer-inspector" aria-label="Selected home utilities" hidden={!rightOpen} data-map-obstacle>
      <div className="explorer-panel-title"><strong>Household inspector</strong><span className="explorer-demo-tag">DEMO</span></div>
      <label className="sr-only" htmlFor="explorer-household">3D household</label><select id="explorer-household" value={household} onChange={(event) => onHousehold(event.target.value)} disabled={!homes.length}>{homes.map((item) => <option key={item.id} value={item.id}>{item.id}</option>)}</select>
      <p className="explorer-home-location">{home?.plot?.zone ?? "No mapped plot"}<span>{home?.profile.name ?? "No household readings available"}</span></p>
      {home?.plot && <div className="explorer-coordinates"><span>ROOFTOP COORDINATE · WGS84</span><strong data-testid="roof-coordinate">{home.plot.point[1].toFixed(6)}° N · {home.plot.point[0].toFixed(6)}° E</strong><small>Mapped footprint <a href={`https://www.openstreetmap.org/way/${home.plot.buildingId}`} target="_blank" rel="noreferrer">#{home.plot.buildingId} ↗</a><br />Estimated roof · synthetic household ID</small></div>}
      <div className={`explorer-home-status ${flagged?.id === household ? "has-anomaly" : ""}`}>{flagged?.id === household ? "! Demo anomaly detected" : demo?.household === household ? "Demo comparison in progress" : home ? "No detected demo anomaly" : "No readings available"}</div>
      <span className="explorer-field-label">TOTAL OVER {townshipRanges[range].label.toUpperCase()}</span>
      <dl className="explorer-home-usage"><div><dt>ϟ Electricity</dt><dd data-testid="home-electricity">{home ? formatSignal("electricity", home.electricity.total) : "—"}<small> kWh</small></dd></div><div><dt>◈ Water</dt><dd data-testid="home-water">{home ? formatSignal("water", home.water.total) : "—"}<small> litres</small></dd></div></dl>
      {home && <div className="explorer-selected-pattern"><div><strong>{utility === "water" ? "Water" : "Electricity"} pattern</strong><span>{bucket === 1 ? "Hourly" : `${bucket}-hour`} bins</span></div><Pattern points={home.points} utility={utility} id={home.id} from={flagged?.id === home.id ? anomaly?.from : undefined} /><p>Latest: {home[utility].latest === null ? "—" : `${formatSignal(utility, home[utility].latest)} ${unit}`}<span>{home[utility].average > 0 ? `${((home[utility].latest ?? 0) / home[utility].average).toFixed(2)}× average` : "No comparison"}</span></p></div>}
      <button className="button secondary explorer-wide" disabled={!ready || unavailable || !home?.plot} onClick={() => locate(household)}>Locate this home <Icon name="arrow" size={14} /></button>
      <div className="explorer-demo-controls"><span className="explorer-field-label">TEST AN ANOMALY AT THIS HOME</span><p>{demo ? ["Comparing the usual pattern", "Usage drops", "Cross-checking activity", "Demo comparison complete"][Math.min(3, Math.floor(demo.step / 3))] : "Preview how a corroborated usage drop appears on the map."}</p><button className="button secondary explorer-wide" onClick={onStartDemo} disabled={!home || !!demo && demo.step < 9}>{demo && demo.step < 9 ? "Map demo in progress" : "Run map anomaly demo"}</button>{demo && <button className="text-button" onClick={onClearDemo}>Clear map demo</button>}</div>
      <Link className="text-button explorer-detail-link" to="/pipeline#household-signals">Inspect all six signals →</Link>
    </aside>

    <section className="explorer-trends" aria-label="Township utility trends">
      {(["electricity", "water"] as const).map((key) => <article key={key} className={`explorer-trend-card ${charts[key] ? "" : "trend-collapsed"}`} data-map-obstacle>
        <div className="explorer-trend-heading"><h3>{key === "water" ? "Water consumption" : "Electricity consumption"}</h3><button aria-label={`${charts[key] ? "Collapse" : "Expand"} ${key} chart`} aria-expanded={charts[key]} aria-controls={`map-${key}-chart`} onClick={() => setCharts({ ...charts, [key]: !charts[key] })}>{charts[key] ? "−" : "+"}</button></div>
        <div className="explorer-trend-total"><strong data-testid={`chart-total-${key}`}>{homes.length ? formatSignal(key, total(key)) : "—"} <small>{key === "water" ? "L" : "kWh"}</small></strong><span>{townshipRanges[range].label} · {homes.length} homes</span></div>
        <div id={`map-${key}-chart`} hidden={!charts[key]}>
          {usage.totals.length ? <div className="explorer-trend-chart" role="img" aria-label={`Township ${key} trend, ${key === "water" ? "litres" : "kWh"} per ${bucket} hours, across all ${homes.length} households`}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={usage.totals} margin={{ top: 6, right: 4, left: -15, bottom: 0 }}>
                <defs><linearGradient id={`map-trend-${key}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={key === "water" ? "#398798" : "#d71920"} stopOpacity={0.2} /><stop offset="100%" stopColor={key === "water" ? "#398798" : "#d71920"} stopOpacity={0} /></linearGradient></defs>
                <CartesianGrid vertical={false} stroke="#dedee2" strokeDasharray="2 4" />
                <XAxis dataKey="at" type="number" domain={["dataMin", "dataMax"]} tickFormatter={(value) => (range === "day" ? hour : day).format(value)} tickCount={4} minTickGap={25} axisLine={false} tickLine={false} tick={{ fill: "#737377", fontSize: 9 }} />
                <YAxis domain={[0, "auto"]} width={46} tickCount={3} axisLine={false} tickLine={false} tickFormatter={(value) => Intl.NumberFormat("en", { notation: "compact" }).format(value)} tick={{ fill: "#737377", fontSize: 9 }} />
                <Tooltip labelFormatter={(label) => `${stamp.format(Number(label) - bucket * 3_600_000)} — ${stamp.format(Number(label))} MYT`} formatter={(value) => [`${formatSignal(key, Number(value))} ${key === "water" ? "L" : "kWh"}`, "All homes"]} contentStyle={{ borderRadius: 12, border: "1px solid #e1e1e1", fontSize: 11 }} />
                <Area dataKey={key} type="monotone" stroke={key === "water" ? "#398798" : "#d71920"} strokeWidth={1.8} fill={`url(#map-trend-${key})`} isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div> : <p className="explorer-empty">No household readings available.</p>}
          <p className="explorer-trend-note">{key === "water" ? "Litres" : "kWh"} per {bucket === 1 ? "hour" : `${bucket} hours`} · MYT</p>
        </div>
      </article>)}
    </section>

    <div className="explorer-map-tools" role="group" aria-label="Map camera controls" data-map-obstacle><span aria-label={view === "top" ? "North points right" : undefined}>{view === "top" ? "N →" : view === "3d" ? "3D" : "2D"}</span><button aria-label="Zoom in" disabled={!isModel || !ready || unavailable} onClick={() => scene.current?.zoom(0.75)}>+</button><button aria-label="Zoom out" disabled={!isModel || !ready || unavailable} onClick={() => scene.current?.zoom(1.3)}>−</button><button aria-label="Reset township camera" disabled={!isModel || !ready || unavailable} onClick={() => scene.current?.reset(view === "top")}><Icon name="refresh" size={15} /></button></div>
    <div className="explorer-map-status" data-map-obstacle><button onClick={onPause} aria-label={paused ? "Resume map simulation" : "Pause map simulation"}><i className={paused ? "paused" : ""} />{paused ? "Resume" : "Pause"}</button><time aria-label="Map simulation time" dateTime={at ? new Date(at).toISOString() : undefined}>{at ? stamp.format(at) : "—"} MYT</time><small>{view === "top" ? "Drag to pan" : view === "3d" ? "Drag to orbit" : "Official township map"}{isModel ? " · scroll to zoom" : ""}</small></div>
    <footer className="explorer-provenance"><span>© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> · <a href="https://github.com/tilezen/joerd/blob/master/docs/attribution.md" target="_blank" rel="noreferrer">Mapzen / USGS</a> · <a href="/township/SOURCES.md" target="_blank" rel="noreferrer">Sources</a></span><span><a href={googleSatelliteUrl} target="_blank" rel="noreferrer">Google satellite ↗</a>{townshipReferences.slice(1).map((ref) => <a key={ref.id} href={ref.image} target="_blank" rel="noreferrer">{ref.name} ↗</a>)}</span></footer>
    </div>
  </dialog>;
}
