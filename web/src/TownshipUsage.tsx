import { useState, type CSSProperties } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Badge } from "./ui";
import { formatSignal, townshipRanges, type AnomalyDemoState, type TownshipRange, type townshipWindow } from "./signalSimulation";

const hourFormat = new Intl.DateTimeFormat("en-MY", {
  hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Kuala_Lumpur",
});
const dayFormat = new Intl.DateTimeFormat("en-MY", {
  day: "numeric", month: "short", timeZone: "Asia/Kuala_Lumpur",
});
const stampFormat = new Intl.DateTimeFormat("en-MY", {
  day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kuala_Lumpur",
});

export function TownshipUsage({
  window, range, onRange, sources, signal, onSignal, household, onHousehold,
  paused, onPause, reducedMotion, anomaly,
}: {
  window: ReturnType<typeof townshipWindow>;
  range: TownshipRange;
  onRange: (range: TownshipRange) => void;
  sources: { id: string; name: string; unit: string }[];
  signal: string;
  onSignal: (signal: string) => void;
  household: string;
  onHousehold: (household: string) => void;
  paused: boolean;
  onPause: () => void;
  reducedMotion: boolean;
  anomaly: AnomalyDemoState | null;
}) {
  const [search, setSearch] = useState("");
  const { homes, totals } = window;
  const source = sources.find((item) => item.id === signal)!;
  const unit = source.unit === "event" ? "events" : source.unit;
  const { hours, bucketHours } = townshipRanges[range];
  const total = totals.reduce((sum, point) => sum + point[signal], 0);
  const average = homes.length ? total / homes.length : 0;
  const at = totals.at(-1)?.at ?? 0;
  const tick = (value: number) => (range === "day" ? hourFormat : dayFormat).format(value);
  const filtered = homes.filter((home) => `${home.id} ${home.profile.name}`.toLowerCase().includes(search.toLowerCase().trim()));

  return (
    <>
      <section className="panel township-panel" aria-labelledby="township-title">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">THE WHOLE TOWNSHIP</span>
            <h2 id="township-title">Township usage overview</h2>
            <p>{homes.length} simulated homes, each with its own daily rhythm and usage level.</p>
          </div>
          <div className="signal-controls">
            <Badge tone={anomaly ? "red" : "purple"}>{anomaly ? "Demo concern" : paused ? "Paused" : "Simulating"}</Badge>
            <button className="button secondary" onClick={onPause}>
              {paused ? "Resume simulation" : "Pause simulation"}
            </button>
          </div>
        </div>
        <div className="township-toolbar">
          <label>Usage signal
            <select aria-label="Usage signal" value={signal} onChange={(event) => onSignal(event.target.value)}>
              {sources.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>
          <div className="range-switch" role="group" aria-label="Township time range">
            {Object.entries(townshipRanges).map(([key, item]) => (
              <button key={key} aria-pressed={range === key} onClick={() => onRange(key as TownshipRange)}>{item.label}</button>
            ))}
          </div>
        </div>
        <dl className="township-summary">
          <div><dt>Homes in view</dt><dd>{homes.length}<small>different household patterns</small></dd></div>
          <div><dt>{source.name} · period total</dt><dd>{formatSignal(signal, total)} <span>{unit}</span><small>across the last {townshipRanges[range].label}</small></dd></div>
          <div><dt>Average per home</dt><dd>{unit === "events" ? average.toLocaleString("en-MY", { maximumFractionDigits: 1 }) : formatSignal(signal, average)} <span>{unit}</span><small>over the same period</small></dd></div>
        </dl>
        <div className="township-chart-heading">
          <strong>{source.name} across all homes</strong>
          <span>{stampFormat.format(at - hours * 3_600_000)} — {stampFormat.format(at)} MYT</span>
        </div>
        <div className="township-chart" role="img" aria-label={`${source.name} usage across ${homes.length} simulated households over ${townshipRanges[range].label}, in ${unit} per ${bucketHours} hours.`}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={totals} margin={{ top: 20, left: 0, right: 24, bottom: 5 }}>
              <defs><linearGradient id="township-usage" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#8b5bd7" stopOpacity={0.55} />
                <stop offset="100%" stopColor="#b998eb" stopOpacity={0.05} />
              </linearGradient></defs>
              <CartesianGrid vertical={false} stroke="#eee9f6" strokeDasharray="3 5" />
              <XAxis dataKey="at" type="number" domain={["dataMin", "dataMax"]} tickFormatter={tick} tickCount={7} minTickGap={35} axisLine={false} tickLine={false} tick={{ fill: "#81778f", fontSize: 11 }} />
              <YAxis domain={[0, "auto"]} axisLine={false} tickLine={false} width={62} tickFormatter={(value) => Intl.NumberFormat("en", { notation: "compact" }).format(value)} tick={{ fill: "#81778f", fontSize: 11 }} />
              <Tooltip
                labelFormatter={(label) => `${stampFormat.format(Number(label) - bucketHours * 3_600_000)} — ${stampFormat.format(Number(label))} MYT`}
                formatter={(value) => [`${formatSignal(signal, Number(value))} ${unit}`, "Township total"]}
                contentStyle={{ borderRadius: 10, border: "1px solid #e7dff0", fontSize: 12 }}
              />
              <Area dataKey={signal} type="monotone" stroke="#8250ce" strokeWidth={2.5} fill="url(#township-usage)" isAnimationActive={!paused && !reducedMotion} animationDuration={850} animationEasing="linear" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div className="panel-footer">
          {unit} per {bucketHours === 1 ? "hour" : `${bucketHours}-hour window`} · totals include all {homes.length} homes · 15 simulated minutes / second
        </div>
      </section>

      <section className="panel household-patterns" aria-labelledby="patterns-title">
        <div className="panel-heading">
          <div>
            <h2 id="patterns-title">Household usage patterns</h2>
            <p>{source.name} · compare each home with its own average in this window. Select a row to inspect its six signals.</p>
          </div>
          <label className="search"><input aria-label="Find a household pattern" placeholder="Find a home or routine…" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
        </div>
        <div className="heatmap-key">
          <span>Less activity</span>
          {[0, 1, 2, 3, 4].map((level) => <i key={level} className={`heat-level-${level}`} aria-hidden="true" />)}
          <span>More activity</span><span>{anomaly ? "Coral = affected demo window · purple = relative usage" : "1× = this home’s average · colour indicates usage, not risk"}</span>
        </div>
        <div className="household-heatmap" role="region" aria-label="Household usage heatmap" tabIndex={0}>
          <div className="heatmap-grid" style={{ "--bins": totals.length } as CSSProperties}>
            <div className="heatmap-row heatmap-header">
              <span>HOUSEHOLD / ROUTINE</span>
              {totals.map((point, index) => <span key={index}>{index % Math.ceil(totals.length / 6) === 0 ? tick(point.at) : ""}</span>)}
              <span>PERIOD TOTAL</span>
            </div>
            {filtered.map((home) => {
              const sum = home.points.reduce((value, point) => value + point[signal], 0);
              const average = sum / home.points.length;
              return (
                <button
                  key={home.id}
                  className={`heatmap-row ${anomaly?.household === home.id ? "heatmap-flagged" : ""}`}
                  aria-pressed={household === home.id}
                  aria-label={`Inspect household ${home.id}, ${home.profile.name}, ${formatSignal(signal, sum)} ${unit} over ${townshipRanges[range].label}${anomaly?.household === home.id ? ", demo anomaly detected" : ""}`}
                  onClick={() => onHousehold(home.id)}
                >
                  <span className="heatmap-home"><strong>{home.id}</strong><small>{anomaly?.household === home.id ? "Demo anomaly detected" : home.profile.name}</small></span>
                  {home.points.map((point, index) => {
                    const ratio = average ? point[signal] / average : 0;
                    return <span key={index} className={`heatmap-cell heat-level-${Math.min(4, Math.floor(ratio * 2))} ${anomaly?.household === home.id && point.at >= anomaly.from ? "heatmap-anomaly" : ""}`} title={`${home.id} · ${stampFormat.format(point.at - bucketHours * 3_600_000)} — ${stampFormat.format(point.at)} MYT · ${formatSignal(signal, point[signal])} ${unit} · ${ratio.toFixed(1)}× this home's average`} />;
                  })}
                  <span className="heatmap-total">{formatSignal(signal, sum)}<small>{unit}</small></span>
                </button>
              );
            })}
          </div>
          {!filtered.length && <p className="empty">No households match your search.</p>}
        </div>
        <div className="panel-footer">
          <span>{filtered.length} of {homes.length} homes · {bucketHours === 1 ? "hourly" : `${bucketHours}-hour`} cells · MYT</span>
          <a className="text-button" href="#household-signals">View {household} signals ↓</a>
        </div>
      </section>
    </>
  );
}
