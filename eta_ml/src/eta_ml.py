from __future__ import annotations

import json
import math
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import GradientBoostingRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error, median_absolute_error

SEED = 20261004
ASSUMED_EFFECTIVE_SPEED_MPH = 45.0
BASELINE_DWELL_MIN = 180.0
FEATURES = [
    "distance_miles",
    "planned_transit_min",
    "departure_hour_sin",
    "departure_hour_cos",
    "departure_dow_sin",
    "departure_dow_cos",
    "is_weekend",
    "is_peak_window",
    "is_friday",
    "is_monday",
    "is_winter",
    "route_winter_exposure",
    "origin_dwell_mean_min",
    "destination_dwell_mean_min",
    "destination_dwell_p90_min",
    "origin_congestion_index",
    "destination_congestion_index",
    "lane_delay_mean_min",
    "lane_delay_std_min",
    "lane_reliability",
]

FACILITIES = {
    "ORD": {"city": "Chicago", "lat": 41.9742, "lon": -87.9073, "dwell": 88, "congestion": 0.62},
    "LAX": {"city": "Los Angeles", "lat": 33.9416, "lon": -118.4085, "dwell": 102, "congestion": 0.71},
    "DFW": {"city": "Dallas", "lat": 32.8998, "lon": -97.0403, "dwell": 74, "congestion": 0.51},
    "ATL": {"city": "Atlanta", "lat": 33.6407, "lon": -84.4277, "dwell": 83, "congestion": 0.57},
    "SEA": {"city": "Seattle", "lat": 47.4502, "lon": -122.3088, "dwell": 79, "congestion": 0.48},
    "EWR": {"city": "Newark", "lat": 40.6895, "lon": -74.1745, "dwell": 106, "congestion": 0.76},
    "PHX": {"city": "Phoenix", "lat": 33.4342, "lon": -112.0116, "dwell": 67, "congestion": 0.42},
    "DEN": {"city": "Denver", "lat": 39.8561, "lon": -104.6737, "dwell": 72, "congestion": 0.44},
    "STL": {"city": "St. Louis", "lat": 38.7487, "lon": -90.37, "dwell": 64, "congestion": 0.38},
    "CLT": {"city": "Charlotte", "lat": 35.2144, "lon": -80.9473, "dwell": 69, "congestion": 0.41},
    "MEM": {"city": "Memphis", "lat": 35.0424, "lon": -89.9767, "dwell": 61, "congestion": 0.35},
    "HOU": {"city": "Houston", "lat": 29.9902, "lon": -95.3368, "dwell": 81, "congestion": 0.55},
}

LANES = [
    ("ORD", "LAX"), ("LAX", "ORD"), ("ORD", "DFW"), ("DFW", "ORD"),
    ("ORD", "ATL"), ("ATL", "ORD"), ("ORD", "EWR"), ("EWR", "ORD"),
    ("ORD", "SEA"), ("SEA", "ORD"), ("LAX", "DFW"), ("DFW", "LAX"),
    ("LAX", "PHX"), ("PHX", "LAX"), ("DFW", "ATL"), ("ATL", "DFW"),
    ("ATL", "EWR"), ("EWR", "ATL"), ("DEN", "ORD"), ("ORD", "DEN"),
    ("STL", "ORD"), ("ORD", "STL"), ("MEM", "ATL"), ("ATL", "MEM"),
    ("CLT", "EWR"), ("EWR", "CLT"), ("HOU", "DFW"), ("DFW", "HOU"),
    ("PHX", "DFW"), ("DFW", "PHX"),
]


def _haversine_miles(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 3958.8
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def _road_distance(origin: str, destination: str) -> float:
    o, d = FACILITIES[origin], FACILITIES[destination]
    air = _haversine_miles(o["lat"], o["lon"], d["lat"], d["lon"])
    return round(air * 1.16, 1)


def _lane_profiles(seed: int = SEED) -> dict[str, dict[str, float]]:
    rng = np.random.default_rng(seed)
    profiles: dict[str, dict[str, float]] = {}
    for origin, destination in LANES:
        lane = f"{origin}|{destination}"
        distance = _road_distance(origin, destination)
        mean = float(rng.normal(12, 26)) + 7 * (distance > 1500)
        std = float(rng.uniform(32, 88)) + 10 * (FACILITIES[destination]["congestion"] > 0.65)
        reliability = float(np.clip(0.94 - std / 500 - max(mean, 0) / 700, 0.68, 0.95))
        profiles[lane] = {
            "distance_miles": distance,
            "lane_delay_mean_min": round(mean, 3),
            "lane_delay_std_min": round(std, 3),
            "lane_reliability": round(reliability, 5),
        }
    return profiles


def heuristic_baseline_minutes(distance_miles: float) -> float:
    return distance_miles / ASSUMED_EFFECTIVE_SPEED_MPH * 60.0 + BASELINE_DWELL_MIN


def _feature_row(
    origin: str,
    destination: str,
    depart_time: pd.Timestamp,
    profiles: dict[str, dict[str, float]],
) -> dict[str, float]:
    lane = f"{origin}|{destination}"
    lp = profiles[lane]
    o, d = FACILITIES[origin], FACILITIES[destination]
    hour = depart_time.hour + depart_time.minute / 60.0
    dow = depart_time.dayofweek
    destination_p90 = d["dwell"] + 1.28 * (30 + 70 * d["congestion"])
    peak = float(6.5 <= hour <= 9.5 or 15.5 <= hour <= 19.0)
    winter = float(depart_time.month in (12, 1, 2))
    northern = {"ORD", "EWR", "DEN", "SEA"}
    baseline = heuristic_baseline_minutes(lp["distance_miles"])
    return {
        "distance_miles": lp["distance_miles"],
        "planned_transit_min": baseline,
        "departure_hour_sin": math.sin(2 * math.pi * hour / 24),
        "departure_hour_cos": math.cos(2 * math.pi * hour / 24),
        "departure_dow_sin": math.sin(2 * math.pi * dow / 7),
        "departure_dow_cos": math.cos(2 * math.pi * dow / 7),
        "is_weekend": float(dow >= 5),
        "is_peak_window": peak,
        "is_friday": float(dow == 4),
        "is_monday": float(dow == 0),
        "is_winter": winter,
        "route_winter_exposure": float(origin in northern or destination in northern),
        "origin_dwell_mean_min": float(o["dwell"]),
        "destination_dwell_mean_min": float(d["dwell"]),
        "destination_dwell_p90_min": float(destination_p90),
        "origin_congestion_index": float(o["congestion"]),
        "destination_congestion_index": float(d["congestion"]),
        "lane_delay_mean_min": lp["lane_delay_mean_min"],
        "lane_delay_std_min": lp["lane_delay_std_min"],
        "lane_reliability": lp["lane_reliability"],
    }


def generate_synthetic_shipments(n: int = 30000, seed: int = SEED) -> pd.DataFrame:
    """Generate disclosed synthetic FTL shipment history with nonlinear, noisy transit outcomes."""
    rng = np.random.default_rng(seed)
    profiles = _lane_profiles(seed)
    start = pd.Timestamp("2025-01-01T00:00:00Z")
    end = pd.Timestamp("2026-09-30T23:59:00Z")
    span_min = int((end - start).total_seconds() // 60)

    lane_weights = np.array(
        [1.0 + profiles[f"{o}|{d}"]["distance_miles"] / 2200 for o, d in LANES],
        dtype=float,
    )
    lane_weights /= lane_weights.sum()
    lane_idx = rng.choice(len(LANES), size=n, p=lane_weights)
    departure_offsets = np.sort(rng.integers(0, span_min, size=n))

    rows: list[dict[str, Any]] = []
    for i in range(n):
        origin, destination = LANES[int(lane_idx[i])]
        depart = start + pd.Timedelta(minutes=int(departure_offsets[i]))
        feat = _feature_row(origin, destination, depart, profiles)
        lane = f"{origin}|{destination}"

        hour = depart.hour + depart.minute / 60.0
        dow = depart.dayofweek
        month = depart.month
        peak = 1.0 if (6.5 <= hour <= 9.5 or 15.5 <= hour <= 19.0) else 0.0
        friday = 1.0 if dow == 4 else 0.0
        monday = 1.0 if dow == 0 else 0.0
        weekend = 1.0 if dow >= 5 else 0.0
        winter = 1.0 if month in (12, 1, 2) else 0.0

        distance_scale = min(feat["distance_miles"] / 1200.0, 1.7)
        congestion_effect = (
            68 * feat["destination_congestion_index"] ** 2
            + 34 * feat["origin_congestion_index"] * peak
            + 21 * feat["destination_congestion_index"] * friday
        )
        calendar_effect = 18 * friday + 9 * monday - 12 * weekend + 24 * peak * distance_scale
        winter_effect = winter * distance_scale * (
            24 + 26 * (
                origin in {"ORD", "EWR", "DEN", "SEA"}
                or destination in {"ORD", "EWR", "DEN", "SEA"}
            )
        )
        dwell_effect = (
            0.34 * (feat["origin_dwell_mean_min"] - 75)
            + 0.56 * (feat["destination_dwell_mean_min"] - 75)
        )
        lane_effect = feat["lane_delay_mean_min"] + 34 * (1.0 - feat["lane_reliability"])

        # Unobserved noise and occasional tail events prevent trivial reconstruction.
        stochastic = rng.normal(0, 30 + 0.38 * feat["lane_delay_std_min"])
        if rng.random() < (0.035 + 0.045 * feat["destination_congestion_index"]):
            stochastic += rng.gamma(shape=2.1, scale=43.0)

        residual = (
            lane_effect
            + dwell_effect
            + congestion_effect
            + calendar_effect
            + winter_effect
            + stochastic
            - 32.0
        )
        actual = max(120.0, feat["planned_transit_min"] + residual)

        rows.append({
            "shipment_id": f"SYN-{i+1:06d}",
            "synthetic": True,
            "origin": origin,
            "destination": destination,
            "lane": lane,
            "depart_time": depart.isoformat(),
            **feat,
            "baseline_transit_min": feat["planned_transit_min"],
            "actual_transit_min": round(float(actual), 3),
            "target_residual_min": round(float(actual - feat["planned_transit_min"]), 3),
        })
    return pd.DataFrame(rows).sort_values("depart_time").reset_index(drop=True)


@dataclass
class MetricSet:
    mae_min: float
    median_ae_min: float
    rmse_min: float
    within_30_min_pct: float
    within_60_min_pct: float
    within_120_min_pct: float
    bias_min: float


def regression_metrics(y_true: np.ndarray, y_pred: np.ndarray) -> MetricSet:
    err = np.asarray(y_pred) - np.asarray(y_true)
    ae = np.abs(err)
    return MetricSet(
        mae_min=float(mean_absolute_error(y_true, y_pred)),
        median_ae_min=float(median_absolute_error(y_true, y_pred)),
        rmse_min=float(mean_squared_error(y_true, y_pred) ** 0.5),
        within_30_min_pct=float((ae <= 30).mean() * 100),
        within_60_min_pct=float((ae <= 60).mean() * 100),
        within_120_min_pct=float((ae <= 120).mean() * 100),
        bias_min=float(err.mean()),
    )


def chronological_split(df: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    n = len(df)
    train_end = int(n * 0.70)
    calib_end = int(n * 0.85)
    return df.iloc[:train_end].copy(), df.iloc[train_end:calib_end].copy(), df.iloc[calib_end:].copy()


def train_bundle(df: pd.DataFrame) -> tuple[dict[str, Any], dict[str, Any]]:
    train, calib, test = chronological_split(df)
    model = GradientBoostingRegressor(
        loss="huber",
        n_estimators=260,
        learning_rate=0.045,
        max_depth=3,
        min_samples_leaf=24,
        subsample=0.86,
        random_state=SEED,
    )
    model.fit(train[FEATURES], train["target_residual_min"])

    calib_residual_pred = model.predict(calib[FEATURES])
    calib_point = calib["baseline_transit_min"].to_numpy() + calib_residual_pred
    signed_calib_error = calib["actual_transit_min"].to_numpy() - calib_point
    q05, q10, q50, q90, q95 = np.quantile(signed_calib_error, [0.05, 0.10, 0.50, 0.90, 0.95])

    test_residual_pred = model.predict(test[FEATURES])
    ml_pred = test["baseline_transit_min"].to_numpy() + test_residual_pred
    baseline_pred = test["baseline_transit_min"].to_numpy()
    y = test["actual_transit_min"].to_numpy()

    ml_metrics = regression_metrics(y, ml_pred)
    baseline_metrics = regression_metrics(y, baseline_pred)
    lane_means = train.groupby("lane")["actual_transit_min"].mean().to_dict()
    lane_avg_pred = test["lane"].map(lane_means).to_numpy(dtype=float)
    lane_avg_metrics = regression_metrics(y, lane_avg_pred)
    low90 = ml_pred + q05
    high90 = ml_pred + q95
    coverage90 = float(((y >= low90) & (y <= high90)).mean() * 100)

    bundle = {
        "model": model,
        "features": FEATURES,
        "facility_profiles": FACILITIES,
        "lane_profiles": _lane_profiles(SEED),
        "baseline": {
            "assumed_effective_speed_mph": ASSUMED_EFFECTIVE_SPEED_MPH,
            "fixed_dwell_min": BASELINE_DWELL_MIN,
        },
        "uncertainty": {
            "method": "held-out signed residual quantiles",
            "q05_min": float(q05),
            "q10_min": float(q10),
            "q50_min": float(q50),
            "q90_min": float(q90),
            "q95_min": float(q95),
            "calibration_errors_min": signed_calib_error.astype(float),
        },
        "training": {
            "seed": SEED,
            "rows": len(df),
            "train_rows": len(train),
            "calibration_rows": len(calib),
            "test_rows": len(test),
            "train_end": train["depart_time"].iloc[-1],
            "calibration_end": calib["depart_time"].iloc[-1],
            "test_end": test["depart_time"].iloc[-1],
        },
    }

    report = {
        "synthetic_data": True,
        "split": bundle["training"],
        "model": "GradientBoostingRegressor trained on residual minutes above heuristic baseline",
        "baseline_definition": (
            f"distance / {ASSUMED_EFFECTIVE_SPEED_MPH:.1f} mph + "
            f"{BASELINE_DWELL_MIN:.0f} min fixed dwell"
        ),
        "ml": asdict(ml_metrics),
        "baseline": asdict(baseline_metrics),
        "lane_average_baseline": asdict(lane_avg_metrics),
        "improvement": {
            "vs_naive_mae_reduction_min": baseline_metrics.mae_min - ml_metrics.mae_min,
            "vs_naive_mae_reduction_pct": (
                baseline_metrics.mae_min - ml_metrics.mae_min
            ) / baseline_metrics.mae_min * 100,
            "vs_naive_within_60_lift_pp": (
                ml_metrics.within_60_min_pct - baseline_metrics.within_60_min_pct
            ),
            "vs_lane_avg_mae_reduction_min": lane_avg_metrics.mae_min - ml_metrics.mae_min,
            "vs_lane_avg_mae_reduction_pct": (
                lane_avg_metrics.mae_min - ml_metrics.mae_min
            ) / lane_avg_metrics.mae_min * 100,
            "vs_lane_avg_within_60_lift_pp": (
                ml_metrics.within_60_min_pct - lane_avg_metrics.within_60_min_pct
            ),
        },
        "uncertainty": {
            "method": "prediction plus held-out signed residual quantiles",
            "nominal_interval_pct": 90,
            "test_coverage_pct": coverage90,
            "q05_error_min": float(q05),
            "q95_error_min": float(q95),
        },
    }
    return bundle, report


def export_runtime_artifact(bundle: dict[str, Any], path: str | Path) -> dict[str, Any]:
    model = bundle["model"]
    trees = []
    for estimator in model.estimators_.ravel():
        tree = estimator.tree_
        trees.append({
            "children_left": tree.children_left.astype(int).tolist(),
            "children_right": tree.children_right.astype(int).tolist(),
            "feature": tree.feature.astype(int).tolist(),
            "threshold": tree.threshold.astype(float).tolist(),
            "value": tree.value[:, 0, 0].astype(float).tolist(),
        })
    init = float(np.asarray(model.init_.constant_).reshape(-1)[0])
    u = bundle["uncertainty"]
    artifact = {
        "model_version": "eta-gbr-2026-10-04-v1",
        "synthetic_data": True,
        "features": bundle["features"],
        "facility_profiles": bundle["facility_profiles"],
        "lane_profiles": bundle["lane_profiles"],
        "baseline": bundle["baseline"],
        "model": {
            "type": "GradientBoostingRegressor",
            "loss": "huber",
            "init": init,
            "learning_rate": float(model.learning_rate),
            "trees": trees,
        },
        "uncertainty": {
            "method": u["method"],
            "q05_min": float(u["q05_min"]),
            "q10_min": float(u["q10_min"]),
            "q50_min": float(u["q50_min"]),
            "q90_min": float(u["q90_min"]),
            "q95_min": float(u["q95_min"]),
            "calibration_errors_min": np.asarray(
                u["calibration_errors_min"], dtype=float
            ).round(6).tolist(),
        },
    }
    Path(path).write_text(json.dumps(artifact, separators=(",", ":")), encoding="utf-8")
    return artifact


def save_training_outputs(root: Path, n: int = 30000) -> dict[str, Any]:
    data_dir = root / "data"
    artifacts = root / "artifacts"
    data_dir.mkdir(parents=True, exist_ok=True)
    artifacts.mkdir(parents=True, exist_ok=True)
    df = generate_synthetic_shipments(n=n)
    df.to_csv(data_dir / "synthetic_shipments.csv", index=False)
    bundle, report = train_bundle(df)
    joblib.dump(bundle, artifacts / "eta_model_bundle.joblib", compress=3)
    export_runtime_artifact(bundle, artifacts / "eta_model.json")
    (artifacts / "evaluation.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    public_meta = {
        "synthetic_data": True,
        "training_rows": report["split"]["rows"],
        "model": report["model"],
        "baseline_definition": report["baseline_definition"],
        "metrics": {
            "ml": report["ml"],
            "baseline": report["baseline"],
            "lane_average_baseline": report["lane_average_baseline"],
            "improvement": report["improvement"],
        },
        "uncertainty": report["uncertainty"],
    }
    (artifacts / "model_card.json").write_text(
        json.dumps(public_meta, indent=2), encoding="utf-8"
    )
    return report


def load_bundle(path: str | Path) -> dict[str, Any]:
    return joblib.load(path)


def predict(
    bundle: dict[str, Any],
    *,
    origin: str,
    destination: str,
    depart_time: str,
    late_threshold_iso: str | None = None,
) -> dict[str, Any]:
    lane = f"{origin}|{destination}"
    if lane not in bundle["lane_profiles"]:
        raise ValueError(f"Unsupported lane: {lane}")
    depart = pd.Timestamp(depart_time)
    if depart.tzinfo is None:
        depart = depart.tz_localize("UTC")
    else:
        depart = depart.tz_convert("UTC")
    feat = _feature_row(origin, destination, depart, bundle["lane_profiles"])
    x = pd.DataFrame([{k: feat[k] for k in bundle["features"]}])
    correction = float(bundle["model"].predict(x)[0])
    baseline = float(feat["planned_transit_min"])
    point = baseline + correction
    u = bundle["uncertainty"]
    predicted_eta = depart + pd.Timedelta(minutes=point)
    low = depart + pd.Timedelta(minutes=point + float(u["q05_min"]))
    high = depart + pd.Timedelta(minutes=point + float(u["q95_min"]))
    p90_eta = depart + pd.Timedelta(minutes=point + float(u["q90_min"]))

    result: dict[str, Any] = {
        "synthetic_data": True,
        "lane": lane,
        "predicted_transit_min": round(point, 2),
        "baseline_transit_min": round(baseline, 2),
        "ml_adjustment_min": round(correction, 2),
        "predicted_eta": predicted_eta.isoformat(),
        "likely_range_90": {"low": low.isoformat(), "high": high.isoformat()},
        "p90_eta": p90_eta.isoformat(),
        "uncertainty_method": u["method"],
    }
    if late_threshold_iso:
        threshold = pd.Timestamp(late_threshold_iso)
        if threshold.tzinfo is None:
            threshold = threshold.tz_localize("UTC")
        else:
            threshold = threshold.tz_convert("UTC")
        needed_residual = (threshold - predicted_eta).total_seconds() / 60.0
        errors = np.asarray(u["calibration_errors_min"], dtype=float)
        result["late_threshold"] = threshold.isoformat()
        result["estimated_late_probability"] = round(
            float((errors > needed_residual).mean()), 4
        )
    return result


def explain_with_shap(
    bundle: dict[str, Any],
    *,
    origin: str,
    destination: str,
    depart_time: str,
    top_n: int = 6,
) -> dict[str, Any]:
    import shap

    depart = pd.Timestamp(depart_time)
    if depart.tzinfo is None:
        depart = depart.tz_localize("UTC")
    else:
        depart = depart.tz_convert("UTC")
    feat = _feature_row(origin, destination, depart, bundle["lane_profiles"])
    x = pd.DataFrame([{k: feat[k] for k in bundle["features"]}])
    explainer = shap.TreeExplainer(bundle["model"])
    values = np.asarray(explainer.shap_values(x)).reshape(-1)
    pairs = sorted(
        zip(bundle["features"], values),
        key=lambda kv: abs(kv[1]),
        reverse=True,
    )[:top_n]
    return {
        "method": "SHAP TreeExplainer",
        "base_residual_min": round(
            float(np.asarray(explainer.expected_value).reshape(-1)[0]), 3
        ),
        "contributions": [
            {
                "feature": name,
                "minutes": round(float(value), 3),
                "value": round(float(feat[name]), 5),
            }
            for name, value in pairs
        ],
    }
