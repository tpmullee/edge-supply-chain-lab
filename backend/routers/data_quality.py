from typing import List, Optional, Literal

from fastapi import APIRouter, UploadFile, File, HTTPException
from pydantic import BaseModel, Field
from difflib import SequenceMatcher
import csv
import io

router = APIRouter()

# ---------------------------------------------------------------------------
# US state metadata
# ---------------------------------------------------------------------------

US_STATE_ABBR = {
    "AL": "Alabama",
    "AK": "Alaska",
    "AZ": "Arizona",
    "AR": "Arkansas",
    "CA": "California",
    "CO": "Colorado",
    "CT": "Connecticut",
    "DE": "Delaware",
    "FL": "Florida",
    "GA": "Georgia",
    "HI": "Hawaii",
    "ID": "Idaho",
    "IL": "Illinois",
    "IN": "Indiana",
    "IA": "Iowa",
    "KS": "Kansas",
    "KY": "Kentucky",
    "LA": "Louisiana",
    "ME": "Maine",
    "MD": "Maryland",
    "MA": "Massachusetts",
    "MI": "Michigan",
    "MN": "Minnesota",
    "MS": "Mississippi",
    "MO": "Missouri",
    "MT": "Montana",
    "NE": "Nebraska",
    "NV": "Nevada",
    "NH": "New Hampshire",
    "NJ": "New Jersey",
    "NM": "New Mexico",
    "NY": "New York",
    "NC": "North Carolina",
    "ND": "North Dakota",
    "OH": "Ohio",
    "OK": "Oklahoma",
    "OR": "Oregon",
    "PA": "Pennsylvania",
    "RI": "Rhode Island",
    "SC": "South Carolina",
    "SD": "South Dakota",
    "TN": "Tennessee",
    "TX": "Texas",
    "UT": "Utah",
    "VT": "Vermont",
    "VA": "Virginia",
    "WA": "Washington",
    "WV": "West Virginia",
    "WI": "Wisconsin",
    "WY": "Wyoming",
    "DC": "District of Columbia",
}
US_STATE_NAME_TO_ABBR = {v.lower(): k for k, v in US_STATE_ABBR.items()}


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------


class Address(BaseModel):
    street: str = Field(..., description="Street line including house number")
    city: str
    state: str
    postal_code: str
    country: str = Field("US", description="ISO country code, e.g., US")


class AddressValidationResult(BaseModel):
    normalized: Address
    status: Literal["valid", "warning", "invalid"]
    messages: List[str]


class NameRecord(BaseModel):
    full_name: Optional[str] = None
    first_name: Optional[str] = None
    middle_name: Optional[str] = None
    last_name: Optional[str] = None
    record_id: Optional[str] = None


class DedupeRequest(BaseModel):
    records: List[NameRecord]
    threshold: int = Field(90, ge=0, le=100)


class NameCluster(BaseModel):
    representative: str
    indices: List[int]
    members: List[NameRecord]


class DedupeResponse(BaseModel):
    clusters: List[NameCluster]
    unique_count: int
    total_records: int


# ---------------------------------------------------------------------------
# Address helpers
# ---------------------------------------------------------------------------


def _canonical_state(state: str) -> (str, List[str]):
    msgs: List[str] = []
    s = (state or "").strip()
    if not s:
        msgs.append("Missing state")
        return "", msgs

    upper = s.upper()
    if upper in US_STATE_ABBR:
        return upper, msgs

    # try full-name mapping
    abbr = US_STATE_NAME_TO_ABBR.get(s.lower())
    if abbr:
        msgs.append(f"Normalized state from '{s}' to '{abbr}'")
        return abbr, msgs

    msgs.append(f"Unrecognized state '{s}'")
    return s, msgs


def _validate_postal(code: str, country: str) -> (str, List[str], bool):
    msgs: List[str] = []
    normalized = (code or "").strip()
    ok = True

    if not normalized:
        msgs.append("Missing postal/ZIP code")
        ok = False
        return normalized, msgs, ok

    if country.upper() == "US":
        # accept 5 or 9 digit (with optional dash)
        digits = "".join(ch for ch in normalized if ch.isdigit())
        if len(digits) == 5:
            normalized = digits
        elif len(digits) == 9:
            normalized = f"{digits[:5]}-{digits[5:]}"
        else:
            msgs.append(f"ZIP '{code}' is not 5 or 9 digits")
            ok = False

    return normalized, msgs, ok


def _canonical_address(addr: Address) -> AddressValidationResult:
    msgs: List[str] = []
    status: Literal["valid", "warning", "invalid"] = "valid"

    state_norm, state_msgs = _canonical_state(addr.state)
    msgs.extend(state_msgs)

    postal_norm, postal_msgs, postal_ok = _validate_postal(
        addr.postal_code, addr.country
    )
    msgs.extend(postal_msgs)

    if state_msgs or not postal_ok:
        status = "warning" if postal_ok else "invalid"

    normalized = Address(
        street=addr.street.strip().title(),
        city=addr.city.strip().title(),
        state=state_norm,
        postal_code=postal_norm,
        country=addr.country.upper(),
    )
    return AddressValidationResult(normalized=normalized, status=status, messages=msgs)


# ---------------------------------------------------------------------------
# Name helpers
# ---------------------------------------------------------------------------


def _name_string(r: NameRecord) -> str:
    if r.full_name:
        return r.full_name.strip().lower()
    parts = []
    for p in (r.first_name, r.middle_name, r.last_name):
        if p:
            parts.append(p.strip().lower())
    return " ".join(parts)


def _similarity(a: str, b: str) -> float:
    if not a or not b:
        return 0.0
    return SequenceMatcher(None, a, b).ratio() * 100.0


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@router.post("/validate-address", response_model=AddressValidationResult)
def validate_address(addr: Address):
    """
    Lightweight address validation and standardization inspired by the USPS + Smarty
    lambda. This version is offline-friendly and focuses on basic structure and
    normalization rather than calling third-party APIs.
    """
    return _canonical_address(addr)


@router.post("/dedupe-names", response_model=DedupeResponse)
def dedupe_names(req: DedupeRequest):
    """
    Approximate duplicate name detection using fuzzy matching on full names.
    Inspired by the Edge Data Validation duplicate_name_detector.
    """
    n = len(req.records)
    if n == 0:
        return DedupeResponse(clusters=[], unique_count=0, total_records=0)

    strings = [_name_string(r) for r in req.records]
    visited = [False] * n
    clusters: List[NameCluster] = []

    for i in range(n):
        if visited[i]:
            continue
        visited[i] = True
        base = strings[i]
        group_indices = [i]
        members = [req.records[i]]

        # one-pass simple clustering: attach records similar to first in group
        for j in range(i + 1, n):
            if visited[j]:
                continue
            score = _similarity(base, strings[j])
            if score >= req.threshold:
                visited[j] = True
                group_indices.append(j)
                members.append(req.records[j])

        if len(group_indices) > 1:
            clusters.append(
                NameCluster(
                    representative=base,
                    indices=group_indices,
                    members=members,
                )
            )

    unique_count = n - sum(len(c.indices) for c in clusters) + len(clusters)
    return DedupeResponse(
        clusters=clusters,
        unique_count=unique_count,
        total_records=n,
    )


class CsvDedupeSummary(BaseModel):
    summary: DedupeResponse
    sample_columns: List[str]


@router.post("/dedupe-names-from-csv", response_model=CsvDedupeSummary)
async def dedupe_names_from_csv(
    file: UploadFile = File(...),
    threshold: int = 90,
    first_name_col: str = "first_name",
    last_name_col: str = "last_name",
    middle_name_col: str = "middle_name",
):
    """
    Convenience endpoint that accepts a CSV with name columns and runs the
    duplicate detector. This is intentionally simple and geared toward
    small samples for demo purposes.
    """
    if not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="Please upload a CSV file.")

    raw = await file.read()
    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError:
        text = raw.decode("latin-1")

    reader = csv.DictReader(io.StringIO(text))
    records: List[NameRecord] = []
    for row in reader:
        records.append(
            NameRecord(
                first_name=row.get(first_name_col),
                middle_name=row.get(middle_name_col),
                last_name=row.get(last_name_col),
            )
        )

    resp = dedupe_names(DedupeRequest(records=records, threshold=threshold))  # type: ignore
    return CsvDedupeSummary(summary=resp, sample_columns=list(reader.fieldnames or []))
