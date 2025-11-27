from math import isnan, isinf
from typing import Any

def safe_float(x: Any, default: float | None = None) -> float | None:
    try:
        v = float(x)
    except Exception:
        return default
    if isnan(v) or isinf(v):
        return default
    return v
