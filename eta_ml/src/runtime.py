from __future__ import annotations

import json
import math
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any


def load_runtime_artifact(path: str | Path) -> dict[str, Any]:
    return json.loads(Path(path).read_text(encoding="utf-8"))


def _parse_iso(value: str) -> datetime:
    dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _iso(dt: datetime) -> str:
    return dt.isoformat().replace("+00:00", "Z")


def _feature_row(artifact: dict[str, Any], origin: str, destination: str, depart: datetime) -> dict[str, float]:
    lane = f"{origin}|{destination}"
    lp = artifact["lane_profiles"][lane]
    facilities = artifact["facility_profiles"]
    o, d = facilities[origin], facilities[destination]
    hour = depart.hour + depart.minute / 60.0
    dow = depart.weekday()
    destination_p90 = d["dwell"] + 1.28 * (30 + 70 * d["congestion"])
    peak = float(6.5 <= hour <= 9.5 or 15.5 <= hour <= 19.0)
    winter = float(depart.month in (12, 1, 2))
    northern = {"ORD", "EWR", "DEN", "SEA"}
    b = artifact["baseline"]
    baseline = lp["distance_miles"] / b["assumed_effective_speed_mph"] * 60.0 + b["fixed_dwell_min"]
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


def _tree_predict(tree: dict[str, Any], x: list[float]) -> float:
    node = 0
    while tree["children_left"][node] != -1:
        feature = tree["feature"][node]
        threshold = tree["threshold"][node]
        node = tree["children_left"][node] if x[feature] <= threshold else tree["children_right"][node]
    return tree["value"][node]


def _model_correction(artifact: dict[str, Any], feature_map: dict[str, float]) -> float:
    x = [feature_map[name] for name in artifact["features"]]
    model = artifact["model"]
    raw = model["init"]
    for tree in model["trees"]:
        raw += model["learning_rate"] * _tree_predict(tree, x)
    return raw


def predict_runtime(
    artifact: dict[str, Any],
    *,
    origin: str,
    destination: str,
    depart_time: str,
    late_threshold_iso: str | None = None,
) -> dict[str, Any]:
    lane = f"{origin}|{destination}"
    if lane not in artifact["lane_profiles"]:
        raise ValueError(f"Unsupported lane: {lane}")
    depart = _parse_iso(depart_time)
    feat = _feature_row(artifact, origin, destination, depart)
    correction = _model_correction(artifact, feat)
    baseline = feat["planned_transit_min"]
    point = baseline + correction
    uncertainty = artifact["uncertainty"]
    predicted_eta = depart + timedelta(minutes=point)
    low = predicted_eta + timedelta(minutes=uncertainty["q05_min"])
    high = predicted_eta + timedelta(minutes=uncertainty["q95_min"])
    p90 = predicted_eta + timedelta(minutes=uncertainty["q90_min"])
    result = {
        "synthetic_data": True,
        "lane": lane,
        "model_version": artifact["model_version"],
        "predicted_transit_min": round(point, 2),
        "baseline_transit_min": round(baseline, 2),
        "ml_adjustment_min": round(correction, 2),
        "predicted_eta": _iso(predicted_eta),
        "likely_range_90": {"low": _iso(low), "high": _iso(high)},
        "p90_eta": _iso(p90),
        "uncertainty_method": uncertainty["method"],
    }
    if late_threshold_iso:
        threshold = _parse_iso(late_threshold_iso)
        needed = (threshold - predicted_eta).total_seconds() / 60.0
        errors = uncertainty["calibration_errors_min"]
        result["late_threshold"] = _iso(threshold)
        result["estimated_late_probability"] = round(sum(e > needed for e in errors) / len(errors), 4)
    return result
