"""Business rules for property amenities.

- An amenity can only be assigned if the catalog says it applies to the property type.
- Generic details (sharing, charge, quantity, rooms) are only accepted when the catalog
  entry supports them; amenity-specific `details` must match its attribute definitions.
- An amenity marked "not available" carries no details.
- Saving replaces the property's whole set atomically, so editing and removing are the
  same operation and duplicates cannot happen.
- Property.amenities (a plain list of keys) is kept in sync for marketplace filtering.
"""

from __future__ import annotations

from collections.abc import Iterable
from typing import TYPE_CHECKING, Any

from django.db import transaction

from apps.amenities.catalog import PROPERTY_TYPES
from apps.amenities.models import Amenity, PropertyAmenity
from core import audit
from core.money import format_inr

if TYPE_CHECKING:
    from apps.accounts.models import User
    from apps.properties.models import Property, Room

MAX_CHARGE = 100_000 * 100  # ₹1,00,000 in paise
TYPE_LABELS = dict(PROPERTY_TYPES)
GENERIC_FIELDS = ("sharing", "charge", "charge_amount", "charge_period", "quantity")


def _empty(value: Any) -> bool:
    return value in (None, "", [], {})


def clean_details(
    amenity: Amenity, details: dict[str, Any]
) -> tuple[dict[str, Any], dict[str, str]]:
    """Validate amenity-specific details against the catalog. Returns (clean, errors)."""
    specs = {spec["key"]: spec for spec in amenity.attributes}
    clean: dict[str, Any] = {}
    errors: dict[str, str] = {}
    for key, value in details.items():
        spec = specs.get(key)
        if spec is None:
            errors[key] = f"{amenity.name} has no '{key}' detail."
            continue
        if _empty(value):
            continue  # left blank: simply not stored
        kind = spec["type"]
        allowed = {opt[0] for opt in spec.get("options", [])}
        if kind == "choice":
            if value not in allowed:
                errors[key] = f"Choose one of: {', '.join(sorted(allowed))}."
                continue
        elif kind == "multi":
            if not isinstance(value, list) or not set(value) <= allowed:
                errors[key] = f"Choose from: {', '.join(sorted(allowed))}."
                continue
            value = [opt[0] for opt in spec["options"] if opt[0] in value]  # canonical order
        elif kind == "int":
            if isinstance(value, bool) or not isinstance(value, int):
                errors[key] = "Enter a whole number."
                continue
            if not spec["min"] <= value <= spec["max"]:
                errors[key] = f"Must be between {spec['min']} and {spec['max']}."
                continue
        elif kind == "bool" and not isinstance(value, bool):
            errors[key] = "Must be yes or no."
            continue
        clean[key] = value
    return clean, errors


def validate_assignment(prop: Property, amenity: Amenity, data: dict[str, Any]) -> dict[str, Any]:
    """Check one assignment for this property. Returns field -> message (empty if valid)."""
    errors: dict[str, Any] = {}
    if not amenity.applies_to(prop.property_type):
        label = TYPE_LABELS.get(prop.property_type, prop.property_type)
        errors["amenity"] = f"{amenity.name} does not apply to this property type ({label})."
        return errors

    status = data.get("status", PropertyAmenity.Status.AVAILABLE)
    rooms: list[Room] = data.get("rooms") or []
    level = data.get("level", PropertyAmenity.Level.PROPERTY)
    if status == PropertyAmenity.Status.UNAVAILABLE:
        given = [f for f in (*GENERIC_FIELDS, "details") if not _empty(data.get(f))]
        if rooms or level == PropertyAmenity.Level.ROOM:
            given.append("rooms")
        for field in given:
            errors[field] = "Leave this empty when the amenity is not available."
        return errors

    if data.get("sharing") and not amenity.supports_sharing:
        errors["sharing"] = f"{amenity.name} cannot be marked shared or private."
    if data.get("quantity") is not None and not amenity.supports_quantity:
        errors["quantity"] = f"{amenity.name} has no quantity."

    charge = data.get("charge") or ""
    amount = data.get("charge_amount")
    period = data.get("charge_period") or ""
    if not amenity.supports_charge and (charge or amount is not None or period):
        errors["charge"] = f"{amenity.name} cannot have a charge."
    elif charge == PropertyAmenity.Charge.EXTRA:
        if amount is None or amount <= 0:
            errors["charge_amount"] = "Enter the extra charge."
        elif amount > MAX_CHARGE:
            errors["charge_amount"] = "That charge looks too high (max ₹1,00,000)."
        if not period:
            errors["charge_period"] = "Say whether it is per month, one time or per use."
    elif amount is not None or period:
        errors["charge_amount"] = "Only an additional charge has an amount."

    if level == PropertyAmenity.Level.ROOM:
        if not amenity.supports_rooms:
            errors["level"] = f"{amenity.name} applies to the whole property."
        elif not rooms:
            errors["rooms"] = "Pick the rooms that have it."
        elif any(room.property_id != prop.pk for room in rooms):
            errors["rooms"] = "Those rooms are not in this property."
    elif rooms:
        errors["rooms"] = "Rooms are only used when the amenity is in selected rooms."

    _, detail_errors = clean_details(amenity, data.get("details") or {})
    if detail_errors:
        errors["details"] = detail_errors
    return errors


def sync_property_keys(prop: Property) -> None:
    keys = sorted(
        prop.amenity_assignments.filter(status=PropertyAmenity.Status.AVAILABLE).values_list(
            "amenity__key", flat=True
        )
    )
    if prop.amenities != keys:
        prop.amenities = keys
        prop.save(update_fields=["amenities", "updated_at"])


@transaction.atomic
def replace_assignments(
    *, prop: Property, items: Iterable[dict[str, Any]], actor: User | None
) -> list[PropertyAmenity]:
    """Make the property's amenities exactly `items` (already validated)."""
    items = list(items)
    existing = {pa.amenity_id: pa for pa in prop.amenity_assignments.all()}
    keep: set[Any] = set()
    for item in items:
        amenity: Amenity = item["amenity"]
        unavailable = item.get("status") == PropertyAmenity.Status.UNAVAILABLE
        details, _ = clean_details(amenity, item.get("details") or {})
        level = PropertyAmenity.Level.PROPERTY if unavailable else item.get("level", "property")
        values = {
            "status": item.get("status", PropertyAmenity.Status.AVAILABLE),
            "sharing": "" if unavailable else item.get("sharing") or "",
            "charge": "" if unavailable else item.get("charge") or "",
            "charge_amount": None if unavailable else item.get("charge_amount"),
            "charge_period": "" if unavailable else item.get("charge_period") or "",
            "quantity": None if unavailable else item.get("quantity"),
            "level": level,
            "details": {} if unavailable else details,
            "note": item.get("note", ""),
        }
        assignment = existing.get(amenity.pk)
        if assignment is None:
            assignment = PropertyAmenity.objects.create(
                organization=prop.organization,
                created_by=actor,
                property=prop,
                amenity=amenity,
                **values,
            )
        else:
            for field, value in values.items():
                setattr(assignment, field, value)
            assignment.save()
        rooms = (item.get("rooms") or []) if level == PropertyAmenity.Level.ROOM else []
        assignment.rooms.set(rooms)
        keep.add(amenity.pk)
    removed = [pa for amenity_id, pa in existing.items() if amenity_id not in keep]
    PropertyAmenity.objects.filter(pk__in=[pa.pk for pa in removed]).delete()
    sync_property_keys(prop)
    audit.record(
        organization=prop.organization,
        actor=actor,
        action="property.amenities_updated",
        obj=prop,
        count=len(items),
        removed=len(removed),
    )
    return list(
        prop.amenity_assignments.select_related("amenity__category").prefetch_related("rooms")
    )


@transaction.atomic
def drop_incompatible(prop: Property) -> list[str]:
    """After the property type changes, remove amenities that no longer apply."""
    gone = [
        pa
        for pa in prop.amenity_assignments.select_related("amenity")
        if not pa.amenity.applies_to(prop.property_type)
    ]
    PropertyAmenity.objects.filter(pk__in=[pa.pk for pa in gone]).delete()
    sync_property_keys(prop)
    return [pa.amenity.name for pa in gone]


def describe_charge(pa: PropertyAmenity) -> str:
    if pa.charge == PropertyAmenity.Charge.INCLUDED:
        return "Included in rent"
    if pa.charge == PropertyAmenity.Charge.EXTRA and pa.charge_amount:
        period = PropertyAmenity.ChargePeriod(pa.charge_period).label if pa.charge_period else ""
        return f"{format_inr(pa.charge_amount)} {period}".strip()
    return ""


def describe_details(pa: PropertyAmenity) -> list[str]:
    """Human-readable details, e.g. ['Breakfast, Dinner', 'Veg only']."""
    specs = {spec["key"]: spec for spec in pa.amenity.attributes}
    out: list[str] = []
    for key, value in pa.details.items():
        spec = specs.get(key)
        if spec is None:
            continue
        labels = dict((opt[0], opt[1]) for opt in spec.get("options", []))
        if spec["type"] == "choice":
            out.append(labels.get(value, str(value)))
        elif spec["type"] == "multi":
            out.append(", ".join(labels.get(v, v) for v in value))
        elif spec["type"] == "int":
            out.append(f"{spec['label']}: {value} {spec.get('unit', '')}".strip())
        elif spec["type"] == "bool":
            out.append(f"{spec['label']}: {'yes' if value else 'no'}")
    if pa.quantity:
        out.append(f"{pa.quantity} available")
    return out
