# ETA v1 API contract

The v1 endpoint keeps the current required inputs and adds an optional operational threshold.

## Request

```json
{
  "origin": "ORD",
  "destination": "LAX",
  "depart_time": "2026-10-09T13:00:00Z",
  "late_threshold_iso": "2026-10-11T14:00:00Z"
}
```

`late_threshold_iso` is optional. It represents an operationally meaningful cutoff such as a dock-window end. If supplied, the service returns an empirical late-arrival probability using held-out calibration residuals.

## Response

```json
{
  "synthetic_data": true,
  "lane": "ORD|LAX",
  "model_version": "eta-gbr-2026-10-04-v1",
  "predicted_transit_min": 2929.57,
  "baseline_transit_min": 2872.8,
  "ml_adjustment_min": 56.77,
  "predicted_eta": "2026-10-11T13:49:34.124988Z",
  "likely_range_90": {
    "low": "2026-10-11T12:18:10.972744Z",
    "high": "2026-10-11T15:29:30.909528Z"
  },
  "p90_eta": "2026-10-11T15:04:47.315987Z",
  "uncertainty_method": "held-out signed residual quantiles",
  "late_threshold": "2026-10-11T14:00:00Z",
  "estimated_late_probability": 0.4196
}
```

This example is an actual output from the trained v1 artifact, not authored UI data.

## Compatibility

The existing frontend only requires `predicted_eta`, so the v1 response is backward-compatible with the current ETA result renderer. New UI can feature-detect `model_version` and progressively expose the baseline comparison, uncertainty range, P90, and late-risk probability.

Shipment-level SHAP output is intentionally a separate concern. The training/analysis package already computes real SHAP values, but the lean inference Lambda does not currently ship the SHAP dependency.
