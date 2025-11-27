from pathlib import Path
from typing import Optional, List

import numpy as np
import pandas as pd
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_error
from sklearn.model_selection import train_test_split

router = APIRouter()

_MODEL: Optional[RandomForestRegressor] = None
_MAE: Optional[float] = None

_LANES: Optional[pd.DataFrame] = None
_DWELL: Optional[pd.DataFrame] = None

DATA_DIR = Path(__file__).resolve().parents[1] / "data"


# ---------- helpers ----------


def _load_lanes() -> pd.DataFrame:
    global _LANES
    if _LANES is None:
        path = DATA_DIR / "lane_averages.csv"
        if path.exists():
            _LANES = pd.read_csv(path)
        else:
            # empty but well-formed
            _LANES = pd.DataFrame(
                columns=["lane", "origin", "destination", "avg_transit_hours"]
            )
    return _LANES


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


def _generate_synthetic(n_samples: int, random_state: int):
    rng = np.random.RandomState(random_state)

    distance = rng.uniform(50, 2500, size=n_samples)  # km
    hour = rng.randint(0, 24, size=n_samples)
    dow = rng.randint(0, 7, size=n_samples)

    base_speed = rng.uniform(60, 90, size=n_samples)  # km/h
    transit_hours = distance / base_speed

    rush = (hour >= 15) & (hour <= 19)
    weekend = (dow == 0) | (dow == 6)

    transit_hours *= 1 + 0.15 * rush + 0.1 * weekend

    noise = rng.normal(0, 0.4, size=n_samples)  # ~24 min std dev
    eta_hours = transit_hours + noise

    y = eta_hours * 3600.0  # seconds
    X = np.vstack([distance, hour, dow]).T
    return X, y


def _train_model(cfg: "TrainConfig"):
    X, y = _generate_synthetic(cfg.n_samples, cfg.random_state)
    X_tr, X_te, y_tr, y_te = train_test_split(
        X, y, test_size=cfg.test_size, random_state=cfg.random_state
    )
    model = RandomForestRegressor(
        n_estimators=200, max_depth=12, random_state=cfg.random_state
    )
    model.fit(X_tr, y_tr)
    pred = model.predict(X_te)
    mae = float(mean_absolute_error(y_te, pred))
    return model, mae


# ---------- models ----------


class TrainConfig(BaseModel):
    n_samples: int = Field(3000, ge=500, le=20000)
    test_size: float = Field(0.2, ge=0.1, le=0.4)
    random_state: int = 42


class TrainResult(BaseModel):
    mae_seconds: float
    n_samples: int


class EtaRequest(BaseModel):
    distance_km: float = Field(..., gt=0)
    hour_of_day: int = Field(..., ge=0, le=23)
    day_of_week: int = Field(..., ge=0, le=6)


class EtaResponse(BaseModel):
    eta_seconds: float
    eta_minutes: float


class LaneInfo(BaseModel):
    lane: str
    origin: str
    destination: str
    avg_transit_hours: float


class CompareRequest(BaseModel):
    lane: Optional[str] = None
    distance_km: float = Field(..., gt=0)
    hour_of_day: int = Field(..., ge=0, le=23)
    day_of_week: int = Field(..., ge=0, le=6)


class CompareBreakdown(BaseModel):
    label: str
    eta_minutes: float
    notes: Optional[str] = None


class CompareResponse(BaseModel):
    lane: Optional[str]
    baseline_eta_minutes: Optional[float]
    ml_eta_minutes: float
    naive_eta_minutes: float
    breakdown: List[CompareBreakdown]


class DoorToDoorRequest(BaseModel):
    lane: str
    distance_km: float = Field(..., gt=0)
    hour_of_day: int = Field(..., ge=0, le=23)
    day_of_week: int = Field(..., ge=0, le=6)


class DoorToDoorResponse(BaseModel):
    lane: str
    transit_hours: float
    dwell_hours: float
    total_hours: float
    dwell_share: float


# ---------- routes ----------


@router.post("/train", response_model=TrainResult)
def train_eta(cfg: TrainConfig):
    global _MODEL, _MAE
    _MODEL, _MAE = _train_model(cfg)
    return TrainResult(mae_seconds=_MAE, n_samples=cfg.n_samples)


@router.post("/predict", response_model=EtaResponse)
def predict_eta(req: EtaRequest):
    if _MODEL is None:
        raise HTTPException(status_code=400, detail="Train model first via /eta/train.")

    X = np.array([[req.distance_km, req.hour_of_day, req.day_of_week]])
    secs = float(_MODEL.predict(X)[0])
    return EtaResponse(eta_seconds=secs, eta_minutes=secs / 60.0)


@router.get("/lanes", response_model=List[LaneInfo])
def list_lanes():
    lanes = _load_lanes()
    if lanes.empty:
        return []
    rows = []
    for _, r in lanes.iterrows():
        rows.append(
            LaneInfo(
                lane=str(r["lane"]),
                origin=str(r["origin"]),
                destination=str(r["destination"]),
                avg_transit_hours=float(r["avg_transit_hours"]),
            )
        )
    return rows


@router.post("/compare", response_model=CompareResponse)
def compare_eta(req: CompareRequest):
    """
    Compare three ETA strategies:
    - naive: simple km / 60 kmh
    - baseline: lane-average transit (if lane is provided and known)
    - ml: RandomForest ETA model
    """
    if _MODEL is None:
        raise HTTPException(status_code=400, detail="Train model first via /eta/train.")

    # naive ETA
    naive_hours = req.distance_km / 60.0
    naive_minutes = naive_hours * 60.0

    # ml ETA
    ml_secs = float(
        _MODEL.predict(
            np.array([[req.distance_km, req.hour_of_day, req.day_of_week]])
        )[0]
    )
    ml_minutes = ml_secs / 60.0

    # baseline from lane averages
    baseline_minutes: Optional[float] = None
    if req.lane:
        lanes = _load_lanes()
        row = lanes[lanes["lane"] == req.lane].head(1)
        if not row.empty:
            baseline_minutes = float(row.iloc[0]["avg_transit_hours"]) * 60.0

    breakdown = [
        CompareBreakdown(label="Naive distance / 60 kmh", eta_minutes=naive_minutes),
        CompareBreakdown(label="RandomForest ETA model", eta_minutes=ml_minutes),
    ]
    if baseline_minutes is not None:
        breakdown.insert(
            1,
            CompareBreakdown(
                label="Lane-average baseline", eta_minutes=baseline_minutes
            ),
        )

    return CompareResponse(
        lane=req.lane,
        baseline_eta_minutes=baseline_minutes,
        ml_eta_minutes=ml_minutes,
        naive_eta_minutes=naive_minutes,
        breakdown=breakdown,
    )


@router.post("/door-to-door", response_model=DoorToDoorResponse)
def door_to_door(req: DoorToDoorRequest):
    """
    Combine transit ETA with lane dwell to get door-to-door lead time.
    """
    if _MODEL is None:
        raise HTTPException(status_code=400, detail="Train model first via /eta/train.")

    # transit from model
    ml_secs = float(
        _MODEL.predict(
            np.array([[req.distance_km, req.hour_of_day, req.day_of_week]])
        )[0]
    )
    transit_hours = ml_secs / 3600.0

    # dwell from stats
    dwell_df = _load_dwell()
    row = dwell_df[dwell_df["lane"] == req.lane].head(1)
    dwell_hours = float(row.iloc[0]["avg_dwell_hours"]) if not row.empty else 0.0

    total = transit_hours + dwell_hours
    dwell_share = dwell_hours / total if total > 0 else 0.0

    return DoorToDoorResponse(
        lane=req.lane,
        transit_hours=transit_hours,
        dwell_hours=dwell_hours,
        total_hours=total,
        dwell_share=dwell_share,
    )
