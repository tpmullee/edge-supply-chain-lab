import math
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from src.eta_ml import FEATURES, chronological_split, generate_synthetic_shipments, predict, train_bundle


def test_generator_is_deterministic_and_disclosed():
    a = generate_synthetic_shipments(300, seed=123)
    b = generate_synthetic_shipments(300, seed=123)
    assert a.equals(b)
    assert a["synthetic"].all()
    assert set(FEATURES).issubset(a.columns)
    assert (a["actual_transit_min"] > 0).all()


def test_chronological_split_is_forward_looking():
    df = generate_synthetic_shipments(1000, seed=99)
    train, calib, test = chronological_split(df)
    assert train["depart_time"].max() < calib["depart_time"].min()
    assert calib["depart_time"].max() < test["depart_time"].min()


def test_model_beats_heuristic_on_held_out_future_data():
    df = generate_synthetic_shipments(5000, seed=20261004)
    _, report = train_bundle(df)
    assert report["ml"]["mae_min"] < report["baseline"]["mae_min"]
    assert report["ml"]["within_60_min_pct"] > report["baseline"]["within_60_min_pct"]


def test_prediction_has_real_interval_and_probability():
    df = generate_synthetic_shipments(5000, seed=20261004)
    bundle, _ = train_bundle(df)
    result = predict(
        bundle,
        origin="ORD",
        destination="LAX",
        depart_time="2026-10-09T13:00:00Z",
        late_threshold_iso="2026-10-11T14:00:00Z",
    )
    assert result["synthetic_data"] is True
    assert result["likely_range_90"]["low"] < result["likely_range_90"]["high"]
    assert 0 <= result["estimated_late_probability"] <= 1
    assert math.isfinite(result["ml_adjustment_min"])


def test_grouped_shap_explanations_reconcile_to_model_correction():
    from src.eta_ml import explain_with_shap

    df = generate_synthetic_shipments(5000, seed=20261004)
    bundle, _ = train_bundle(df)
    explanation = explain_with_shap(
        bundle,
        origin="ORD",
        destination="LAX",
        depart_time="2026-10-09T13:00:00Z",
    )
    assert explanation["method"] == "SHAP TreeExplainer"
    assert len(explanation["grouped_contributions"]) >= 5
    assert abs(explanation["reconciliation"]["difference_vs_model_min"]) < 0.01
