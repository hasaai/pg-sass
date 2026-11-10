"""Stay lifecycle: check-in, deposit, notice, transfer, checkout.

A stay rents a bed, a whole room or a whole flat / portion (see `places.py`).
"""

from __future__ import annotations

import datetime as dt
from dataclasses import dataclass
from typing import TYPE_CHECKING

from django.db import transaction
from rest_framework import status
from rest_framework.exceptions import APIException

from apps.properties.models import Bed, Letting, Property, RentalUnit, Room
from apps.tenants.models import DepositTransaction, Stay, Tenant, deposit_held
from core import audit

if TYPE_CHECKING:
    from apps.accounts.models import User


class StayRuleViolation(APIException):
    status_code = status.HTTP_409_CONFLICT
    default_detail = "This change is not allowed."
    default_code = "stay_rule_violation"

    def __init__(self, detail: str, code: str) -> None:
        super().__init__(detail=detail, code=code)


@dataclass(frozen=True)
class Deduction:
    reason: str
    amount: int


Place = Bed | Room | RentalUnit


def _lock_bed(bed: Bed) -> Bed:
    from apps.properties.services import bed_rent_problem

    locked = (
        Bed.objects.select_for_update(of=("self",))
        .select_related("room__property", "room__unit")
        .get(pk=bed.pk)
    )
    if locked.status not in (Bed.Status.VACANT, Bed.Status.RESERVED):
        raise StayRuleViolation("This bed is not available.", code="bed_unavailable")
    problem = bed_rent_problem(locked)
    if problem:
        raise StayRuleViolation(problem, code="bed_not_rentable")
    return locked


def _lock_room(room: Room) -> Room:
    from apps.properties.services import has_open_stays, unit_name

    locked = (
        Room.objects.select_for_update(of=("self",))
        .select_related("property", "unit__property")
        .get(pk=room.pk)
    )
    if locked.is_archived or locked.property.status == locked.property.Status.ARCHIVED:
        raise StayRuleViolation("This room has been removed.", code="room_unavailable")
    if locked.unit is not None and locked.unit.letting == Letting.WHOLE:
        raise StayRuleViolation(
            f"{unit_name(locked.unit)} is rented as a whole. Choose the whole flat instead.",
            code="room_not_rentable",
        )
    if locked.letting != Letting.WHOLE:
        raise StayRuleViolation(
            f"Room {locked.number} is rented bed by bed. Choose a bed instead.",
            code="room_not_rentable",
        )
    if has_open_stays(room=locked):
        raise StayRuleViolation(
            f"Room {locked.number} already has a tenant.", code="room_unavailable"
        )
    return locked


def _lock_unit(unit: RentalUnit) -> RentalUnit:
    from apps.properties.services import has_open_stays, unit_name

    locked = (
        RentalUnit.objects.select_for_update(of=("self",))
        .select_related("property")
        .get(pk=unit.pk)
    )
    name = unit_name(locked)
    if locked.is_archived or locked.property.status == locked.property.Status.ARCHIVED:
        raise StayRuleViolation(f"{name} has been removed.", code="unit_unavailable")
    if locked.letting != Letting.WHOLE:
        raise StayRuleViolation(
            f"{name} is rented room by room. Choose a room or a bed instead.",
            code="unit_not_rentable",
        )
    if locked.status != RentalUnit.Status.AVAILABLE:
        raise StayRuleViolation(f"{name} is marked as not available.", code="unit_unavailable")
    if has_open_stays(unit=locked):
        raise StayRuleViolation(f"{name} already has a tenant.", code="unit_unavailable")
    return locked


def _lock_place(place: Place) -> Place:
    if isinstance(place, Bed):
        return _lock_bed(place)
    if isinstance(place, Room):
        return _lock_room(place)
    return _lock_unit(place)


def _place_fields(place: Place) -> dict[str, object]:
    """The Stay fields that point at this place (the other two are cleared)."""
    if isinstance(place, Bed):
        return {"bed": place, "room": None, "unit": None, "property_id": place.room.property_id}
    if isinstance(place, Room):
        return {"bed": None, "room": place, "unit": None, "property_id": place.property_id}
    return {"bed": None, "room": None, "unit": place, "property_id": place.property_id}


def _default_rent(place: Place) -> int:
    rent = place.monthly_rent
    if rent is None:  # only rooms/flats rented whole carry rent; readiness enforces it
        raise StayRuleViolation(
            "This place has no rent yet. Set the rent first.", code="no_rent_set"
        )
    return rent


def _free(stay: Stay) -> None:
    if stay.bed_id:
        Bed.objects.filter(pk=stay.bed_id).update(status=Bed.Status.VACANT)


def _occupy(place: Place) -> None:
    if isinstance(place, Bed):
        place.status = Bed.Status.OCCUPIED
        place.save(update_fields=["status", "updated_at"])


@transaction.atomic
def check_in(
    *,
    actor: User,
    tenant: Tenant,
    place: Place,
    check_in_date: dt.date,
    monthly_rent: int | None = None,
    deposit_amount: int = 0,
    deposit_collected: int = 0,
    notice_period_days: int = 30,
    lock_in_months: int = 0,
    agreement_end: dt.date | None = None,
) -> Stay:
    from apps.subscriptions.entitlements import check_can_add

    check_can_add(tenant.organization, "tenants")
    place = _lock_place(place)
    if Stay.objects.filter(tenant=tenant, status__in=["active", "notice"]).exists():
        raise StayRuleViolation(
            "This tenant already stays with you. Move them instead.", code="tenant_has_stay"
        )
    if deposit_collected > deposit_amount:
        raise StayRuleViolation(
            "Collected deposit cannot exceed the agreed deposit.", code="deposit_too_high"
        )
    stay = Stay.objects.create(
        organization=tenant.organization,
        created_by=actor,
        tenant=tenant,
        **_place_fields(place),
        check_in=check_in_date,
        monthly_rent=_default_rent(place) if monthly_rent is None else monthly_rent,
        deposit_amount=deposit_amount,
        notice_period_days=notice_period_days,
        lock_in_months=lock_in_months,
        agreement_end=agreement_end,
    )
    _occupy(place)
    if deposit_collected:
        _deposit_txn(
            stay,
            actor,
            DepositTransaction.Kind.COLLECTED,
            deposit_collected,
            check_in_date,
            "Collected at check-in",
        )
    audit.record(
        organization=stay.organization,
        actor=actor,
        action="stay.check_in",
        obj=stay,
        place=str(place.pk),
        place_kind=type(place).__name__.lower(),
        rent=stay.monthly_rent,
        deposit_collected=deposit_collected,
    )
    return stay


def _deposit_txn(
    stay: Stay, actor: User, kind: str, amount: int, date: dt.date, note: str
) -> DepositTransaction:
    return DepositTransaction.objects.create(
        organization=stay.organization,
        created_by=actor,
        stay=stay,
        kind=kind,
        amount=amount,
        date=date,
        note=note,
    )


def _ensure_open(stay: Stay) -> None:
    if stay.status == Stay.Status.CLOSED:
        raise StayRuleViolation("This stay is already checked out.", code="stay_closed")


@transaction.atomic
def collect_deposit(
    *, actor: User, stay: Stay, amount: int, date: dt.date, note: str = ""
) -> DepositTransaction:
    _ensure_open(stay)
    collected = sum(
        t.amount for t in stay.deposit_transactions.filter(kind=DepositTransaction.Kind.COLLECTED)
    )
    if collected + amount > stay.deposit_amount:
        raise StayRuleViolation(
            "This would collect more than the agreed deposit.", code="deposit_too_high"
        )
    txn = _deposit_txn(
        stay, actor, DepositTransaction.Kind.COLLECTED, amount, date, note or "Deposit collected"
    )
    audit.record(
        organization=stay.organization,
        actor=actor,
        action="deposit.collect",
        obj=stay,
        amount=amount,
    )
    return txn


@transaction.atomic
def give_notice(
    *, actor: User, stay: Stay, notice_date: dt.date, expected_checkout: dt.date
) -> Stay:
    _ensure_open(stay)
    if expected_checkout < notice_date or notice_date < stay.check_in:
        raise StayRuleViolation(
            "Notice must fall after check-in and before the expected checkout.",
            code="invalid_dates",
        )
    stay.status = Stay.Status.NOTICE
    stay.notice_date = notice_date
    stay.expected_checkout = expected_checkout
    stay.save(update_fields=["status", "notice_date", "expected_checkout", "updated_at"])
    audit.record(
        organization=stay.organization,
        actor=actor,
        action="stay.notice",
        obj=stay,
        expected_checkout=expected_checkout,
    )
    return stay


@transaction.atomic
def withdraw_notice(*, actor: User, stay: Stay) -> Stay:
    if stay.status != Stay.Status.NOTICE:
        raise StayRuleViolation("This stay is not on notice.", code="not_on_notice")
    stay.status = Stay.Status.ACTIVE
    stay.notice_date = None
    stay.expected_checkout = None
    stay.save(update_fields=["status", "notice_date", "expected_checkout", "updated_at"])
    return stay


@transaction.atomic
def transfer(*, actor: User, stay: Stay, new_place: Place, monthly_rent: int | None = None) -> Stay:
    """Move a tenant to another bed, room or flat (any property of the business)."""
    stay = Stay.objects.select_for_update(of=("self",)).get(pk=stay.pk)
    _ensure_open(stay)
    current = stay.bed_id or stay.room_id or stay.unit_id
    if new_place.pk == current:
        raise StayRuleViolation("The tenant already stays here.", code="same_place")
    old = {"bed": stay.bed_id, "room": stay.room_id, "unit": stay.unit_id}
    _free(stay)
    # Close the old place first so the "one tenant per place" rules see it free.
    for name, value in _place_fields(new_place).items():
        setattr(stay, name, value)
    stay.monthly_rent = _default_rent(new_place) if monthly_rent is None else monthly_rent
    new_place = _lock_place(new_place)
    stay.save()
    _occupy(new_place)
    audit.record(
        organization=stay.organization,
        actor=actor,
        action="stay.transfer",
        obj=stay,
        **{f"from_{k}": str(v) for k, v in old.items() if v},
        to=str(new_place.pk),
        to_kind=type(new_place).__name__.lower(),
        rent=stay.monthly_rent,
    )
    return stay


@transaction.atomic
def checkout(
    *, actor: User, stay: Stay, check_out_date: dt.date, deductions: list[Deduction]
) -> Stay:
    stay = Stay.objects.select_for_update().get(pk=stay.pk)
    _ensure_open(stay)
    if check_out_date < stay.check_in:
        raise StayRuleViolation("Checkout cannot be before check-in.", code="invalid_dates")
    held = deposit_held(stay)
    total_deducted = sum(d.amount for d in deductions)
    if total_deducted > held:
        raise StayRuleViolation(
            "Deductions are larger than the deposit held.", code="deductions_exceed_deposit"
        )
    for d in deductions:
        _deposit_txn(
            stay, actor, DepositTransaction.Kind.DEDUCTED, d.amount, check_out_date, d.reason
        )
    refund = held - total_deducted
    if refund:
        _deposit_txn(
            stay,
            actor,
            DepositTransaction.Kind.REFUNDED,
            refund,
            check_out_date,
            "Refunded at checkout",
        )
    stay.status = Stay.Status.CLOSED
    stay.check_out = check_out_date
    stay.save(update_fields=["status", "check_out", "updated_at"])
    _free(stay)
    audit.record(
        organization=stay.organization,
        actor=actor,
        action="stay.checkout",
        obj=stay,
        check_out=check_out_date,
        deducted=total_deducted,
        refunded=refund,
    )
    return stay


# ---------------------------------------------------------------- free places


@dataclass(frozen=True)
class FreePlace:
    kind: str  # bed | room | unit
    id: str
    label: str
    detail: str
    monthly_rent: int
    deposit: int | None
    reserved: bool


def _extras_words(room: Room) -> list[str]:
    from apps.properties.services import room_extras
    from core.money import format_inr

    return [f"{name} +{format_inr(amount)}/month" for name, amount in room_extras(room)]


def free_places(prop: Property) -> list[FreePlace]:
    """Everything in this property a new tenant can move into right now."""
    from apps.properties.services import bed_rent_problem, unit_name

    open_statuses = ("active", "notice")
    let_rooms = set(
        Stay.objects.filter(status__in=open_statuses, room__property=prop).values_list(
            "room_id", flat=True
        )
    )
    let_units = set(
        Stay.objects.filter(status__in=open_statuses, unit__property=prop).values_list(
            "unit_id", flat=True
        )
    )
    places: list[FreePlace] = []
    units = RentalUnit.objects.filter(
        property=prop, archived_at__isnull=True, letting=Letting.WHOLE
    ).order_by("code")
    for unit in units:
        if unit.status != RentalUnit.Status.AVAILABLE or unit.pk in let_units:
            continue
        if unit.monthly_rent is None:
            continue
        bits = [unit.get_unit_type_display()]
        if unit.furnishing:
            bits.append(unit.get_furnishing_display())
        places.append(
            FreePlace(
                "unit",
                str(unit.pk),
                unit_name(unit),
                " · ".join(bits),
                unit.monthly_rent,
                unit.deposit,
                False,
            )
        )
    rooms = (
        Room.objects.filter(property=prop, archived_at__isnull=True, letting=Letting.WHOLE)
        .select_related("unit")
        .order_by("number")
    )
    for room in rooms:
        if room.pk in let_rooms or room.monthly_rent is None:
            continue
        if room.unit is not None and (room.unit.letting == Letting.WHOLE or room.unit.is_archived):
            continue
        prefix = f"{unit_name(room.unit)} · " if room.unit is not None else ""
        bits = [room.get_room_type_display()]
        if room.is_ac:
            bits.append("AC")
        if room.has_attached_bath:
            bits.append("Attached bathroom")
        bits += _extras_words(room)
        places.append(
            FreePlace(
                "room",
                str(room.pk),
                f"{prefix}Room {room.number}",
                " · ".join(bits),
                room.monthly_rent,
                None,
                False,
            )
        )
    beds = (
        Bed.objects.filter(
            room__property=prop,
            archived_at__isnull=True,
            status__in=(Bed.Status.VACANT, Bed.Status.RESERVED),
        )
        .select_related("room__unit", "room__property")
        .order_by("room__number", "label")
    )
    for bed in beds:
        if bed_rent_problem(bed):
            continue
        room = bed.room
        prefix = f"{unit_name(room.unit)} · " if room.unit is not None else ""
        bits = [f"{room.sharing} sharing"]
        if room.is_ac:
            bits.append("AC")
        bits += _extras_words(room)
        places.append(
            FreePlace(
                "bed",
                str(bed.pk),
                f"{prefix}Room {room.number} · Bed {bed.label}",
                " · ".join(bits),
                bed.monthly_rent,
                None,
                bed.status == Bed.Status.RESERVED,
            )
        )
    return places
