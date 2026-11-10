"""What a stay rents, in words people use: "Room 204 · Bed A", "Flat 302 · Whole flat".

A stay rents exactly one place: a bed, a whole room or a whole flat / portion (`unit`).
"""

from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from apps.properties.models import RentalUnit
    from apps.tenants.models import Stay

# select_related paths that make every helper below query-free.
PLACE_RELATED = (
    "property",
    "bed__room__unit__property",
    "room__unit__property",
    "unit__property",
)

PLACE_KINDS = [("bed", "Bed"), ("room", "Whole room"), ("unit", "Whole flat or portion")]


def place_kind(stay: Stay) -> str:
    """bed | room | unit"""
    if stay.bed_id:
        return "bed"
    return "room" if stay.room_id else "unit"


def _whole_unit(stay: Stay) -> RentalUnit:
    if stay.unit is None:
        raise ValueError("A stay must rent a bed, a room or a flat.")
    return stay.unit


def _unit_prefix(unit: RentalUnit | None) -> list[str]:
    from apps.properties.services import unit_name

    return [unit_name(unit)] if unit is not None else []


def place_parts(stay: Stay) -> list[str]:
    """["Flat 302", "Room 2", "Bed A"] — from the largest part to the smallest."""
    from apps.properties.services import unit_letting_label, unit_name

    if stay.bed is not None:
        room = stay.bed.room
        return [*_unit_prefix(room.unit), f"Room {room.number}", f"Bed {stay.bed.label}"]
    if stay.room is not None:
        return [*_unit_prefix(stay.room.unit), f"Room {stay.room.number}", "Whole room"]
    unit = _whole_unit(stay)
    return [unit_name(unit), unit_letting_label(unit)]


def place_label(stay: Stay) -> str:
    return " · ".join(place_parts(stay))


def room_number(stay: Stay) -> str:
    """The room number, or the flat name when a whole flat is rented."""
    from apps.properties.services import unit_name

    if stay.bed is not None:
        return stay.bed.room.number
    if stay.room is not None:
        return stay.room.number
    return unit_name(_whole_unit(stay))


def bed_label(stay: Stay) -> str:
    """The bed label, or "Whole room" / "Whole flat"."""
    return place_parts(stay)[-1].removeprefix("Bed ")
