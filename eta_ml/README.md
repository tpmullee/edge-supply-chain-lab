# ETA ML rebuild

This package is the model-development core for the Supply Chain Labs ETA demo.

## What is real

- The training corpus is **synthetic and explicitly disclosed as synthetic**.
- A supervised `GradientBoostingRegressor` learns residual minutes above a transparent heuristic baseline.
- Evaluation uses chronological train/calibration/test partitions, not a random split.
- Metrics are computed from held-out test predictions.
- Evaluation includes both the naive speed+dwell heuristic and a stronger training-only lane-average baseline matching the current demo concept.
- SHAP explanations come from the trained tree model.
- The initial uncertainty range uses signed residual quantiles from the held-out calibration period; late-arrival probability uses that empirical residual distribution.

## Baseline

`distance / 45 mph + 180 minutes fixed dwell`

The ML model predicts a correction to that baseline rather than replacing the baseline conceptually. This makes the fallback and explanation contract clear.

## Reproduce

```bash
python3 -m pip install -r requirements.txt
python3 train.py
python3 predict_example.py
python3 -m pytest -q
```

`train.py` writes:

- `data/synthetic_shipments.csv`
- `artifacts/eta_model_bundle.joblib` (training/analysis artifact; not required by the lean runtime)
- `artifacts/eta_model.json` (portable serving artifact)
- `artifacts/evaluation.json`
- `artifacts/model_card.json`

Do not publish any metric until it comes from `artifacts/evaluation.json` for the artifact being served.

## Serving path

`lambda_handler.py` is an API Gateway-compatible inference handler. Training exports the fitted scikit-learn trees to `artifacts/eta_model.json`; the Lambda runtime uses only the Python standard library to load that frozen artifact once per warm execution environment and returns the point ETA, baseline, ML adjustment, 90% range, P90 ETA, and (when a threshold is supplied) an empirically calibrated late-arrival probability.

The current public `/eta` Lambda is not replaced by this branch yet. Deploy this artifact to staging only after the model package is reviewed; then update the existing frontdoor route rather than creating a second public API unless deployment constraints require it.

SHAP is implemented and tested in the model package, but is intentionally not invoked by the lean `/eta` handler yet. That keeps core inference small and reliable while we decide whether explanations should be served by a separate endpoint/container or precomputed for selected scenarios.
