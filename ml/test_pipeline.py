"""ml/.venv/bin/python -m unittest discover ml"""
import tempfile
import unittest
from pathlib import Path

import numpy as np

from simulate import generate
from train import baseline, main


class Pipeline(unittest.TestCase):
    def test_generator_is_reproducible(self):
        self.assertEqual(generate(3, 10, 20)['checksum'], generate(3, 10, 20)['checksum'])
        self.assertNotEqual(generate(3, 10, 20)['checksum'], generate(4, 10, 20)['checksum'])

    def test_baseline_never_sees_the_future(self):
        x = np.random.default_rng(0).random((2, 30, 24))
        away = np.zeros_like(x, bool)
        before = baseline(x, away)[:, 20]
        x[:, 20:] = 99  # change today and everything after it
        np.testing.assert_array_equal(baseline(x, away)[:, 20], before)

    def test_small_run_writes_report_with_disjoint_household_splits(self):
        with tempfile.TemporaryDirectory() as d:
            r = main(seed=1, households=20, days=40, out=Path(d))
            self.assertTrue((Path(d) / r['run_id'] / 'model.joblib').exists())
            self.assertTrue((Path(d) / 'latest.json').exists())
        self.assertEqual(sum(s['households'] for s in r['splits'].values()), 20)
        self.assertEqual(set(r['test']), {'rule', 'model', 'model+corroboration'})
        self.assertIn(r['policy']['selected'], r['test'])


if __name__ == '__main__':
    unittest.main()
