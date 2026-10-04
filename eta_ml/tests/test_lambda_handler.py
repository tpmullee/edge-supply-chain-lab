from pathlib import Path
import json
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from lambda_handler import handler


def test_lambda_handler_serves_v1_contract_after_training_artifact_exists():
    response = handler({
        "body": json.dumps({
            "origin": "ORD",
            "destination": "LAX",
            "depart_time": "2026-10-09T13:00:00Z",
            "late_threshold_iso": "2026-10-11T14:00:00Z"
        })
    })
    assert response["statusCode"] == 200
    body = json.loads(response["body"])
    assert body["synthetic_data"] is True
    assert body["model_version"] == "eta-gbr-2026-10-04-v1"
    assert body["likely_range_90"]["low"] < body["likely_range_90"]["high"]
    assert 0 <= body["estimated_late_probability"] <= 1


def test_lambda_handler_rejects_unknown_lane():
    response = handler({
        "body": json.dumps({
            "origin": "ORD",
            "destination": "MIA",
            "depart_time": "2026-10-09T13:00:00Z"
        })
    })
    assert response["statusCode"] == 400
