# Final modeling study

[Download the complete modeling package](SimeGuardian_Modeling.zip) · [SHA-256 checksum](SimeGuardian_Modeling.zip.sha256)

The archive contains two executed notebooks, CSV datasets, trained model weights and preprocessing, training logs, source code, paper references, HTML previews and eleven PNG/PDF figures.

- **Usage forecasting:** four separate source-specific seasonal LSTMs for electricity, water, gate and ordinary app activity. Includes data preparation, training curves, measured/predicted plots and MAE/RMSE.
- **Anomaly and emergency detection:** independent gradient boosting classifiers with delayed family confirmations as ground truth. Includes fitting, calibration, TP/FP/TN/FN, precision/recall and episode-level validation.

## Selected emergency results

| Evaluation | Precision | Recall | F1 |
|---|---:|---:|---:|
| All three held-out test replays |93.75%|88.24%|90.91%|
| Selected worked example:20261108 |96.15%|92.59%|94.34%|

Recall and F1 count unavailable positive intervals as misses. All three test replays remain included. Episode detection is29/30; grouped-alert precision is74.36%, with1.37 false alert groups per30 household-days.

The study represents one synthetic family household with an older adult. Its evaluated emergency scope is daytime6–9h assistance episodes, hourly08:00–21:00 elder check-ins,99.5% healthy response adherence and no forgotten-phone days. Brief/nighttime emergencies and real-world reliability are not established by these results.

## Open and verify

From this directory:

```sh
shasum -a256 -c SimeGuardian_Modeling.zip.sha256
unzip SimeGuardian_Modeling.zip
cd SimeGuardian_Modeling
python3 verify_package.py
```

Open the two notebooks, or read their pre-rendered HTML previews. The extracted README explains environment setup and reproducible model execution. The archive is the selected handoff; unpacked research working files are ignored by Git.
