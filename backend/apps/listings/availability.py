"""Vacancy and rent figures shown on listings, always computed from live bed data."""

from __future__ import annotations

from collections import defaultdict
from typing import Any

from apps.properties.models import Bed, Property


def sharing_options(prop: Property) -> list[dict[str, Any]]:
    """One row per sharing type: lowest rent and how many beds are vacant now."""
    groups: dict[int, dict[str, Any]] = defaultdict(
        lambda: {"min_rent": None, "max_rent": None, "vacant_beds": 0, "is_ac": False}
    )
    for room in prop.rooms.all():
        for bed in room.beds.all():
            if bed.status == Bed.Status.BLOCKED:
                continue
            g = groups[room.sharing]
            g["min_rent"] = (
                bed.monthly_rent if g["min_rent"] is None else min(g["min_rent"], bed.monthly_rent)
            )
            g["max_rent"] = (
                bed.monthly_rent if g["max_rent"] is None else max(g["max_rent"], bed.monthly_rent)
            )
            g["is_ac"] = g["is_ac"] or room.is_ac
            if bed.status == Bed.Status.VACANT:
                g["vacant_beds"] += 1
    return [{"sharing": k, **v} for k, v in sorted(groups.items())]
