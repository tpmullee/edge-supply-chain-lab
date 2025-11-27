from pathlib import Path
from typing import List

import json
from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter()

DATA_DIR = Path(__file__).resolve().parents[1] / "data"
BOARD_PATH = DATA_DIR / "board_daily.json"
OPS_PATH = DATA_DIR / "ops_health.json"


class BoardDaily(BaseModel):
    date: str
    headline: str
    highlights: List[str]
    actions: List[str]


class OpsHealth(BaseModel):
    eta_mae_minutes: float
    dwell_sla_pct: float
    inventory_service_level_pct: float
    emissions_intensity_kg_per_ton_km: float
    last_updated: str


@router.get("/board-daily", response_model=BoardDaily)
def board_daily():
    if not BOARD_PATH.exists():
        return BoardDaily(
            date="2024-01-10",
            headline="Network stable with emerging dwell risk on DFW–MIA.",
            highlights=[
                "ETA MAE holding at ~45 minutes across primary lanes.",
                "3 lanes breaching dwell SLA (>24h P90).",
                "Inventory service level at 96.5% with slightly elevated safety stock.",
            ],
            actions=[
                "Deep-dive DFW–MIA dwell drivers and confirm yard resourcing.",
                "Pilot tighter ETA alerts on lanes with >60 min error.",
                "Review safety-stock impact of new dwell assumptions.",
            ],
        )

    with BOARD_PATH.open() as f:
        raw = json.load(f)
    return BoardDaily(**raw)


@router.get("/health", response_model=OpsHealth)
def ops_health():
    if not OPS_PATH.exists():
        return OpsHealth(
            eta_mae_minutes=45.0,
            dwell_sla_pct=92.0,
            inventory_service_level_pct=96.5,
            emissions_intensity_kg_per_ton_km=0.12,
            last_updated="2024-01-10T04:00:00Z",
        )

    with OPS_PATH.open() as f:
        raw = json.load(f)
    return OpsHealth(**raw)
