from fastapi import APIRouter
from pydantic import BaseModel, Field
import numpy as np

router = APIRouter()


class InventoryParams(BaseModel):
    s: int = Field(..., ge=0)
    S: int = Field(..., ge=1)
    days: int = 365
    mu: float = 20.0
    sigma: float = 4.0
    lead: int = 2
    hold: float = 1.0
    stockout: float = 5.0
    order_cost: float = 20.0


class Result(BaseModel):
    avg_cost: float
    service_level: float
    orders: int


def simulate(p: InventoryParams):
    rng = np.random.default_rng(0)

    inv = p.S
    pipeline = [0] * p.lead
    cost = 0
    total_demand = 0
    lost = 0
    orders = 0

    for _ in range(p.days):
        arrive = pipeline.pop(0) if p.lead > 0 else 0
        inv += arrive
        pipeline.append(0)

        if inv <= p.s:
            qty = p.S - inv
            if p.lead > 0:
                pipeline[-1] += qty
            else:
                inv += qty
            cost += p.order_cost
            orders += 1

        demand = max(0, int(rng.normal(p.mu, p.sigma)))
        total_demand += demand

        sold = min(inv, demand)
        inv -= sold
        lost_d = demand - sold
        lost += lost_d

        cost += p.hold * inv + p.stockout * lost_d

    avg_cost = cost / p.days
    sl = 1 - (lost / total_demand)

    return avg_cost, sl, orders


@router.post("/simulate", response_model=Result)
def simulate_policy(p: InventoryParams):
    avg, sl, orders = simulate(p)
    return Result(avg_cost=avg, service_level=sl, orders=orders)
