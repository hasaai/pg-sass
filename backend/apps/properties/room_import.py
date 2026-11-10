"""Add many rooms (and their beds) to one property from a CSV file.

Each row goes through the same RoomSerializer as the "Add a room" form, so every rule
(sharing, rent on the rented level, flats, duplicate numbers) is the same. Nothing is saved
unless every row is valid.
"""

from __future__ import annotations

import csv
import io
from dataclasses import dataclass, field
from decimal import Decimal, InvalidOperation
from typing import TYPE_CHECKING, Any

from django.db import transaction
from rest_framework import serializers

from core import audit

if TYPE_CHECKING:
    from rest_framework.request import Request

    from apps.properties.models import Property

MAX_BYTES = 1024 * 1024
MAX_ROWS = 500

# Column -> other spellings people use in their sheets.
COLUMNS: dict[str, tuple[str, ...]] = {
    "room": ("room", "room number", "room no", "room_number", "number"),
    "floor": ("floor", "floor number", "floor_number"),
    "sharing": ("sharing", "beds", "people"),
    "rent_per_bed": ("rent per bed", "rent_per_bed", "bed rent", "rent"),
    "whole_room_rent": ("whole room rent", "whole_room_rent", "room rent"),
    "room_type": ("room type", "room_type", "type"),
    "ac": ("ac", "a/c", "air conditioned"),
    "attached_bathroom": ("attached bathroom", "attached_bathroom", "attached bath"),
    "flat": ("flat", "portion", "unit", "flat code"),
}
TEMPLATE_HEADER = [
    "room",
    "floor",
    "sharing",
    "rent_per_bed",
    "whole_room_rent",
    "room_type",
    "ac",
    "attached_bathroom",
    "flat",
]
TEMPLATE_ROWS = [
    ["101", "1", "2", "8500", "", "shared", "yes", "no", ""],
    ["102", "1", "1", "", "14000", "private", "yes", "yes", ""],
]
ROOM_TYPES = {
    "private": "private",
    "single": "private",
    "shared": "shared",
    "sharing": "shared",
    "dormitory": "dormitory",
    "dorm": "dormitory",
}
YES = {"yes", "y", "true", "1", "included", "free"}
AMENITY_PREFIX = "amenity:"


def _amenity_columns() -> dict[str, str]:
    """Column name (amenity name or key, lower case) -> amenity key, from the catalog."""
    from apps.properties.services import room_feature_choices

    found: dict[str, str] = {}
    for a in room_feature_choices():
        found[a.name.strip().lower()] = a.key
        found[a.key.lower()] = a.key
        found[a.key.replace("_", " ").lower()] = a.key
    return found


def _feature(value: str, name: str, key: str, errors: list[str]) -> dict[str, Any] | None:
    """yes = included in rent; an amount = extra charge per month; empty / no = not there."""
    v = value.strip().lower()
    if v in NO:
        return None
    if v in YES:
        return {"amenity": key, "charge": "included"}
    amount = _rupees(value, name, [])
    if amount is None or amount <= 0:
        errors.append(f"{name}: write yes, an extra charge like 300, or leave it empty.")
        return None
    return {"amenity": key, "charge": "extra", "charge_amount": amount}


NO = {"no", "n", "false", "0", ""}


class ImportFileError(serializers.ValidationError):
    pass


@dataclass
class Row:
    row: int  # line number in the file (header = 1)
    room: str
    floor: int | None = None
    sharing: int | None = None
    rent_per_bed: int | None = None
    whole_room_rent: int | None = None
    flat: str = ""
    errors: list[str] = field(default_factory=list)
    payload: dict[str, Any] = field(default_factory=dict)


def _rupees(value: str, label: str, errors: list[str]) -> int | None:
    cleaned = value.replace("₹", "").replace(",", "").replace("Rs", "").strip()
    if not cleaned:
        return None
    try:
        amount = Decimal(cleaned)
    except InvalidOperation:
        errors.append(f"{label} “{value}” is not an amount in rupees.")
        return None
    if amount < 0:
        errors.append(f"{label} cannot be negative.")
        return None
    return int((amount * 100).to_integral_value())


def _whole_number(value: str, label: str, errors: list[str]) -> int | None:
    if not value.strip():
        return None
    if not value.strip().lstrip("-").isdigit():
        errors.append(f"{label} “{value}” is not a whole number.")
        return None
    return int(value)


def _yes_no(value: str, label: str, errors: list[str]) -> bool:
    v = value.strip().lower()
    if v in YES:
        return True
    if v not in NO:
        errors.append(f"{label}: write yes or no (not “{value}”).")
    return False


def read_csv(upload: Any) -> list[dict[str, str]]:
    if upload.size > MAX_BYTES:
        raise ImportFileError(
            {"file": "The file is bigger than 1 MB. Split it into smaller files."}
        )
    raw = upload.read()
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError as err:
        raise ImportFileError(
            {"file": "This is not a CSV text file. In Excel use “Save as → CSV UTF-8”."}
        ) from err
    sample = text[:2048]
    try:
        dialect: Any = csv.Sniffer().sniff(sample, delimiters=",;\t")
    except csv.Error:
        dialect = csv.excel
    reader = csv.reader(io.StringIO(text), dialect)
    lines = [r for r in reader if any(cell.strip() for cell in r)]
    if not lines:
        raise ImportFileError({"file": "The file is empty."})
    header = [h.strip().lower() for h in lines[0]]
    amenities = _amenity_columns()
    names: dict[int, str] = {}
    for i, h in enumerate(header):
        for key, spellings in COLUMNS.items():
            if h in spellings:
                names[i] = key
        if i not in names and h in amenities:
            names[i] = f"{AMENITY_PREFIX}{amenities[h]}"
    if "room" not in names.values() or "sharing" not in names.values():
        raise ImportFileError(
            {"file": "The first line must name the columns; “room” and “sharing” are needed."}
        )
    rows = lines[1:]
    if not rows:
        raise ImportFileError({"file": "The file has column names but no rooms."})
    if len(rows) > MAX_ROWS:
        raise ImportFileError({"file": f"Up to {MAX_ROWS} rooms per file, please split it."})
    return [
        {names[i]: (cells[i].strip() if i < len(cells) else "") for i in names} for cells in rows
    ]


def check_rows(prop: Property, request: Request, records: list[dict[str, str]]) -> list[Row]:
    """Validate every row with the room form's own rules; nothing is saved."""
    from apps.properties.models import RentalUnit
    from apps.properties.serializers import RoomSerializer
    from apps.properties.services import room_feature_choices

    units = {u.code.strip().lower(): u for u in RentalUnit.objects.filter(property=prop)}
    names = {a.key: a.name for a in room_feature_choices()}
    seen: dict[tuple[str, str], int] = {}
    out: list[Row] = []
    for n, rec in enumerate(records, start=2):
        errors: list[str] = []
        row = Row(row=n, room=rec.get("room", ""), flat=rec.get("flat", ""))
        row.floor = _whole_number(rec.get("floor", ""), "Floor", errors)
        row.sharing = _whole_number(rec.get("sharing", ""), "Sharing", errors)
        row.rent_per_bed = _rupees(rec.get("rent_per_bed", ""), "Rent per bed", errors)
        row.whole_room_rent = _rupees(rec.get("whole_room_rent", ""), "Whole room rent", errors)
        is_ac = _yes_no(rec.get("ac", ""), "AC", errors)
        bath = _yes_no(rec.get("attached_bathroom", ""), "Attached bathroom", errors)
        room_type = ROOM_TYPES.get(rec.get("room_type", "").strip().lower())
        if rec.get("room_type", "").strip() and room_type is None:
            errors.append("Room type: write private, shared or dormitory.")
        unit = None
        if row.flat:
            unit = units.get(row.flat.lower())
            if unit is None:
                errors.append(f"There is no flat or portion “{row.flat}” in this property.")
        if not row.room:
            errors.append("Room number is missing.")
        key = (row.flat.lower(), row.room.lower())
        if row.room and key in seen:
            errors.append(f"Room {row.room} is also on line {seen[key]}.")
        seen.setdefault(key, n)

        whole = row.whole_room_rent is not None
        payload: dict[str, Any] = {
            "property": str(prop.pk),
            "number": row.room,
            "sharing": row.sharing,
            "is_ac": is_ac,
            "has_attached_bath": bath,
        }
        features = [
            f
            for col, value in rec.items()
            if col.startswith(AMENITY_PREFIX)
            and (
                f := _feature(
                    value,
                    names.get(col[len(AMENITY_PREFIX) :], col),
                    col[len(AMENITY_PREFIX) :],
                    errors,
                )
            )
        ]
        if features:
            payload["features"] = features
        if row.floor is not None:
            payload["floor_number"] = row.floor
        if room_type:
            payload["room_type"] = room_type
        if unit is not None:
            payload["unit"] = str(unit.pk)
        if unit is None or unit.letting != "whole":
            if whole:
                payload["letting"] = "whole"
                payload["monthly_rent"] = row.whole_room_rent
            else:
                payload["letting"] = "by_parts"
                if row.rent_per_bed is None:
                    errors.append("Give the rent per bed, or a whole room rent.")
                else:
                    payload["bed_rent"] = row.rent_per_bed
        if not errors:
            serializer = RoomSerializer(data=payload, context={"request": request})
            if not serializer.is_valid():
                errors.extend(_messages(serializer.errors))
        row.errors = errors
        row.payload = payload
        out.append(row)
    return out


def _messages(errors: Any) -> list[str]:
    if isinstance(errors, dict):
        return [m for v in errors.values() for m in _messages(v)]
    if isinstance(errors, list):
        return [m for v in errors for m in _messages(v)]
    return [str(errors)]


@transaction.atomic
def create_rooms(prop: Property, request: Request, rows: list[Row]) -> int:
    from apps.properties.serializers import RoomSerializer
    from apps.subscriptions.entitlements import check_can_add

    check_can_add(prop.organization, "rooms", len(rows))
    check_can_add(
        prop.organization,
        "beds",
        sum(r.sharing or 0 for r in rows if r.payload.get("bed_rent") is not None),
    )
    for row in rows:
        serializer = RoomSerializer(data=row.payload, context={"request": request})
        serializer.is_valid(raise_exception=True)
        serializer.save(organization=prop.organization, created_by=request.user)
    audit.record(
        organization=prop.organization,
        actor=request.user,  # type: ignore[arg-type]
        action="property.rooms_imported",
        obj=prop,
        rooms=len(rows),
    )
    return len(rows)


def template_csv() -> str:
    """The template: the room columns, then one column per room amenity in the catalog."""
    from apps.properties.services import room_feature_choices

    amenities = [a.name for a in room_feature_choices()]
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow([*TEMPLATE_HEADER, *amenities])
    for i, row in enumerate(TEMPLATE_ROWS):
        writer.writerow(
            [*row, *(("yes" if i == 0 or n % 2 == 0 else "") for n in range(len(amenities)))]
        )
    return buf.getvalue()
