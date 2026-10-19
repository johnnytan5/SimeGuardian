"""Train and evaluate the SimeGuardian anomaly model on synthetic data.

    ml/.venv/bin/python ml/train.py

Hourly windows, a past-only 14-day personal baseline, a rule baseline and an
Isolation Forest trained on normal windows. Households are split 70/15/15
and each split scores its own date range. Thresholds are chosen on
validation; the test split is scored once with everything frozen. Writes
ml/runs/<run_id>/ and ml/runs/latest.json (which the dashboard reads).
"""
import json
import shutil
import warnings
from datetime import datetime, timezone
from pathlib import Path

import joblib
import numpy as np
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import StandardScaler

from simulate import generate

FEATURE_VERSION = 'feat-v1'
POLICY_VERSION = 'policy-v1'
FEATURES = ['elec_ratio', 'water_ratio', 'elec_ratio_3h', 'water_ratio_3h', 'hours_since_app', 'hours_since_gate']
WARM_DAYS = 14
RUNS = Path(__file__).parent / 'runs'


def hourly(ds):
    """15-minute slots → hourly windows, shape (households, days, 24). A missing slot makes the hour missing."""
    H, D = ds['households'], ds['days']
    def r(x): return x.reshape(H, D, 24, 4)
    return {
        'elec': r(ds['elec']).sum(-1), 'water': r(ds['water']).sum(-1),
        'app': r(ds['app']).sum(-1), 'gate': r(ds['gate']).sum(-1),
        'away': r(ds['away']).any(-1), 'concern': r(ds['concern']).mean(-1) >= 0.5,
    }


def baseline(x, away, q=50):
    """q-th percentile (default median) of the same hour over the previous 14 days, ignoring away days. Never looks forward."""
    x = np.where(away, np.nan, x)
    out = np.full_like(x, np.nan, dtype=float)
    with warnings.catch_warnings():
        warnings.simplefilter('ignore', RuntimeWarning)  # all-NaN slices stay NaN
        for d in range(WARM_DAYS, x.shape[1]):
            out[:, d] = np.nanpercentile(x[:, d - WARM_DAYS:d], q, axis=1)
    return out


def hours_since(events):
    """Hours since the last event, capped at 24, per household along flattened time."""
    flat = events.reshape(len(events), -1)
    t = np.arange(flat.shape[1])
    last = np.maximum.accumulate(np.where(flat > 0, t, -10**6), axis=1)
    return np.minimum(t - last, 24).reshape(events.shape)


def features(hr):
    be, bw = baseline(hr['elec'], hr['away']), baseline(hr['water'], hr['away'])
    def prev(x):
        f = x.reshape(len(x), -1)
        return np.concatenate([np.full((len(x), 1), np.nan), f[:, :-1]], axis=1).reshape(x.shape)
    def last3(x): return x + prev(x) + prev(prev(x))  # this hour and the two before it
    with np.errstate(divide='ignore', invalid='ignore'):
        X = np.stack([hr['elec'] / be, hr['water'] / bw,
                      last3(hr['elec']) / last3(be), last3(hr['water']) / last3(bw),
                      hours_since(hr['app']), hours_since(hr['gate'])], axis=-1)
    # Score only expected active hours (water used at this hour on 80%+ of recent days) at home,
    # with both utility feeds present for the last 3 hours.
    eligible = (baseline(hr['water'], hr['away'], q=20) > 0) & ~hr['away'] & np.isfinite(X[..., :4]).all(-1)
    return X, eligible


def runs(mask):
    """(start, end) of each run of True in a 1-D bool array."""
    d = np.diff(np.r_[0, mask.astype(int), 0])
    return list(zip(np.flatnonzero(d == 1), np.flatnonzero(d == -1)))


def evaluate(flag, label, eligible):
    """Episode-level metrics. Arrays are (households, hours) for one split and date range."""
    alerts = true_alerts = episodes = detected = 0
    delays = []
    for f, y, ok in zip(flag & eligible, label, eligible):
        for s, e in runs(f):
            alerts += 1
            true_alerts += bool(y[s:e].any())
        for s, e in runs(y):
            if not ok[s:e].any():
                continue  # nothing scoreable in this episode: insufficient data, not a miss
            episodes += 1
            hits = np.flatnonzero(f[s:e])
            if len(hits):
                detected += 1
                delays.append(int(hits[0]))
    household_days = flag.size / 24
    precision = true_alerts / alerts if alerts else 0.0
    recall = detected / episodes if episodes else 0.0
    f = flag & eligible
    return {
        'episode_recall': round(recall, 3), 'alert_precision': round(precision, 3),
        'f1': round(2 * precision * recall / (precision + recall), 3) if precision + recall else 0.0,
        'false_alerts_per_household_day': round((alerts - true_alerts) / household_days, 4),
        'median_detection_delay_h': float(np.median(delays)) if delays else None,
        'alerts': alerts, 'episodes': episodes, 'detected': detected,
        'confusion': {k: int(v) for k, v in {
            'tp': (f & label).sum(), 'fp': (f & ~label).sum(),
            'fn': (~f & label & eligible).sum(), 'tn': (~f & ~label & eligible).sum()}.items()},
    }


def prep(X):
    """Cap usage ratios at 1.5: busier-than-usual hours are not a concern, so the model shouldn't learn them as outliers."""
    X = X.copy()
    X[:, :4] = np.minimum(X[:, :4], 1.5)
    return X


def corroborated(X):
    # ponytail: illustrative policy, both utilities clearly below routine over the last 3 hours.
    return (X[..., 2] < 0.7) & (X[..., 3] < 0.3)


def rule(X):
    # PRD rule baseline: both utilities under 20% of routine for the completed hour, and no resident app use.
    return (X[..., 0] < 0.2) & (X[..., 1] < 0.2) & (X[..., 4] > 0)


def main(seed=7, households=120, days=90, out=RUNS):
    started = datetime.now(timezone.utc)
    ds = generate(seed, households, days)
    hr = hourly(ds)
    X, eligible = features(hr)
    y = hr['concern']

    order = np.random.default_rng(seed).permutation(households)
    n_train, n_val = round(households * 0.7), round(households * 0.15)
    groups = {'train': order[:n_train], 'validation': order[n_train:n_train + n_val], 'test': order[n_train + n_val:]}
    cut1, cut2 = round(days * 60 / 90), round(days * 75 / 90)
    ranges = {'train': (WARM_DAYS, cut1), 'validation': (cut1, cut2), 'test': (cut2, days)}

    def part(name, arr):
        a, b = ranges[name]
        return arr[groups[name]][:, a:b].reshape(len(groups[name]), -1, *arr.shape[3:])

    # Fit on normal training windows only; scaling is learned from training data only.
    Xt, et, yt = part('train', X), part('train', eligible), part('train', y)
    normal = prep(Xt[et & ~yt])
    scaler = StandardScaler().fit(normal)
    model = IsolationForest(n_estimators=200, random_state=seed).fit(scaler.transform(normal))

    def score(Xp):
        flat = np.nan_to_num(Xp.reshape(-1, len(FEATURES)), nan=0.0, posinf=0.0, neginf=0.0)  # ineligible rows, masked later
        return -model.score_samples(scaler.transform(prep(flat))).reshape(Xp.shape[:-1])

    Xv, ev, yv = part('validation', X), part('validation', eligible), part('validation', y)
    sv = score(Xv)
    candidates = np.quantile(sv[ev], np.linspace(0.80, 0.999, 120))
    def best(extra):
        trials = [(evaluate((sv >= t) & extra, yv, ev)['f1'], float(t)) for t in candidates]
        return max(trials)[1]
    thr_model, thr_combined = best(True), best(corroborated(Xv))

    flags = {
        'rule': lambda Xp, s: rule(Xp),
        'model': lambda Xp, s: s >= thr_model,
        'model+corroboration': lambda Xp, s: (s >= thr_combined) & corroborated(Xp),
    }
    validation = {k: evaluate(f(Xv, sv), yv, ev) for k, f in flags.items()}
    selected = max(validation, key=lambda k: validation[k]['f1'])

    # Untouched test split: scored once, after the policy and thresholds are frozen.
    Xs, es, ys = part('test', X), part('test', eligible), part('test', y)
    ss = score(Xs)
    test = {k: evaluate(f(Xs, ss), ys, es) for k, f in flags.items()}

    run_id = started.strftime('run-%Y%m%d-%H%M%S')
    report = {
        'run_id': run_id, 'status': 'completed', 'started_at': started.isoformat(timespec='seconds'),
        'finished_at': datetime.now(timezone.utc).isoformat(timespec='seconds'),
        'dataset': {'generator': ds['version'], 'seed': seed, 'checksum': ds['checksum'],
                    'households': households, 'days': days, 'interval_min': 15,
                    'episodes': len(ds['episodes']),
                    'episode_kinds': {k: sum(e['kind'] == k for e in ds['episodes']) for k in ('inactive', 'appliance_left_on')}},
        'splits': {name: {'households': len(groups[name]), 'days': [ranges[name][0] + 1, ranges[name][1]],
                          'scored_windows': int(part(name, eligible).sum()),
                          'concern_prevalence': round(float(part(name, y)[part(name, eligible)].mean()), 4)}
                   for name in groups},
        'features': {'version': FEATURE_VERSION, 'names': FEATURES, 'baseline': f'past-only {WARM_DAYS}-day median, same hour'},
        'model': {'type': 'IsolationForest', 'n_estimators': 200, 'trained_on': int(len(normal)),
                  'thresholds': {'model': round(thr_model, 4), 'model+corroboration': round(thr_combined, 4)}},
        'policy': {'version': POLICY_VERSION, 'selected': selected, 'selected_on': 'validation f1'},
        'validation': validation, 'test': test,
    }

    run_dir = out / run_id
    run_dir.mkdir(parents=True, exist_ok=True)
    joblib.dump({'scaler': scaler, 'model': model, 'features': FEATURES}, run_dir / 'model.joblib')
    (run_dir / 'metrics.json').write_text(json.dumps(report, indent=2))
    shutil.copy(run_dir / 'metrics.json', out / 'latest.json')
    return report


if __name__ == '__main__':
    r = main()
    print(f"{r['run_id']}: selected {r['policy']['selected']}")
    for k, m in r['test'].items():
        print(f"  test {k:<20} recall {m['episode_recall']:.2f}  precision {m['alert_precision']:.2f}  "
              f"false alerts/household-day {m['false_alerts_per_household_day']:.3f}")
