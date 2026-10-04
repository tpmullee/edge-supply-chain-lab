from __future__ import annotations

import json
from pathlib import Path

from src.runtime import load_runtime_artifact, predict_runtime

_ARTIFACT = None


def _artifact():
    global _ARTIFACT
    if _ARTIFACT is None:
        _ARTIFACT = load_runtime_artifact(Path(__file__).resolve().parent / "artifacts" / "eta_model.json")
    return _ARTIFACT


def handler(event, context=None):
    """Dependency-light API Gateway-compatible inference handler."""
    try:
        raw = event.get("body", event) if isinstance(event, dict) else event
        if isinstance(raw, str):
            raw = json.loads(raw)
        payload = raw or {}
        result = predict_runtime(
            _artifact(),
            origin=payload["origin"],
            destination=payload["destination"],
            depart_time=payload["depart_time"],
            late_threshold_iso=payload.get("late_threshold_iso"),
        )
        return {
            "statusCode": 200,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps(result),
        }
    except (KeyError, ValueError, TypeError, json.JSONDecodeError) as exc:
        return {
            "statusCode": 400,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps({"error": str(exc)}),
        }
