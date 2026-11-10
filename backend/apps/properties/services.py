"""Property and inventory rules: readiness, status changes, archiving, structure checks.

Words in messages are shown to PG owners as they are, so they use everyday language
("Room 204 is rented bed by bed but has no beds"), never model or field names.
"""

from __future__ import annotations

import datetime as dt
from dataclasses import asdict, dataclass
from typing import TYPE_CHECKING, Any

from django.db import transaction
from django.db.models import Q, QuerySet
from django.utils import timezone
from rest_framework import status
from rest_framework.exceptions import APIException, ValidationError

from apps.properties.models import (
    PROOF_KINDS,
    Bed,
    Floor,
    Letting,
    Property,
    PropertyDocument,
    RentalUnit,
    Room,
    VerificationEvent,
)
from core import audit

if TYPE_CHECKING:
    from apps.accounts.models import User


class InventoryRuleViolation(APIException):
    status_code = status.HTTP_409_CONFLICT
    default_detail = "This change is not allowed."
    default_code = "inventory_rule_violation"

    def __init__(self, detail: str, code: str) -> None:
        super().__init__(detail=detail, code=code)


# ---------------------------------------------------------------- labels


def unit_word(prop: Property) -> str:
    """What a RentalUnit is called on screen for this kind of property."""
    return "Portion" if prop.property_type == "house" else "Flat"


def unit_name(unit: RentalUnit) -> str:
    """ "Flat 302", "Portion A", "Whole house": the word is added only when missing."""
    word = unit_word(unit.property)
    if unit.unit_type == RentalUnit.UnitType.WHOLE_HOUSE or unit.code.lower().startswith(
        (word.lower(), "flat", "portion", "whole")
    ):
        return unit.code
    return f"{word} {unit.code}"


def unit_letting_label(unit: RentalUnit) -> str:
    whole = "Whole house" if unit.unit_type == RentalUnit.UnitType.WHOLE_HOUSE else "Whole flat"
    if unit.unit_type == RentalUnit.UnitType.PORTION:
        whole = "Whole portion"
    return whole if unit.letting == Letting.WHOLE else "Room by room"


def room_letting_label(room: Room) -> str:
    return "Whole room" if room.letting == Letting.WHOLE else "Bed by bed"


def floor_name(room_or_unit: Room | RentalUnit) -> str:
    if room_or_unit.floor_id and room_or_unit.floor is not None:
        return room_or_unit.floor.display_name
    return getattr(room_or_unit, "floor_label", "") or ""


# ---------------------------------------------------------------- open stays


def _open_stays() -> QuerySet[Any]:
    from apps.tenants.models import OPEN_STAY_STATUSES, Stay

    return Stay.objects.filter(status__in=OPEN_STAY_STATUSES)


def has_open_stays(
    *,
    prop: Property | None = None,
    unit: RentalUnit | None = None,
    room: Room | None = None,
    bed: Bed | None = None,
) -> bool:
    stays = _open_stays()
    if bed is not None:
        return stays.filter(bed=bed).exists()
    if room is not None:
        return stays.filter(Q(bed__room=room) | Q(room=room)).exists()
    if unit is not None:
        return stays.filter(Q(bed__room__unit=unit) | Q(room__unit=unit) | Q(unit=unit)).exists()
    if prop is None:
        raise ValueError("Give a property, flat, room or bed.")
    return stays.filter(property=prop).exists()


# ---------------------------------------------------------------- readiness


@dataclass(frozen=True)
class Problem:
    code: str
    message: str
    target_type: str  # property | unit | room
    target_id: str


def readiness(prop: Property) -> list[Problem]:
    """What still blocks opening this property, in plain words. Empty = ready."""
    problems: list[Problem] = []
    pid = str(prop.pk)
    for field, label in (
        ("name", "a name"),
        ("address_line", "an address"),
        ("locality", "a locality"),
    ):
        if not getattr(prop, field):
            problems.append(Problem(f"missing_{field}", f"Add {label}.", "property", pid))

    units = list(prop.units.filter(archived_at__isnull=True))
    rooms = list(prop.rooms.filter(archived_at__isnull=True).select_related("unit"))
    beds_by_room: dict[Any, int] = {}
    for room_id in Bed.objects.filter(room__property=prop, archived_at__isnull=True).values_list(
        "room_id", flat=True
    ):
        beds_by_room[room_id] = beds_by_room.get(room_id, 0) + 1

    word = unit_word(prop)
    rentable = 0
    for unit in units:
        unit.property = prop  # for unit_name() without another query
    for unit in units:
        if unit.letting == Letting.WHOLE:
            rentable += 1
            if not unit.monthly_rent:
                problems.append(
                    Problem(
                        "unit_without_rent", f"{unit_name(unit)} has no rent.", "unit", str(unit.pk)
                    )
                )
        elif not any(r.unit_id == unit.pk for r in rooms):
            problems.append(
                Problem(
                    "unit_without_rooms",
                    f"{unit_name(unit)} is rented room by room but has no rooms.",
                    "unit",
                    str(unit.pk),
                )
            )
    for room in rooms:
        if room.unit is not None and room.unit.letting == Letting.WHOLE:
            continue  # part of a flat rented as a whole
        rentable += 1
        if room.letting == Letting.WHOLE and not room.monthly_rent:
            problems.append(
                Problem(
                    "room_without_rent", f"Room {room.number} has no rent.", "room", str(room.pk)
                )
            )
        if room.letting == Letting.BY_PARTS and not beds_by_room.get(room.pk):
            problems.append(
                Problem(
                    "room_without_beds",
                    f"Room {room.number} is rented bed by bed but has no beds.",
                    "room",
                    str(room.pk),
                )
            )
    if rentable == 0:
        problems.append(
            Problem(
                "nothing_to_rent",
                f"Add at least one room, bed or {word.lower()} that tenants can rent.",
                "property",
                pid,
            )
        )
    return problems


def readiness_payload(prop: Property) -> dict[str, Any]:
    problems = readiness(prop)
    return {"ready": not problems, "problems": [asdict(p) for p in problems]}


# ---------------------------------------------------------------- status changes

ACTIONS = ("activate", "deactivate", "archive", "restore")
TARGET = {
    "activate": Property.Status.ACTIVE,
    "deactivate": Property.Status.INACTIVE,
    "archive": Property.Status.ARCHIVED,
    "restore": Property.Status.INACTIVE,
}


def status_change_problem(prop: Property, action: str) -> str | None:
    """Why `action` cannot be done now, in plain words, or None if it can."""
    current = prop.status
    S = Property.Status
    if action == "activate":
        if current == S.ACTIVE:
            return "It is already open."
        if current == S.ARCHIVED:
            return "Restore it first."
        problems = readiness(prop)
        if problems:
            return "Finish these first: " + " ".join(p.message for p in problems[:3])
    elif action == "deactivate":
        if current != S.ACTIVE:
            return "Only an open property can be closed."
    elif action == "archive":
        if current == S.ARCHIVED:
            return "It is already removed."
        if has_open_stays(prop=prop):
            return "Tenants still live here. Check them out first."
    elif action == "restore":
        if current != S.ARCHIVED:
            return "Only a removed property can be restored."
    else:
        return "Unknown action."
    return None


def _check_plan_for_restore(prop: Property) -> None:
    """Bringing a removed property back also brings back its rooms and beds."""
    from apps.subscriptions.entitlements import check_can_add

    org = prop.organization
    check_can_add(org, "properties")
    check_can_add(
        org, "rooms", Room.objects.filter(property=prop, archived_at__isnull=True).count()
    )
    check_can_add(
        org, "beds", Bed.objects.filter(room__property=prop, archived_at__isnull=True).count()
    )


def _apply(prop: Property, action: str, actor: User) -> None:
    if action == "restore" and prop.status == Property.Status.ARCHIVED:
        _check_plan_for_restore(prop)
    before = prop.status
    prop.status = TARGET[action]
    prop.save(update_fields=["status", "updated_at"])
    audit.record(
        organization=prop.organization,
        actor=actor,
        action=f"property.{action}",
        obj=prop,
        before=before,
        after=prop.status,
    )


@transaction.atomic
def change_status(*, prop: Property, action: str, actor: User) -> Property:
    prop = Property.objects.select_for_update().get(pk=prop.pk)
    problem = status_change_problem(prop, action)
    if problem:
        raise InventoryRuleViolation(problem, code=f"cannot_{action}")
    _apply(prop, action, actor)
    return prop


@transaction.atomic
def bulk_change_status(*, props: list[Property], action: str, actor: User) -> int:
    """All or nothing: if any property cannot change, none do, and each reason is listed."""
    locked = list(
        Property.objects.select_for_update().filter(pk__in=[p.pk for p in props]).order_by("pk")
    )
    errors = []
    for prop in locked:
        problem = status_change_problem(prop, action)
        if problem:
            errors.append({"id": str(prop.pk), "name": prop.name, "message": problem})
    if errors:
        raise ValidationError({"items": errors})
    for prop in locked:
        _apply(prop, action, actor)
    return len(locked)


# ---------------------------------------------------------------- creation


@transaction.atomic
def create_property(*, serializer: Any, organization: Any, actor: User) -> Property:
    """Properties made through the API start as "Not finished" until they are opened.

    An independent house gets one "Whole house" unit so it can be rented straight away.
    """
    from apps.subscriptions.entitlements import check_can_add

    check_can_add(organization, "properties")
    prop: Property = serializer.save(
        organization=organization, created_by=actor, status=Property.Status.DRAFT
    )
    if prop.property_type == "house":
        RentalUnit.objects.create(
            organization=organization,
            created_by=actor,
            property=prop,
            code="Whole house",
            unit_type=RentalUnit.UnitType.WHOLE_HOUSE,
            letting=Letting.WHOLE,
        )
    audit.record(organization=organization, actor=actor, action="property.created", obj=prop)
    return prop


# ---------------------------------------------------------------- structure checks


def check_same_property(prop: Property, **parts: Floor | RentalUnit | Room | None) -> None:
    errors = {
        name: "This belongs to a different property."
        for name, part in parts.items()
        if part is not None and part.property_id != prop.pk
    }
    if errors:
        raise ValidationError(errors)


def check_room_letting(
    *, room_unit: RentalUnit | None, letting: str, monthly_rent: int | None
) -> None:
    """Rent sits on the level that is rented, never on two levels at once."""
    if room_unit is not None and room_unit.letting == Letting.WHOLE:
        if letting != Letting.WHOLE or monthly_rent:
            raise ValidationError(
                {
                    "letting": (
                        f"{room_unit.code} is rented as a whole, so its rooms have no rent or beds "
                        "of their own."
                    )
                }
            )
        return
    if letting == Letting.WHOLE and not monthly_rent:
        raise ValidationError({"monthly_rent": "Enter the rent for the whole room."})
    if letting == Letting.BY_PARTS and monthly_rent:
        raise ValidationError(
            {"monthly_rent": "This room is rented bed by bed; set rent on each bed."}
        )


def can_hold_beds(room: Room) -> str | None:
    if room.is_archived:
        return "This room has been removed."
    if room.unit_id and room.unit is not None and room.unit.letting == Letting.WHOLE:
        return f"{room.unit.code} is rented as a whole, so its rooms have no beds for rent."
    if room.letting == Letting.WHOLE:
        return f"Room {room.number} is rented as a whole room, not bed by bed."
    return None


def bed_rent_problem(bed: Bed) -> str | None:
    """Why a tenant cannot be checked in to this bed on its own (None = fine)."""
    if bed.is_archived:
        return "This bed has been removed."
    room = bed.room
    if room.property.status == Property.Status.ARCHIVED:
        return "This property has been removed."
    return can_hold_beds(room)


def check_unit_letting_change(unit: RentalUnit, letting: str) -> None:
    if letting == unit.letting:
        return
    if unit.letting == Letting.WHOLE and has_open_stays(unit=unit):
        raise InventoryRuleViolation(
            f"{unit_name(unit)} is rented as a whole to a tenant. Check them out first.",
            code="unit_has_tenants",
        )
    if letting == Letting.WHOLE:
        if has_open_stays(unit=unit):
            raise InventoryRuleViolation(
                "Tenants rent rooms or beds in this flat. Check them out first.",
                code="unit_has_tenants",
            )
        if unit.rooms.filter(
            Q(letting=Letting.BY_PARTS) | Q(monthly_rent__isnull=False),
            archived_at__isnull=True,
        ).exists():
            raise ValidationError(
                {
                    "letting": (
                        "Some rooms in this flat have their own rent or beds. Change them to "
                        "'Whole room' without rent first, or keep renting room by room."
                    )
                }
            )


def check_room_letting_change(room: Room, letting: str) -> None:
    if letting != room.letting and has_open_stays(room=room):
        message = (
            "Tenants rent beds in this room. Check them out first."
            if letting == Letting.WHOLE
            else f"Room {room.number} is rented as a whole to a tenant. Check them out first."
        )
        raise InventoryRuleViolation(message, code="room_has_tenants")


# ---------------------------------------------------------------- beds vs sharing


def live_bed_count(room: Room) -> int:
    return room.beds.filter(archived_at__isnull=True).count()


def check_room_has_space(room: Room) -> None:
    """A room has at most as many beds as its sharing ("2 sharing" = 2 beds)."""
    if live_bed_count(room) >= room.sharing:
        raise InventoryRuleViolation(
            f"Room {room.number} is {room.sharing} sharing and already has {room.sharing} "
            f"bed{'s' if room.sharing > 1 else ''}. Increase the sharing to add another bed.",
            code="room_full",
        )


def check_sharing_change(room: Room, sharing: int) -> None:
    beds = live_bed_count(room)
    if sharing < beds:
        raise ValidationError(
            {
                "sharing": (
                    f"Room {room.number} has {beds} beds. Remove "
                    f"{beds - sharing} bed{'s' if beds - sharing > 1 else ''} first, "
                    f"or keep the sharing at {beds}."
                )
            }
        )


# ---------------------------------------------------------------- room features

# These two are set with their own switches on the room (AC, attached bathroom).
OWN_ROOM_SWITCHES = ("ac", "bathroom")


def room_feature_choices() -> QuerySet[Any]:
    """Amenities a room can have, from the catalog (never a hard-coded list)."""
    from apps.amenities.models import Amenity

    return (
        Amenity.objects.filter(is_active=True, supports_rooms=True)
        .exclude(key__in=OWN_ROOM_SWITCHES)
        .select_related("category")
    )


@dataclass(frozen=True)
class FeatureChoice:
    amenity: str
    charge: str
    charge_amount: int | None


def clean_room_features(items: list[dict[str, Any]]) -> list[FeatureChoice]:
    """Check a whole list of room features; errors name the feature in plain words."""
    choices = {a.key: a for a in room_feature_choices()}
    seen: set[str] = set()
    cleaned: list[FeatureChoice] = []
    for item in items:
        key = item["amenity"]
        amenity = choices.get(key)
        if amenity is None:
            raise ValidationError({"features": f"“{key}” is not a room feature."})
        if key in seen:
            raise ValidationError({"features": f"{amenity.name} is listed twice."})
        seen.add(key)
        charge = item.get("charge") or "included"
        amount = item.get("charge_amount")
        if charge == "extra" and not amount:
            raise ValidationError(
                {"features": f"{amenity.name}: enter the extra charge per month, e.g. 500."}
            )
        cleaned.append(FeatureChoice(key, charge, amount if charge == "extra" else None))
    return cleaned


def set_room_features(room: Room, items: list[FeatureChoice], actor: User | None) -> None:
    """Replace the room's features with exactly these."""
    if any(i.charge == "extra" for i in items):
        from apps.subscriptions.entitlements import check_feature

        check_feature(room.organization, "room_extras")
    from apps.amenities.models import Amenity
    from apps.properties.models import RoomFeature

    amenities = {a.key: a for a in Amenity.objects.filter(key__in=[i.amenity for i in items])}
    RoomFeature.objects.filter(room=room).exclude(
        amenity__key__in=[i.amenity for i in items]
    ).delete()
    for item in items:
        RoomFeature.objects.update_or_create(
            room=room,
            amenity=amenities[item.amenity],
            defaults={
                "organization_id": room.organization_id,
                "created_by": actor,
                "charge": item.charge,
                "charge_amount": item.charge_amount,
            },
        )


def room_extras(room: Room | None) -> list[tuple[str, int]]:
    """(name, paise per month) of the room's extra-charge features, for rent bills."""
    if room is None:
        return []
    return [
        (f.amenity.name, f.charge_amount or 0)
        for f in room.features.filter(charge="extra").select_related("amenity")
        if f.charge_amount
    ]


# ---------------------------------------------------------------- archiving


@transaction.atomic
def archive(obj: Floor | RentalUnit | Room | Bed, actor: User) -> None:
    now = timezone.now()
    if isinstance(obj, Bed):
        if has_open_stays(bed=obj):
            raise InventoryRuleViolation("A tenant lives in this bed.", code="bed_has_tenant")
        beds = [obj]
        rooms: list[Room] = []
    elif isinstance(obj, Room):
        if has_open_stays(room=obj):
            raise InventoryRuleViolation(
                "Tenants live in this room. Check them out first.", code="room_has_tenants"
            )
        rooms = [obj]
        beds = list(obj.beds.filter(archived_at__isnull=True))
    elif isinstance(obj, RentalUnit):
        if has_open_stays(unit=obj):
            raise InventoryRuleViolation(
                "Tenants live in this flat. Check them out first.", code="unit_has_tenants"
            )
        rooms = list(obj.rooms.filter(archived_at__isnull=True))
        beds = list(Bed.objects.filter(room__in=rooms, archived_at__isnull=True))
    else:
        in_use = (
            obj.rooms.filter(archived_at__isnull=True).exists()
            or obj.units.filter(archived_at__isnull=True).exists()
        )
        if in_use:
            raise InventoryRuleViolation(
                "Move or remove the rooms and flats on this floor first.", code="floor_in_use"
            )
        rooms, beds = [], []
    Bed.objects.filter(pk__in=[b.pk for b in beds]).update(archived_at=now)
    Room.objects.filter(pk__in=[r.pk for r in rooms]).update(archived_at=now)
    obj.archived_at = now
    obj.save(update_fields=["archived_at", "updated_at"])
    audit.record(
        organization=obj.organization,
        actor=actor,
        action=f"{obj._meta.model_name}.archived",
        obj=obj,
        rooms=len(rooms),
        beds=len(beds),
    )


@transaction.atomic
def restore(obj: Floor | RentalUnit | Room | Bed, actor: User) -> None:
    """Bring back one record (not its children: they may have been removed on purpose)."""
    parent_archived = (isinstance(obj, Bed) and obj.room.is_archived) or (
        isinstance(obj, Room) and obj.unit is not None and obj.unit.is_archived
    )
    if parent_archived:
        raise InventoryRuleViolation(
            "Restore the room or flat it belongs to first.", code="parent_archived"
        )
    from apps.subscriptions.entitlements import check_can_add

    if isinstance(obj, Bed):
        check_room_has_space(obj.room)
        check_can_add(obj.organization, "beds")
    if isinstance(obj, Room):
        check_can_add(obj.organization, "rooms")
    obj.archived_at = None
    obj.save(update_fields=["archived_at", "updated_at"])
    audit.record(
        organization=obj.organization,
        actor=actor,
        action=f"{obj._meta.model_name}.restored",
        obj=obj,
    )


# ---------------------------------------------------------------- documents & verification

EXPIRY_WARNING_DAYS = 30


def document_state(doc: PropertyDocument, today: dt.date | None = None) -> tuple[str, str]:
    """(code, words) for a document's expiry: valid, expiring, expired or no_expiry."""
    if doc.expires_on is None:
        return "no_expiry", "No expiry date"
    today = today or timezone.localdate()
    days = (doc.expires_on - today).days
    if days < 0:
        return "expired", f"Expired on {doc.expires_on:%d %b %Y}"
    if days <= EXPIRY_WARNING_DAYS:
        return "expiring", f"Expires in {days} day{'s' if days != 1 else ''}"
    return "valid", f"Valid until {doc.expires_on:%d %b %Y}"


def _record_verification(
    prop: Property, status_value: str, note: str, actor: User | None, by_platform: bool
) -> VerificationEvent:
    prop.verification_status = status_value
    prop.save(update_fields=["verification_status", "updated_at"])
    event = VerificationEvent.objects.create(
        organization=prop.organization,
        created_by=actor,
        property=prop,
        status=status_value,
        note=note,
        by_platform=by_platform,
    )
    audit.record(
        organization=prop.organization,
        actor=actor,
        action=f"property.verification_{status_value}",
        obj=prop,
        note=note,
    )
    return event


@transaction.atomic
def add_document(*, prop: Property, actor: User, upload: Any, **fields: Any) -> PropertyDocument:
    doc = PropertyDocument.objects.create(
        organization=prop.organization,
        created_by=actor,
        property=prop,
        file=upload,
        file_name=getattr(upload, "name", "document")[:255],
        size_bytes=getattr(upload, "size", 0) or 0,
        **fields,
    )
    audit.record(
        organization=prop.organization,
        actor=actor,
        action="property.document_added",
        obj=prop,
        document=doc.pk,
        kind=doc.kind,
    )
    _reverify_if_proof_changed(prop, doc.kind, actor)
    return doc


@transaction.atomic
def delete_document(*, doc: PropertyDocument, actor: User) -> None:
    prop, kind = doc.property, doc.kind
    audit.record(
        organization=doc.organization,
        actor=actor,
        action="property.document_deleted",
        obj=prop,
        document=doc.pk,
        kind=kind,
        file_name=doc.file_name,
    )
    doc.file.delete(save=False)
    doc.delete()
    _reverify_if_proof_changed(prop, kind, actor)


def _reverify_if_proof_changed(prop: Property, kind: str, actor: User) -> None:
    """Changing a proof document of a verified property sends it back for checking."""
    if kind in PROOF_KINDS and prop.verification_status == Property.Verification.VERIFIED:
        _record_verification(
            prop,
            Property.Verification.SUBMITTED,
            "Proof documents changed after verification.",
            actor,
            by_platform=False,
        )


def log_document_download(*, doc: PropertyDocument, actor: User, by_platform: bool) -> None:
    audit.record(
        organization=doc.organization,
        actor=actor,
        action="property.document_downloaded",
        obj=doc.property,
        document=doc.pk,
        by_platform=by_platform,
    )


SUBMITTABLE = {
    Property.Verification.UNVERIFIED,
    Property.Verification.CHANGES_REQUESTED,
    Property.Verification.REJECTED,
}


@transaction.atomic
def submit_for_verification(*, prop: Property, actor: User, note: str = "") -> VerificationEvent:
    prop = Property.objects.select_for_update().get(pk=prop.pk)
    if prop.verification_status not in SUBMITTABLE:
        raise InventoryRuleViolation(
            "It is already being checked or verified.", code="cannot_submit_verification"
        )
    if not prop.documents.filter(kind__in=PROOF_KINDS).exists():
        raise InventoryRuleViolation(
            "Upload an ownership proof, a rental agreement with the owner, or a letter "
            "allowing you to manage the property first.",
            code="proof_missing",
        )
    return _record_verification(
        prop, Property.Verification.SUBMITTED, note, actor, by_platform=False
    )


DECISIONS = {
    Property.Verification.VERIFIED,
    Property.Verification.CHANGES_REQUESTED,
    Property.Verification.REJECTED,
}


@transaction.atomic
def decide_verification(
    *, prop: Property, decision: str, note: str, actor: User
) -> VerificationEvent:
    """Platform staff accept, ask for changes, or reject. A reason is needed unless accepted."""
    prop = Property.objects.select_for_update().get(pk=prop.pk)
    if decision not in DECISIONS:
        raise ValidationError({"decision": "Choose verified, changes_requested or rejected."})
    if decision != Property.Verification.VERIFIED and not note.strip():
        raise ValidationError({"note": "Tell the owner what to change or why it was refused."})
    return _record_verification(prop, decision, note.strip(), actor, by_platform=True)
