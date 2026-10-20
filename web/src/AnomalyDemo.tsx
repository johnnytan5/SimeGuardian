import { Link } from "react-router-dom";
import {
  Area, CartesianGrid, ComposedChart, Line, ReferenceArea,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { Badge, Icon } from "./ui";
import {
  demoAnomalyEvidence, type AnomalyDemoState, type SignalSample,
} from "./signalSimulation";

const clock = new Intl.DateTimeFormat("en-MY", {
  hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Kuala_Lumpur",
});
const steps = ["Normal routine", "Usage drops", "Cross-check signals", "Anomaly detected"];

export function AnomalyDemo({
  demo, household, expected, observed, paused, reducedMotion, onStart, onClear, onPause,
}: {
  demo: AnomalyDemoState | null;
  household: string;
  expected: SignalSample[];
  observed: SignalSample[];
  paused: boolean;
  reducedMotion: boolean;
  onStart: () => void;
  onClear: () => void;
  onPause: () => void;
}) {
  const stage = demo ? Math.min(3, Math.floor(demo.step / 3)) : 0;
  const evidence = demo ? demoAnomalyEvidence(expected, observed, demo.from) : null;
  const detected = stage === 3 && evidence?.detected;
  const running = !!demo && demo.step < 9;
  const points = expected.map((point, index) => ({
    at: point.at, expected: point.electricity, observed: observed[index].electricity,
  }));
  const percentage = (value: number | null | undefined) => value == null ? "Unavailable" : `${Math.round(value * 100)}% of usual`;

  return (
    <section className={`panel anomaly-demo ${detected ? "detected" : ""} ${running && !paused && !reducedMotion ? "animating" : ""}`} aria-labelledby="anomaly-demo-title">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">INTERACTIVE WALKTHROUGH</span>
          <h2 id="anomaly-demo-title">Anomaly detection demo</h2>
          <p>{household} · Watch a quiet household’s signals turn into a check-in concern.</p>
        </div>
        <div className="signal-controls">
          {demo && <button className="button secondary" onClick={onClear}>Clear demo</button>}
          <button className="button primary" onClick={onStart} disabled={running}>
            <Icon name="flask" size={16} />
            {running ? "Demo in progress" : demo ? "Replay anomaly demo" : "Run anomaly demo"}
          </button>
        </div>
      </div>
      {demo && (
        <>
          <ol className="anomaly-steps" aria-label="Detection stages">
            {steps.map((step, index) => (
              <li key={step} className={index < stage ? "complete" : index === stage ? "current" : ""} aria-current={index === stage ? "step" : undefined}>
                <span>{index < stage ? <Icon name="check" size={14} /> : `0${index + 1}`}</span>
                {step}
              </li>
            ))}
          </ol>
          <div className="anomaly-content">
            <div className="anomaly-comparison">
              <div className="anomaly-chart-heading">
                <strong>Electricity · kWh / hour</strong>
                <span><i /> Usual pattern <i className="observed" /> Observed</span>
              </div>
              <div className="anomaly-chart" role="img" aria-label={`${household} expected and observed electricity. The observed curve falls during the shaded demo window.`}>
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={points} margin={{ top: 15, right: 16, left: -20, bottom: 0 }}>
                    <defs><linearGradient id="anomaly-fill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#df6972" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#df6972" stopOpacity={0.02} />
                    </linearGradient></defs>
                    <CartesianGrid vertical={false} stroke="#eee9f0" strokeDasharray="3 5" />
                    <XAxis dataKey="at" type="number" domain={["dataMin", "dataMax"]} tickFormatter={(at) => clock.format(at)} tickCount={5} minTickGap={25} axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "#81778f" }} />
                    <YAxis domain={[0, "auto"]} axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "#81778f" }} width={55} />
                    {demo.step >= 3 && <ReferenceArea x1={Math.max(demo.from, points[0].at)} x2={points.at(-1)!.at} fill="#e56d76" fillOpacity={0.08} />}
                    <Tooltip labelFormatter={(at) => `${clock.format(Number(at))} MYT`} formatter={(value, name) => [`${Number(value).toFixed(2)} kWh`, name === "expected" ? "Usual pattern" : "Observed"]} contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                    <Area dataKey="observed" type="monotone" fill="url(#anomaly-fill)" stroke="#d8626e" strokeWidth={2.5} isAnimationActive={!paused && !reducedMotion} animationDuration={850} animationEasing="linear" />
                    <Line dataKey="expected" type="monotone" stroke="#9875ce" strokeDasharray="5 4" strokeWidth={1.8} dot={false} isAnimationActive={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
              <div className="anomaly-evidence">
                <div><span>Electricity</span><strong>{percentage(evidence?.electricity)}</strong></div>
                <div><span>Water</span><strong>{percentage(evidence?.water)}</strong></div>
                <div><span>Supporting activity</span><strong>{evidence?.activity ? "Activity present" : "No events in window"}</strong></div>
              </div>
            </div>
            <div className="anomaly-result">
              <div className="anomaly-beacon" aria-hidden="true"><Icon name={detected ? "shield" : "layers"} size={28} /></div>
              <Badge tone={detected ? "red" : "purple"}>Illustrative demo</Badge>
              <div role="status" aria-live="polite" aria-atomic="true">
                <h3>{paused && running ? "Demo paused" : detected ? "Demo anomaly detected" : stage === 3 ? "No concern detected" : steps[stage]}</h3>
                <p>{detected
                  ? `${household}: both utilities are below 20% of usual usage, with no supporting activity. A check-in would be suggested.`
                  : stage === 0 ? "Comparing this home’s observed usage with its usual daily pattern."
                  : stage === 1 ? "Electricity and water fall together while movement and app activity stop."
                  : stage === 2 ? "Checking that both utility drops agree and no activity contradicts the quiet period."
                  : "The demonstration rule was not satisfied."}</p>
              </div>
              {running && <button className="text-button" onClick={onPause}>{paused ? "Continue demo" : "Pause demo"}</button>}
              {detected && <a className="text-button" href="#household-signals">Inspect affected signals ↓</a>}
            </div>
          </div>
          <div className="panel-footer">
            <span>Illustrative rule · simulated readings · no incident or notification created</span>
            <Link className="text-button" to="/demo">Open registered-model demo →</Link>
          </div>
        </>
      )}
    </section>
  );
}
