from pathlib import Path
from typing import List, Optional

import pandas as pd
from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter()

DATA_DIR = Path(__file__).resolve().parents[1] / "data"

_STORES: Optional[pd.DataFrame] = None
_SEGMENTS: Optional[pd.DataFrame] = None
_DWELL: Optional[pd.DataFrame] = None


def _load_stores() -> pd.DataFrame:
    global _STORES
    if _STORES is None:
        path = DATA_DIR / "stores_sample.csv"
        if path.exists():
            _STORES = pd.read_csv(path)
        else:
            _STORES = pd.DataFrame(columns=["store_name", "state"])
    return _STORES


def _load_segments() -> pd.DataFrame:
    global _SEGMENTS
    if _SEGMENTS is None:
        path = DATA_DIR / "segments_sample.csv"
        if path.exists():
            _SEGMENTS = pd.read_csv(path)
        else:
            _SEGMENTS = pd.DataFrame(
                columns=[
                    "lane",
                    "segment_id",
                    "origin_node",
                    "dest_node",
                    "avg_transit_hours",
                    "p90_transit_hours",
                ]
            )
    return _SEGMENTS


def _load_dwell() -> pd.DataFrame:
    global _DWELL
    if _DWELL is None:
        path = DATA_DIR / "dwell_stats.csv"
        if path.exists():
            _DWELL = pd.read_csv(path)
        else:
            _DWELL = pd.DataFrame(
                columns=["lane", "avg_dwell_hours", "p50_dwell_hours", "p90_dwell_hours"]
            )
    return _DWELL


class StateCoverage(BaseModel):
    state: str
    store_count: int


class SegmentStat(BaseModel):
    lane: str
    segment_id: str
    origin_node: str
    dest_node: str
    avg_transit_hours: float
    p90_transit_hours: float


class DwellHotspot(BaseModel):
    lane: str
    avg_dwell_hours: float
    p90_dwell_hours: float
    risk_score: float


def _risk(row) -> float:
    spread = float(row["p90_dwell_hours"] - row["p50_dwell_hours"])
    return max(0.0, min(100.0, 20.0 + spread * 4.0))


@router.get("/state-coverage", response_model=List[StateCoverage])
def state_coverage():
    stores = _load_stores()
    if stores.empty:
        return []
    grouped = stores.groupby("state")["store_name"].count().reset_index()
    grouped.columns = ["state", "store_count"]
    grouped = grouped.sort_values("store_count", ascending=False)

    return [
        StateCoverage(state=str(r["state"]), store_count=int(r["store_count"]))
        for _, r in grouped.iterrows()
    ]


@router.get("/slow-segments", response_model=List[SegmentStat])
def slow_segments(top_n: int = 10):
    """
    Slowest segments by P90 transit.
    """
    segs = _load_segments()
    if segs.empty:
        return []
    segs = segs.sort_values("p90_transit_hours", ascending=False).head(top_n)

    return [
        SegmentStat(
            lane=str(r["lane"]),
            segment_id=str(r["segment_id"]),
            origin_node=str(r["origin_node"]),
            dest_node=str(r["dest_node"]),
            avg_transit_hours=float(r["avg_transit_hours"]),
            p90_transit_hours=float(r["p90_transit_hours"]),
        )
        for _, r in segs.iterrows()
    ]


@router.get("/dwell-hotspots", response_model=List[DwellHotspot])
def dwell_hotspots(top_n: int = 10):
    dwell = _load_dwell()
    if dwell.empty:
        return []
    dwell = dwell.sort_values("p90_dwell_hours", ascending=False).head(top_n)

    return [
        DwellHotspot(
            lane=str(r["lane"]),
            avg_dwell_hours=float(r["avg_dwell_hours"]),
            p90_dwell_hours=float(r["p90_dwell_hours"]),
            risk_score=_risk(r),
        )
        for _, r in dwell.iterrows()
    ]
