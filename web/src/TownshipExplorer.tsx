import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "./ui";
import { formatSignal, townshipRanges, usageColors, usagePattern, type AnomalyDemoState, type SignalSample, type TownshipRange, type townshipWindow } from "./signalSimulation";
import { demoPlots, landmarks, mappedBuildingCount, googleSatelliteUrl, validateGeography, townshipReferences, type Utility } from "./townshipLayout";
import type { createTownshipScene } from "./townshipScene";
import "./township.css";

type View = "3d" | "top" | "plan";
type Scene = ReturnType<typeof createTownshipScene>;
const stamp = new Intl.DateTimeFormat("en-MY", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Kuala_Lumpur" });
const concernColor = "#bd334d";

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
  const inspectNext = useRef(false);
  const host = useRef<HTMLDivElement>(null);
  const labels = useRef<HTMLDivElement>(null);
  const scene = useRef<Scene | null>(null);
  const focusNext = useRef<string | null>(null);
  const select = useRef(onHousehold);
  select.current = onHousehold;
  const [view, setView] = useState<View>("top");
  const [expanded, setExpanded] = useState(true);
  const [leftOpen, setLeftOpen] = useState(() => window.innerWidth > 760);
  const [rightOpen, setRightOpen] = useState(() => window.innerWidth > 760);
  const [readings, setReadings] = useState(true);
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
  const togglePanel = (side: "left" | "right") => {
    if (side === "left") { setLeftOpen(!leftOpen); if (window.innerWidth <= 760) setRightOpen(false); }
    else { setRightOpen(!rightOpen); if (window.innerWidth <= 760) setLeftOpen(false); }
  };
  const locate = (id: string) => {
    onHousehold(id);
    if (window.innerWidth <= 760) { setLeftOpen(false); setRightOpen(false); }
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
    if (!expanded && inspectNext.current) {
      inspectNext.current = false;
      document.getElementById("household-signals")?.scrollIntoView({ block: "start" });
    }
    return () => { element.close(); document.body.style.overflow = overflow; };
  }, [expanded]);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 760px)");
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
  }, [homes, utility, household, readings, flagged, ready, leftOpen, rightOpen, expanded]);

  useEffect(() => {
    if (isModel) {
      scene.current?.reset(view === "top");
      if (focusNext.current) { scene.current?.focus(focusNext.current); focusNext.current = null; }
    }
  }, [view, ready, isModel]);

  return <dialog ref={dialog} id="township-explorer" className={`township-explorer ${expanded ? "explorer-fullscreen" : ""}`} aria-labelledby="explorer-title"
    onCancel={(event) => { event.preventDefault(); setExpanded(false); }}>
    <div className="explorer-viewport">
      <div className="explorer-model" hidden={!isModel || unavailable}>
        <div className="explorer-canvas" ref={host} data-ready={ready} data-view={view} />
        <div className="explorer-labels" ref={labels}>
          <svg className="explorer-leaders" aria-hidden="true">{homes.filter((item) => item.plot).map((item) => <line key={item.id} data-leader={item.id} stroke={flagged?.id === item.id ? concernColor : "#49665b"} />)}</svg>
          {landmarks.map((landmark) => <span key={landmark.name} data-anchor={landmark.name} className="map-landmark">{landmark.name}</span>)}
          {homes.filter((item) => item.plot).map((item) => <button key={item.id} data-anchor={item.id} className={`map-home-label ${flagged?.id === item.id ? "map-home-concern" : ""}`}
            aria-label={`Select ${item.id}: ${formatSignal("electricity", item.electricity.total)} kWh and ${formatSignal("water", item.water.total)} litres over ${townshipRanges[range].label}${flagged?.id === item.id ? ", demo anomaly detected" : ""}`}
            aria-pressed={household === item.id} onClick={() => onHousehold(item.id)}>
            <span className="map-home-reading"><strong>{flagged?.id === item.id && <b aria-hidden="true">!</b>}{item.id}<small>{flagged?.id === item.id ? "ANOMALY" : unit}</small></strong>
              <Pattern points={item.points} utility={utility} id={item.id} from={flagged?.id === item.id ? anomaly?.from : undefined} />
              <span className="map-reading-total">{formatSignal(utility, item[utility].total)} {unit}<small>{townshipRanges[range].label}</small></span>
            </span>
            <span className="map-home-dot" style={{ background: flagged?.id === item.id ? concernColor : usageColors[item[utility].band] }}>{flagged?.id === item.id ? "!" : ""}</span>
          </button>)}
        </div>
        {!ready && <div className="explorer-loading" role="status">Building the township…</div>}
      </div>
      {isModel && unavailable && <div className="explorer-fallback" role="status"><img src={townshipReferences[0].image} alt="Official illustrated map of Putra Heights" /><strong>The 3D view could not be loaded.</strong><p>Household readings and the 2D map are still available.</p><button className="button secondary" onClick={() => setAttempt((value) => value + 1)}>Retry 3D view</button></div>}
      {!isModel && <figure className="explorer-reference"><img src={townshipReferences[0].image} alt="Township map" /><figcaption>Official illustrated map · <a href={townshipReferences[0].url} target="_blank" rel="noreferrer">Sime Darby Property ↗</a></figcaption></figure>}
    </div>

    <header className="explorer-heading">
      <div><span className="eyebrow">SIMEGUARDIAN · SPATIAL MONITORING</span><h2 id="explorer-title">Putra Heights<span>Utility watch</span></h2></div>
      <div className="explorer-header-actions">
        <button aria-label="Map layers" aria-expanded={leftOpen} aria-controls="explorer-layers-panel" onClick={() => togglePanel("left")}><Icon name="layers" size={15} /><span>Layers</span></button>
        <button aria-label="Household inspector" aria-expanded={rightOpen} aria-controls="explorer-inspector-panel" onClick={() => togglePanel("right")}><Icon name="grid" size={15} /><span>Inspector</span></button>
        <button ref={exitButton} onClick={() => setExpanded(!expanded)} aria-label={expanded ? "Exit fullscreen map" : "Expand map fullscreen"}><Icon name={expanded ? "close" : "arrow"} size={16} /><span>{expanded ? "Dashboard" : "Fullscreen"}</span></button>
      </div>
    </header>

    <aside id="explorer-layers-panel" className="explorer-float explorer-left" aria-label="Map layers and monitoring" hidden={!leftOpen}>
      <div className="explorer-panel-title"><strong>Township overview</strong><span className="explorer-demo-tag">DEMO</span></div>
      <div className="explorer-coverage"><strong>{homes.filter((item) => item.plot).length}</strong><span>homes with readings<small>{mappedBuildingCount.toLocaleString()} mapped buildings</small></span></div>
      <div className={`explorer-alert-summary ${flagged ? "has-anomaly" : ""}`} role="status" aria-live="polite"><strong>{flagged ? "1 demo anomaly located" : "No detected demo anomalies"}</strong><p>{flagged ? `${flagged.id} · ${flagged.plot?.zone}` : "Markers turn red when the demo detection rule is satisfied."}</p>
        {flagged && <button onClick={() => locate(flagged.id)} disabled={!ready || unavailable}>Locate anomaly <Icon name="arrow" size={13} /></button>}
      </div>
      <span className="explorer-field-label">UTILITY LAYER</span>
      <div className="explorer-layers" role="group" aria-label="3D utility layer"><button aria-pressed={utility === "electricity"} onClick={() => onSignal("electricity")}><span aria-hidden="true">ϟ</span> Electricity</button><button aria-pressed={utility === "water"} onClick={() => onSignal("water")}><span aria-hidden="true">◈</span> Water</button></div>
      <label className="explorer-period">History window<select aria-label="3D usage period" value={range} onChange={(event) => onRange(event.target.value as TownshipRange)}>{Object.entries(townshipRanges).map(([key, value]) => <option key={key} value={key}>{value.label}</option>)}</select></label>
      <div className="explorer-view-switch" role="group" aria-label="Township view">{([["top", "Top view"], ["3d", "3D model"], ["plan", "2D map"]] as const).map(([key, name]) => <button key={key} aria-pressed={view === key} onClick={() => setView(key)}>{name}</button>)}</div>
      <label className="explorer-annotations"><input type="checkbox" checked={readings} onChange={(event) => setReadings(event.target.checked)} /> Household patterns</label>
      <div className="explorer-legend"><strong>Usage relative to each home’s average</strong><div className="explorer-color-scale" aria-hidden="true">{usageColors.map((color) => <i key={color} style={{ background: color }} />)}</div><div className="explorer-legend-labels">{["<0.5×", "0.5–1×", "1–1.5×", "1.5–2×", "≥2×"].map((text) => <span key={text}>{text}</span>)}</div><p>Roofs & dots: latest {bucket === 1 ? "hour" : `${bucket} hours`}. Strips: oldest → newest.<br /><b className="explorer-anomaly-key">! Red outline = detected demo anomaly.</b><br />High or low usage alone is not an anomaly. Unmarked buildings have no readings.</p></div>
      <div className="explorer-totals"><div><span>ELECTRICITY</span><strong>{formatSignal("electricity", total("electricity"))}<small> kWh</small></strong></div><div><span>WATER</span><strong>{formatSignal("water", total("water"))}<small> L</small></strong></div></div>
      <button className="button secondary explorer-wide" onClick={onPause}>{paused ? "Resume map simulation" : "Pause map simulation"}</button>
      <p className="explorer-source-note">Buildings & terrain are geographic; heights and façades are estimated. All usage is simulated.</p>
    </aside>

    <aside id="explorer-inspector-panel" className="explorer-float explorer-inspector" aria-label="Selected home utilities" hidden={!rightOpen}>
      <div className="explorer-panel-title"><strong>Household inspector</strong><span className="explorer-demo-tag">DEMO</span></div>
      <label className="sr-only" htmlFor="explorer-household">3D household</label><select id="explorer-household" value={household} onChange={(event) => onHousehold(event.target.value)} disabled={!homes.length}>{homes.map((item) => <option key={item.id} value={item.id}>{item.id}</option>)}</select>
      <p className="explorer-home-location">{home?.plot?.zone ?? "No mapped plot"}<span>{home?.profile.name ?? "No household readings available"}</span></p>
      {home?.plot && <p className="explorer-coordinates">{home.plot.point[1].toFixed(5)}° N · {home.plot.point[0].toFixed(5)}° E<small>Mapped footprint · synthetic household ID</small></p>}
      <div className={`explorer-home-status ${flagged?.id === household ? "has-anomaly" : ""}`}>{flagged?.id === household ? "! Demo anomaly detected" : demo?.household === household ? "Demo comparison in progress" : home ? "No detected demo anomaly" : "No readings available"}</div>
      <span className="explorer-field-label">TOTAL OVER {townshipRanges[range].label.toUpperCase()}</span>
      <dl className="explorer-home-usage"><div><dt>ϟ Electricity</dt><dd data-testid="home-electricity">{home ? formatSignal("electricity", home.electricity.total) : "—"}<small> kWh</small></dd></div><div><dt>◈ Water</dt><dd data-testid="home-water">{home ? formatSignal("water", home.water.total) : "—"}<small> litres</small></dd></div></dl>
      {home && <div className="explorer-selected-pattern"><div><strong>{utility === "water" ? "Water" : "Electricity"} pattern</strong><span>{bucket === 1 ? "Hourly" : `${bucket}-hour`} bins</span></div><Pattern points={home.points} utility={utility} id={home.id} from={flagged?.id === home.id ? anomaly?.from : undefined} /><p>Latest: {home[utility].latest === null ? "—" : `${formatSignal(utility, home[utility].latest)} ${unit}`}<span>{home[utility].average > 0 ? `${((home[utility].latest ?? 0) / home[utility].average).toFixed(2)}× average` : "No comparison"}</span></p></div>}
      <button className="button secondary explorer-wide" disabled={!ready || unavailable || !home?.plot} onClick={() => locate(household)}>Locate this home <Icon name="arrow" size={14} /></button>
      <details className="explorer-homes"><summary>All {homes.length} household readings</summary><div role="group" aria-label="Mapped household readings">{homes.map((item) => <button key={item.id} aria-label={`Locate ${item.id}`} onClick={() => locate(item.id)} aria-current={item.id === household ? "true" : undefined}><strong>{item.id}{flagged?.id === item.id ? " !" : ""}</strong><span>{formatSignal("electricity", item.electricity.total)} kWh<br />{formatSignal("water", item.water.total)} L</span></button>)}</div></details>
      <div className="explorer-demo-controls"><span className="explorer-field-label">TEST AN ANOMALY AT THIS HOME</span><p>{demo ? ["Comparing the usual pattern", "Usage drops", "Cross-checking activity", "Demo comparison complete"][Math.min(3, Math.floor(demo.step / 3))] : "Preview how a corroborated usage drop appears on the map."}</p><button className="button secondary explorer-wide" onClick={onStartDemo} disabled={!home || !!demo && demo.step < 9}>{demo && demo.step < 9 ? "Map demo in progress" : "Run map anomaly demo"}</button>{demo && <button className="text-button" onClick={onClearDemo}>Clear map demo</button>}</div>
      <button className="text-button explorer-detail-link" onClick={() => { if (expanded) { inspectNext.current = true; setExpanded(false); } else document.getElementById("household-signals")?.scrollIntoView({ block: "start" }); }}>Inspect all six signals ↓</button>
    </aside>

    <div className="explorer-map-tools" role="group" aria-label="Map camera controls"><button aria-label="Zoom in" onClick={() => scene.current?.zoom(0.75)}>+</button><button aria-label="Zoom out" onClick={() => scene.current?.zoom(1.3)}>−</button><button aria-label="Reset township camera" onClick={() => scene.current?.reset(view === "top")}><Icon name="refresh" size={15} /></button></div>
    <div className="explorer-map-status"><i className={paused ? "paused" : ""} />{paused ? "Paused" : "Simulating"}<time aria-label="Map simulation time" dateTime={at ? new Date(at).toISOString() : undefined}>{at ? stamp.format(at) : "—"} MYT</time><small>{view === "top" ? "N ↑ · Drag to pan" : "Drag to orbit"} · scroll to zoom</small></div>
    <footer className="explorer-provenance"><span>© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> · <a href="https://github.com/tilezen/joerd/blob/master/docs/attribution.md" target="_blank" rel="noreferrer">Mapzen / USGS</a> · <a href="/township/SOURCES.md" target="_blank" rel="noreferrer">Sources</a></span><span><a href={googleSatelliteUrl} target="_blank" rel="noreferrer">Google satellite ↗</a>{townshipReferences.slice(1).map((ref) => <a key={ref.id} href={ref.image} target="_blank" rel="noreferrer">{ref.name} ↗</a>)}</span></footer>
  </dialog>;
}
