from datetime import datetime
from pathlib import Path
from typing import List

import json
from fastapi import APIRouter
from pydantic import BaseModel, Field

router = APIRouter()

DATA_DIR = Path(__file__).resolve().parents[1] / "data"
KEYS_PATH = DATA_DIR / "api_keys.json"


class SignupRequest(BaseModel):
    email: str
    # Pydantic v2: use `pattern` instead of `regex`
    plan: str = Field("free", pattern="^(free|growth|enterprise)$")


class SignupResponse(BaseModel):
    api_key: str
    plan: str


class ApiKeyMeta(BaseModel):
    email: str
    plan: str
    api_key: str
    created_at: str


class SampleRequest(BaseModel):
    label: str
    language: str
    snippet: str


def _load_keys() -> List[ApiKeyMeta]:
    if not KEYS_PATH.exists():
        return []
    with KEYS_PATH.open() as f:
        raw = json.load(f)
    return [ApiKeyMeta(**r) for r in raw]


def _save_keys(keys: List[ApiKeyMeta]) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with KEYS_PATH.open("w") as f:
        json.dump([k.model_dump() for k in keys], f, indent=2)


@router.post("/signup", response_model=SignupResponse)
def signup(req: SignupRequest):
    import secrets

    keys = _load_keys()
    key = secrets.token_hex(16)
    meta = ApiKeyMeta(
        email=req.email,
        plan=req.plan,
        api_key=key,
        created_at=datetime.utcnow().isoformat() + "Z",
    )
    keys.append(meta)
    _save_keys(keys)
    return SignupResponse(api_key=key, plan=req.plan)


@router.get("/keys", response_model=List[ApiKeyMeta])
def list_keys():
    return _load_keys()


@router.get("/sample-requests", response_model=List[SampleRequest])
def sample_requests():
    base = "https://edge-scv.example.com"  # illustrative only
    return [
        SampleRequest(
            label="ETA prediction (curl)",
            language="bash",
            snippet=(
                "curl -X POST "
                "-H 'Content-Type: application/json' "
                "-H 'x-api-key: YOUR_KEY' "
                f"'{base}/eta/predict' "
                "--data '{\"distance_km\": 800, \"hour_of_day\": 9, \"day_of_week\": 1}'"
            ),
        ),
        SampleRequest(
            label="Dwell risk (curl)",
            language="bash",
            snippet=(
                "curl -H 'x-api-key: YOUR_KEY' "
                f"'{base}/dwell/top-risk?top_n=5'"
            ),
        ),
        SampleRequest(
            label="Emissions batch (Python)",
            language="python",
            snippet=(
                "import requests\n"
                f"url = '{base}/emissions/shipments'\n"
                "payload = {\"shipments\": [{\"mode\": \"truck\", \"distance_km\": 800, \"weight_kg\": 12000}]}\n"
                "r = requests.post(url, json=payload, headers={\"x-api-key\": \"YOUR_KEY\"})\n"
                "print(r.json())"
            ),
        ),
    ]
