"""Synthetic township data for elderly households living alone.

15-minute electricity and water intervals plus sparse resident-app and gate
events, with labelled concern episodes, naps, declared away trips and feed
outages. Every number is made up; labels describe the simulation, not anyone's
health.
"""
import hashlib

import numpy as np

GENERATOR_VERSION = 'sim-v1'
SLOTS = 96  # 15-minute intervals per day


def generate(seed=7, households=120, days=90):
    rng = np.random.default_rng(seed)
    H, T = households, days * SLOTS
    hour = np.tile(np.arange(SLOTS) / 4, days)
    day = np.repeat(np.arange(days), SLOTS)

    wake = rng.normal(6.5, 0.6, H).clip(5, 8.5)
    sleep = rng.normal(22.5, 0.6, H).clip(20.5, 23.75)
    base = rng.uniform(0.01, 0.03, H)[:, None]    # kWh per slot: fridge and standby
    active = rng.uniform(0.15, 0.4, H)[:, None]   # kWh per slot when up and about
    tap = rng.uniform(5, 20, H)[:, None]          # litres per use
    app_rate = rng.uniform(0.1, 0.5, H)[:, None]  # meaningful app sessions per awake hour
    gate_rate = rng.uniform(0.5, 2.5, H)[:, None]  # gate passages per day

    jitter = rng.normal(0, 0.4, (H, days))[:, day]
    awake = (hour >= wake[:, None] + jitter) & (hour < sleep[:, None] + jitter)
    away = np.zeros((H, T), bool)
    nap = np.zeros((H, T), bool)
    concern = np.zeros((H, T), bool)
    left_on = np.zeros((H, T), bool)
    episodes = []
    warm = 14 * SLOTS  # no episodes during the baseline warm-up

    for h in range(H):
        if rng.random() < 0.5:  # one declared trip of 2-5 days
            s = rng.integers(warm, T - 5 * SLOTS)
            away[h, s:s + rng.integers(2, 6) * SLOTS] = True
        for d in np.flatnonzero(rng.random(days) < 0.3):  # afternoon naps, benign
            s = d * SLOTS + rng.integers(52, 60)
            nap[h, s:s + rng.integers(4, 9)] = True
        for _ in range(rng.poisson(3)):  # 3-8 h with no activity while home
            s, n = rng.integers(warm, T - 32), rng.integers(12, 33)
            if not awake[h, s] or away[h, s:s + n].any() or concern[h, s:s + n].any():
                continue
            kind = 'appliance_left_on' if rng.random() < 0.3 else 'inactive'
            concern[h, s:s + n] = True
            left_on[h, s:s + n] = kind == 'appliance_left_on'
            episodes.append({'household': h, 'start_slot': int(s), 'end_slot': int(s + n), 'kind': kind})

    use = awake & ~away & ~nap & ~concern
    elec = base + use * active * rng.lognormal(0, 0.35, (H, T)) * (rng.random((H, T)) < 0.8)
    elec += (nap & ~away) * 0.2 * active + left_on * 0.6 * active
    water = use * (rng.random((H, T)) < 0.35) * tap * rng.lognormal(0, 0.3, (H, T))
    app = rng.poisson(app_rate / 4 * (awake & ~nap & ~concern))  # the phone travels, so app use continues while away
    gate = rng.poisson(gate_rate / 64 * use)

    for h in range(H):  # feed outages stay missing, never zero
        for _ in range(2):
            s = rng.integers(0, T - 24)
            (elec if rng.random() < 0.5 else water)[h, s:s + rng.integers(8, 25)] = np.nan

    data = {'elec': elec, 'water': water, 'app': app, 'gate': gate, 'away': away, 'concern': concern}
    digest = hashlib.sha256(b''.join(np.ascontiguousarray(v).tobytes() for v in data.values())).hexdigest()
    return {**data, 'episodes': episodes, 'version': GENERATOR_VERSION, 'seed': seed,
            'households': H, 'days': days, 'checksum': digest[:16]}
