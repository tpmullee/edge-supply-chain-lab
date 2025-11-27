from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routers import (
    eta_model,
    eta_eval,
    inventory,
    network,
    emissions,
    dwell,
    tms,
    devportal,
    ops,
    data_quality,
    vrp,
)

app = FastAPI(
    title="EDGE Supply Chain Lab",
    version="0.3.0",
    description=(
        "Supply chain analytics lab: ETA, dwell, inventory, network, "
        "routing, data quality, emissions, and APIs."
    ),
)

# Allow local dev frontends (Vite)
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Core analytics modules
app.include_router(eta_model.router, prefix="/eta", tags=["ETA Model"])
app.include_router(eta_eval.router, prefix="/eta-eval", tags=["ETA Evaluation"])
app.include_router(inventory.router, prefix="/inventory", tags=["Inventory"])
app.include_router(network.router, prefix="/network", tags=["Network & Segments"])
app.include_router(emissions.router, prefix="/emissions", tags=["Emissions & API Economics"])

# Operational risk & ETL
app.include_router(dwell.router, prefix="/dwell", tags=["Dwell & Terminal Risk"])
app.include_router(tms.router, prefix="/tms", tags=["TMS Data & Pipelines"])
app.include_router(data_quality.router, prefix="/data-quality", tags=["Data Quality"])

# Optimization & developer experience
app.include_router(vrp.router, prefix="/vrp", tags=["Routing & Fleet"])
app.include_router(devportal.router, prefix="/devportal", tags=["Developer Portal"])
app.include_router(ops.router, prefix="/ops", tags=["Exec Board"])


@app.get("/healthz")
def healthz():
    return {"ok": True}
