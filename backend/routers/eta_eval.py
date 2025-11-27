from typing import List
from fastapi import APIRouter, UploadFile, HTTPException
import pandas as pd
from io import BytesIO

router = APIRouter()

_ETAS = None
_ARR = None


def _read_csv(file_bytes: bytes):
    try:
        return pd.read_csv(BytesIO(file_bytes))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"CSV parsing error: {e}")


@router.post("/upload/etas")
async def upload_etas(file: UploadFile):
    global _ETAS
    df = _read_csv(await file.read())

    required = {"load_id", "predicted_at", "eta_predicted"}
    if not required.issubset(df.columns):
        raise HTTPException(status_code=400, detail=f"Missing columns: {required}")

    _ETAS = df
    return {"rows": len(df)}


@router.post("/upload/arrivals")
async def upload_arrivals(file: UploadFile):
    global _ARR
    df = _read_csv(await file.read())

    required = {"load_id", "actual_arrival"}
    if not required.issubset(df.columns):
        raise HTTPException(status_code=400, detail=f"Missing columns: {required}")

    _ARR = df
    return {"rows": len(df)}


@router.post("/evaluate")
def evaluate():
    if _ETAS is None or _ARR is None:
        raise HTTPException(status_code=400, detail="Upload ETA + arrivals first.")

    et = _ETAS.copy()
    ar = _ARR.copy()

    et["predicted_at"] = pd.to_datetime(et["predicted_at"])
    et["eta_predicted"] = pd.to_datetime(et["eta_predicted"])
    ar["actual_arrival"] = pd.to_datetime(ar["actual_arrival"])

    df = pd.merge(et, ar, on="load_id", how="inner")
    df["err_min"] = (df["eta_predicted"] - df["actual_arrival"]).dt.total_seconds() / 60.0
    df["abs_err"] = df["err_min"].abs()

    summary = {
        "rows": len(df),
        "bias_min": df["err_min"].mean(),
        "p50": df["abs_err"].quantile(0.5),
        "p90": df["abs_err"].quantile(0.9),
    }

    return {"summary": summary}
