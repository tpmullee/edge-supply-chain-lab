from typing import Literal, List

from fastapi import APIRouter
from pydantic import BaseModel, Field

router = APIRouter()

EM_FACTOR = {
    "truck": 0.15,
    "rail": 0.03,
    "ocean": 0.01,
    "air": 0.5,
}


class Shipment(BaseModel):
    mode: Literal["truck", "rail", "ocean", "air"]
    distance_km: float = Field(..., gt=0)
    weight_kg: float = Field(..., gt=0)


class ShipmentWithCO2(Shipment):
    co2_kg: float


class EmissionsResult(BaseModel):
    total_co2_kg: float
    shipments: List[ShipmentWithCO2]


@router.post("/shipments", response_model=EmissionsResult)
def calc_shipments(shipments: List[Shipment]):
    total = 0.0
    out: List[ShipmentWithCO2] = []

    for s in shipments:
        ton_km = (s.weight_kg / 1000.0) * s.distance_km
        co2 = EM_FACTOR[s.mode] * ton_km
        total += co2
        out.append(ShipmentWithCO2(**s.dict(), co2_kg=co2))

    return EmissionsResult(total_co2_kg=total, shipments=out)


# ---------- API economics ----------


class ApiUsageItem(BaseModel):
    name: Literal["eta", "dwell", "emissions"]
    monthly_calls: int = Field(..., ge=0)


class ApiEconomicsItem(BaseModel):
    name: str
    monthly_calls: int
    revenue_usd: float
    cost_usd: float
    gross_margin_pct: float


class ApiEconomicsResponse(BaseModel):
    items: List[ApiEconomicsItem]
    total_revenue_usd: float
    total_cost_usd: float
    total_gross_margin_pct: float


API_PRICING = {
    "eta": {"price_per_1k": 10.0, "cost_per_1k": 2.0},
    "dwell": {"price_per_1k": 8.0, "cost_per_1k": 1.5},
    "emissions": {"price_per_1k": 6.0, "cost_per_1k": 1.0},
}


@router.post("/api-economics", response_model=ApiEconomicsResponse)
def api_economics(apis: List[ApiUsageItem]):
    items: List[ApiEconomicsItem] = []
    total_rev = 0.0
    total_cost = 0.0

    for a in apis:
        cfg = API_PRICING[a.name]
        units = a.monthly_calls / 1000.0
        rev = units * cfg["price_per_1k"]
        cost = units * cfg["cost_per_1k"]
        gm_pct = 0.0 if rev == 0 else (rev - cost) / rev * 100.0

        total_rev += rev
        total_cost += cost

        items.append(
            ApiEconomicsItem(
                name=a.name,
                monthly_calls=a.monthly_calls,
                revenue_usd=rev,
                cost_usd=cost,
                gross_margin_pct=gm_pct,
            )
        )

    gm_total = 0.0 if total_rev == 0 else (total_rev - total_cost) / total_rev * 100.0

    return ApiEconomicsResponse(
        items=items,
        total_revenue_usd=total_rev,
        total_cost_usd=total_cost,
        total_gross_margin_pct=gm_total,
    )
