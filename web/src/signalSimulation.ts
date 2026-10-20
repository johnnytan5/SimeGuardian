export const signalParameters: Record<
  string,
  { color: string; reference: number; decimals: number }
> = {
  electricity: { color: "#7852d6", reference: 1.6, decimals: 2 },
  water: { color: "#9f74e7", reference: 65, decimals: 1 },
  parking: { color: "#5535a6", reference: 2, decimals: 0 },
  mall: { color: "#c393ed", reference: 2, decimals: 0 },
  gate: { color: "#9872d3", reference: 2, decimals: 0 },
  app: { color: "#b16cdb", reference: 3, decimals: 0 },
};

export const SIGNAL_INTERVAL = 15 * 60_000;
const HOUR = 60 * 60_000;
export const townshipRanges = {
  day: { label: "24 hours", hours: 24, bucketHours: 1 },
  week: { label: "7 days", hours: 168, bucketHours: 6 },
  month: { label: "30 days", hours: 720, bucketHours: 24 },
};
export type TownshipRange = keyof typeof townshipRanges;
export type SignalSample = Record<string, number> & { at: number };
export type AnomalyDemoState = { household: string; from: number; step: number };

const routines = [
  { name: "Early routine", morning: 6.2, evening: 17.5, daytime: 0.2 },
  { name: "Daytime activity", morning: 8, evening: 19, daytime: 0.65 },
  { name: "Evening activity", morning: 9.5, evening: 21, daytime: 0.15 },
  { name: "Split routine", morning: 7, evening: 19.5, daytime: 0.4 },
];

export function householdProfile(household: string) {
  const index = Number(household.slice(-3)) - 1;
  return {
    ...routines[index % routines.length],
    index,
    scale: 0.8 + ((index * 7) % 11) * 0.1,
    offset: ((index % 5) - 2) * 0.25,
  };
}

// shortcut: illustrative hourly activity, replace with timestamped telemetry when real feeds are connected.
export function simulateSignals(
  at: number,
  household = "SG-001",
): SignalSample {
  const profile = householdProfile(household);
  const slot = Math.floor(at / SIGNAL_INTERVAL);
  const localSlot = ((slot + 32) % 96 + 96) % 96;
  const hour = localSlot / 4;
  const day = Math.floor((slot + 32) / 96);
  const weekend = [0, 6].includes(((day + 4) % 7 + 7) % 7);
  const morning = profile.morning + profile.offset + (weekend ? 1 : 0);
  const evening = profile.evening + profile.offset;
  const peak = (center: number, width: number) => {
    const distance = Math.abs(hour - center);
    return Math.exp(-((Math.min(distance, 24 - distance) / width) ** 2));
  };
  const variation =
    (0.9 + 0.08 * Math.sin(slot * 1.73 + profile.index) + 0.06 * Math.sin(slot * 0.59)) *
    (1 + 0.12 * Math.sin(day * 0.9 + profile.index)) * profile.scale;
  const shift = ((day + profile.index) % 3 + 3) % 3;
  const events = (times: number[]) =>
    times.filter((time) => (localSlot - time + 96) % 96 < 4).length;
  const trip = events([
    Math.round((morning + 1) * 4) + shift,
    Math.round((evening - 0.5) * 4) - shift,
    ...(profile.index % 4 === 1 ? [46 + shift, 53 + shift] : []),
  ]);
  return {
    at,
    electricity: Number((
      (0.15 + 0.65 * peak(morning, 1.6) + profile.daytime * peak(13, 2.5) + 1.08 * peak(evening, 2.2)) * variation
    ).toFixed(2)),
    water: Number((
      (1.2 + 42 * peak(morning, 0.9) + (10 + profile.daytime * 30) * peak(12.5, 1.1) + 35 * peak(evening, 1.2)) * variation
    ).toFixed(1)),
    parking: trip,
    mall: (day + profile.index) % 3 === 0 ? events([46 + shift + profile.index % 8]) : 0,
    gate: trip,
    app: events([Math.round(morning * 4), 52 + shift, Math.round(evening * 4) + shift]),
  };
}

export const formatSignal = (id: string, value: number) =>
  value.toLocaleString("en-MY", {
    minimumFractionDigits: signalParameters[id].decimals,
    maximumFractionDigits: signalParameters[id].decimals,
  });

export function applyDemoAnomaly(
  sample: SignalSample,
  household: string,
  demo: AnomalyDemoState | null,
): SignalSample {
  if (!demo || demo.household !== household || demo.step < 3 || sample.at < demo.from) return sample;
  const ratio = 1 - 0.96 * Math.min(1, (demo.step - 2) / 4);
  return {
    ...sample,
    electricity: sample.electricity * ratio,
    water: sample.water * ratio,
    parking: 0, gate: 0, mall: 0, app: 0,
  };
}

// shortcut: an illustrative comparison rule, use registered-model evidence for real replay decisions.
export function demoAnomalyEvidence(expected: SignalSample[], observed: SignalSample[], from: number) {
  const normal = expected.filter((point) => point.at >= from);
  const actual = observed.filter((point) => point.at >= from);
  const ratio = (key: string) => {
    const baseline = normal.reduce((sum, point) => sum + point[key], 0);
    return baseline > 0 && actual.length === normal.length
      ? actual.reduce((sum, point) => sum + point[key], 0) / baseline
      : null;
  };
  const electricity = ratio("electricity");
  const water = ratio("water");
  const activity = actual.some((point) => point.parking + point.gate + point.mall + point.app > 0);
  return {
    electricity, water, activity,
    detected: electricity !== null && water !== null && electricity < 0.2 && water < 0.2 && !activity,
  };
}

export function townshipWindow(
  at: number, range: TownshipRange, households: string[], demo: AnomalyDemoState | null = null,
) {
  const { hours, bucketHours } = townshipRanges[range];
  const keys = Object.keys(signalParameters);
  const homes = households.map((id) => ({
    id,
    profile: householdProfile(id),
    points: Array.from({ length: hours / bucketHours }, (_, index) => {
      const end = at - (hours / bucketHours - index - 1) * bucketHours * HOUR;
      const point: SignalSample = { at: end, ...Object.fromEntries(keys.map((key) => [key, 0])) };
      for (let hour = 0; hour < bucketHours; hour++) {
        const sample = applyDemoAnomaly(simulateSignals(end - hour * HOUR, id), id, demo);
        for (const key of keys) point[key] += sample[key];
      }
      return point;
    }),
  }));
  const totals = (homes[0]?.points ?? []).map((point, index): SignalSample => ({
    at: point.at,
    ...Object.fromEntries(keys.map((key) => [key,
      homes.reduce((sum, home) => sum + home.points[index][key], 0),
    ])),
  }));
  return { homes, totals };
}
