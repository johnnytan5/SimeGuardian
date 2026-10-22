import { Kpi } from "./ui";

// Headline results from jiale's household modeling study (final_output/SimeGuardian_Modeling.zip,
// notebook 02_anomaly_emergency_detection). Copied from its README/validation.csv; update together.
export function StudyResults() {
  return (
    <>
      <div className="kpi-grid">
        <Kpi title="Emergency F1" value="90.91%" copy="All three held-out test replays" />
        <Kpi title="Precision" value="93.75%" copy="75 of 80 alerts were real emergencies" />
        <Kpi title="Recall" value="88.24%" copy="75 of 85 emergency intervals; unavailable ones count as misses" />
        <Kpi title="Episodes detected" value="29 / 30" copy="1.37 false alert groups per 30 household-days" />
      </div>
      <p className="field-help">
        Household study: seasonal LSTM usage forecasts and a gradient-boosting emergency classifier, one synthetic
        household with an older adult, daytime emergencies only. Real-world reliability is untested. Full notebooks in
        final_output/SimeGuardian_Modeling.zip.
      </p>
    </>
  );
}
