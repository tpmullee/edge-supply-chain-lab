from datetime import datetime
from io import BytesIO
from pathlib import Path
from typing import Dict, List

import pandas as pd
from fastapi import APIRouter, File, HTTPException, UploadFile
from pydantic import BaseModel

router = APIRouter()

DATA_DIR = Path(__file__).resolve().parents[1] / "data"
MANIFEST_PATH = DATA_DIR / "manifest_sample.json"


class NormalizedSummary(BaseModel):
    n_rows: int
    n_columns: int
    columns: List[str]
    missing_by_column: Dict[str, int]
    has_required_fields: bool
    metrics: Dict[str, float]


class ManifestEntry(BaseModel):
    file_name: str
    last_hash: str
    last_processed_at: str
    changed: bool


class PipelineSummary(BaseModel):
    last_refresh_at: str
    raw_files: int
    curated_lanes: int
    curated_dwell: int
    mode: str


@router.post("/normalize", response_model=NormalizedSummary)
async def normalize(file: UploadFile = File(...)):
    """
    Basic "TMS Data Normalizer" – accepts a CSV and returns a quick
    data quality and readiness summary.
    """
    if not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="Please upload a CSV file.")

    content = await file.read()
    try:
        df = pd.read_csv(BytesIO(content))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Unable to parse CSV: {e}")

    df.columns = [c.strip() for c in df.columns]
    missing = {c: int(df[c].isna().sum()) for c in df.columns}

    cols_lower = {c.lower().replace(" ", "_"): c for c in df.columns}
    has_load = any(k in cols_lower for k in ["load_id", "load", "shipment_id"])
    has_stop = any(k in cols_lower for k in ["stop_id", "stop_sequence"])
    has_times = any(
        "arrival" in k or "departure" in k for k in cols_lower.keys()
    )

    metrics: Dict[str, float] = {}
    if has_load:
        col = cols_lower.get("load_id") or cols_lower.get("load") or cols_lower.get(
            "shipment_id"
        )
        metrics["unique_loads"] = float(df[col].nunique())
    if has_stop:
        col = cols_lower.get("stop_id") or cols_lower.get("stop_sequence")
        metrics["unique_stops"] = float(df[col].nunique())
    if "state" in cols_lower:
        col = cols_lower["state"]
        metrics["states_covered"] = float(df[col].nunique())

    has_required = has_load and has_stop and has_times

    return NormalizedSummary(
        n_rows=len(df),
        n_columns=len(df.columns),
        columns=list(df.columns),
        missing_by_column=missing,
        has_required_fields=has_required,
        metrics=metrics,
    )


@router.get("/sample-manifest", response_model=List[ManifestEntry])
def sample_manifest():
    """
    Simulated manifest showing what would be incrementally ingested.
    """
    if not MANIFEST_PATH.exists():
        # tiny default
        return [
            ManifestEntry(
                file_name="tms_loads_jan.csv",
                last_hash="abc123",
                last_processed_at="2024-01-10T04:00:00Z",
                changed=False,
            ),
            ManifestEntry(
                file_name="tms_loads_feb.csv",
                last_hash="def456",
                last_processed_at="2024-02-10T04:00:00Z",
                changed=True,
            ),
        ]

    import json

    with MANIFEST_PATH.open() as f:
        raw = json.load(f)
    return [ManifestEntry(**r) for r in raw]


@router.get("/pipeline-summary", response_model=PipelineSummary)
def pipeline_summary(mode: str = "sample"):
    """
    High-level curated pipeline view (RAW -> CURATED stats).
    Mode is just a label for now: 'sample' vs 'live'.
    """
    now = datetime.utcnow().isoformat() + "Z"

    # In a real system we'd compute this from S3; here we just simulate.
    return PipelineSummary(
        last_refresh_at=now,
        raw_files=3,
        curated_lanes=120,
        curated_dwell=95,
        mode=mode,
    )
