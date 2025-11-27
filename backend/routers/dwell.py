from pathlib import Path
from typing import List, Optional

import pandas as pd
from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter()

DATA_DIR = Path(__file__).resolve().parents[1] / "data"

_DWELL: Optional[pd.DataFrame] = None
_LANES: Optional[pd.DataFrame] = None


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


def _load_lanes() -> pd.DataFrame:
    global _LANES
    if _LANES is None:
        path = DATA_DIR / "lane_averages.csv"
        if path.exists():
            _LANES = pd.read_csv(path)
        else:
            _LANES = pd.DataFrame(
                columns=["lane", "origin", "destination", "avg_transit_hours"]
            )
    return _LANES


def _risk_score(row) -> float:
    spread = float(row["p90_dwell_hours"] - row["p50_dwell_hours"])
    # basic scaling into 0–100
    score = 20.0 + spread * 4.0
    return float(max(0.0, min(100.0, score)))


class DwellLane(BaseModel):
    lane: str
    origin: Optional[str] = None
    destination: Optional[str] = None
    avg_dwell_hours: float
    p50_dwell_hours: float
    p90_dwell_hours: float
    avg_transit_hours: Optional[float] = None
    dwell_share: Optional[float] = None
    risk_score: float


@router.get("/top-risk", response_model=List[DwellLane])
def top_risk(top_n: int = 10):
    """
    Highest-risk lanes by dwell variability (p90 - p50), joined with transit.
    """
    dwell = _load_dwell()
    if dwell.empty:
        return []

    lanes = _load_lanes()
    merged = dwell.merge(lanes, on="lane", how="left")

    results: List[DwellLane] = []
    for _, r in merged.iterrows():
        transit = float(r["avg_transit_hours"]) if "avg_transit_hours" in r and not pd.isna(r["avg_transit_hours"]) else None
        dwell_hours = float(r["avg_dwell_hours"])
        total = dwell_hours + (transit or 0.0)
        dwell_share = dwell_hours / total if total and total > 0 else None

        results.append(
            DwellLane(
                lane=str(r["lane"]),
                origin=str(r.get("origin") or "") or None,
                destination=str(r.get("destination") or "") or None,
                avg_dwell_hours=dwell_hours,
                p50_dwell_hours=float(r["p50_dwell_hours"]),
                p90_dwell_hours=float(r["p90_dwell_hours"]),
                avg_transit_hours=transit,
                dwell_share=dwell_share,
                risk_score=_risk_score(r),
            )
        )

    results.sort(key=lambda x: x.risk_score, reverse=True)
    return results[:top_n]


@router.get("/sla-breaches", response_model=List[DwellLane])
def sla_breaches(sla_hours: float = 24.0):
    """
    Lanes where P90 dwell exceeds a dwell SLA.
    """
    dwell = _load_dwell()
    if dwell.empty:
        return []

    lanes = _load_lanes()
    merged = dwell.merge(lanes, on="lane", how="left")
    merged = merged[merged["p90_dwell_hours"] > sla_hours]

    out: List[DwellLane] = []
    for _, r in merged.iterrows():
        transit = float(r["avg_transit_hours"]) if "avg_transit_hours" in r and not pd.isna(r["avg_transit_hours"]) else None
        dwell_hours = float(r["avg_dwell_hours"])
        total = dwell_hours + (transit or 0.0)
        dwell_share = dwell_hours / total if total and total > 0 else None

        out.append(
            DwellLane(
                lane=str(r["lane"]),
                origin=str(r.get("origin") or "") or None,
                destination=str(r.get("destination") or "") or None,
                avg_dwell_hours=dwell_hours,
                p50_dwell_hours=float(r["p50_dwell_hours"]),
                p90_dwell_hours=float(r["p90_dwell_hours"]),
                avg_transit_hours=transit,
                dwell_share=dwell_share,
                risk_score=_risk_score(r),
            )
        )

    out.sort(key=lambda x: x.p90_dwell_hours, reverse=True)
    return out
