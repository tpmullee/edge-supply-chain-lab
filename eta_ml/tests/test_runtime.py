from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from src.eta_ml import export_runtime_artifact, generate_synthetic_shipments, predict, train_bundle
from src.runtime import load_runtime_artifact, predict_runtime


def test_json_runtime_matches_sklearn(tmp_path):
    df = generate_synthetic_shipments(5000, seed=20261004)
    bundle, _ = train_bundle(df)
    path = tmp_path / "eta_model.json"
    export_runtime_artifact(bundle, path)
    artifact = load_runtime_artifact(path)
    kwargs = dict(
        origin="ORD",
        destination="LAX",
        depart_time="2026-10-09T13:00:00Z",
        late_threshold_iso="2026-10-11T14:00:00Z",
    )
    a = predict(bundle, **kwargs)
    b = predict_runtime(artifact, **kwargs)
    assert abs(a["predicted_transit_min"] - b["predicted_transit_min"]) < 0.01
    assert a["estimated_late_probability"] == b["estimated_late_probability"]
