"""Rent ledger rules.

* A billing period is a calendar month.
* Rent for a month the tenant only partly stays (check-in or checkout inside
  the month) is pro-rated by day, both days inclusive.
* Rent is due on the property's ``rent_due_day``; an invoice issued later than
  that is due on its issue date.
* A payment can never exceed the invoice balance, and a payment sent twice
  with the same Idempotency-Key is recorded once.
"""

from __future__ import annotations

import calendar
import datetime as dt
from collections.abc import Collection
from typing import TYPE_CHECKING, Any

from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from rest_framework import status
from rest_framework.exceptions import APIException

from apps.billing.models import DocumentCounter, Invoice, InvoiceLine, Payment
from apps.properties.services import room_extras
from apps.tenants.models import Stay
from apps.tenants.places import PLACE_RELATED
from core import audit
from core.money import prorate

if TYPE_CHECKING:
    from apps.accounts.models import User
    from apps.organizations.models import Organization


class BillingRuleViolation(APIException):
    status_code = status.HTTP_409_CONFLICT
    default_detail = "This change is not allowed."
    default_code = "billing_rule_violation"

    def __init__(self, detail: str, code: str) -> None:
        super().__init__(detail=detail, code=code)


def month_bounds(period: dt.date) -> tuple[dt.date, dt.date, int]:
    start = period.replace(day=1)
    days = calendar.monthrange(start.year, start.month)[1]
    return start, start.replace(day=days), days


def next_number(organization: Organization, name: str, prefix: str) -> str:
    counter, _ = DocumentCounter.objects.get_or_create(organization=organization, name=name)
    counter = DocumentCounter.objects.select_for_update().get(pk=counter.pk)
    counter.value += 1
    counter.save(update_fields=["value", "updated_at"])
    return f"{prefix}-{counter.value:05d}"


def rent_for_period(stay: Stay, period: dt.date) -> tuple[int, dt.date, dt.date] | None:
    """Return (amount, from, to) for the days of ``period`` the stay covers."""
    start, end, days = month_bounds(period)
    stay_end = stay.check_out or end
    first = max(stay.check_in, start)
    last = min(stay_end, end)
    if first > last:
        return None
    used = (last - first).days + 1
    amount = stay.monthly_rent if used == days else prorate(stay.monthly_rent, used, days)
    return (amount, first, last) if amount > 0 else None


def _refresh_status(invoice: Invoice) -> None:
    if invoice.status == Invoice.Status.VOID:
        return
    if invoice.paid == 0:
        invoice.status = Invoice.Status.ISSUED
    elif invoice.paid < invoice.total:
        invoice.status = Invoice.Status.PARTIALLY_PAID
    else:
        invoice.status = Invoice.Status.PAID


@transaction.atomic
def generate_invoices(
    *,
    organization: Organization,
    actor: User,
    period: dt.date,
    property_id: str | None = None,
    property_ids: Collection[Any] | None = None,
) -> list[Invoice]:
    start, end, _ = month_bounds(period)
    today = timezone.localdate()
    stays = (
        Stay.objects.for_org(organization)
        .select_related(*PLACE_RELATED, "tenant")
        .filter(check_in__lte=end)
        .filter(Q(check_out__isnull=True) | Q(check_out__gte=start))
        .exclude(
            pk__in=Invoice.objects.for_org(organization)
            .filter(period=start)
            .exclude(status=Invoice.Status.VOID)
            .values("stay_id")
        )
    )
    if property_ids is not None:
        stays = stays.filter(property_id__in=property_ids)
    if property_id:
        stays = stays.filter(property_id=property_id)

    created: list[Invoice] = []
    for stay in stays.order_by("check_in"):
        rent = rent_for_period(stay, start)
        if rent is None:
            continue
        amount, first, last = rent
        _, _, days = month_bounds(start)
        used = (last - first).days + 1
        label = f"Rent {first:%d %b} to {last:%d %b %Y}"
        if (first, last) != (start, end):
            label += " (pro-rated)"
        lines: list[tuple[str, str, int]] = [(InvoiceLine.Kind.RENT, label, amount)]
        for name, monthly in room_extras(stay.bed.room if stay.bed is not None else stay.room):
            extra = monthly if used == days else prorate(monthly, used, days)
            if extra > 0:
                lines.append((InvoiceLine.Kind.OTHER, f"{name} (extra charge)", extra))
        prop = stay.property
        due = max(start.replace(day=prop.rent_due_day), today)
        invoice = Invoice.objects.create(
            organization=organization,
            created_by=actor,
            stay=stay,
            number=next_number(organization, "invoice", f"INV-{start:%Y%m}"),
            period=start,
            issue_date=today,
            due_date=due,
            total=sum(line[2] for line in lines),
        )
        InvoiceLine.objects.bulk_create(
            InvoiceLine(
                organization=organization,
                created_by=actor,
                invoice=invoice,
                kind=kind,
                description=description,
                amount=line_amount,
            )
            for kind, description, line_amount in lines
        )
        created.append(invoice)
    if created:
        audit.record(
            organization=organization,
            actor=actor,
            action="invoice.generate",
            obj=created[0],
            period=start,
            count=len(created),
        )
    return created


def _lock(invoice: Invoice) -> Invoice:
    return Invoice.objects.select_for_update().get(pk=invoice.pk)


@transaction.atomic
def add_charge(
    *, actor: User, invoice: Invoice, kind: str, description: str, amount: int
) -> Invoice:
    invoice = _lock(invoice)
    if invoice.status == Invoice.Status.VOID:
        raise BillingRuleViolation("You cannot add charges to a void invoice.", code="invoice_void")
    InvoiceLine.objects.create(
        organization=invoice.organization,
        created_by=actor,
        invoice=invoice,
        kind=kind,
        description=description,
        amount=amount,
    )
    invoice.total += amount
    _refresh_status(invoice)
    invoice.save(update_fields=["total", "status", "updated_at"])
    audit.record(
        organization=invoice.organization,
        actor=actor,
        action="invoice.charge",
        obj=invoice,
        kind=kind,
        amount=amount,
    )
    return invoice


@transaction.atomic
def void_invoice(*, actor: User, invoice: Invoice, reason: str) -> Invoice:
    invoice = _lock(invoice)
    if invoice.status == Invoice.Status.VOID:
        raise BillingRuleViolation("This invoice is already void.", code="invoice_void")
    if invoice.paid:
        raise BillingRuleViolation(
            "An invoice with payments cannot be voided.", code="invoice_has_payments"
        )
    invoice.status = Invoice.Status.VOID
    invoice.void_reason = reason
    invoice.save(update_fields=["status", "void_reason", "updated_at"])
    audit.record(
        organization=invoice.organization,
        actor=actor,
        action="invoice.void",
        obj=invoice,
        reason=reason,
    )
    return invoice


@transaction.atomic
def record_payment(
    *,
    actor: User,
    invoice: Invoice,
    amount: int,
    mode: str,
    received_on: dt.date,
    reference: str = "",
    idempotency_key: str | None = None,
) -> tuple[Payment, bool]:
    """Return (payment, created). A repeated idempotency key returns the original."""
    if idempotency_key:
        existing = Payment.objects.filter(
            organization=invoice.organization, idempotency_key=idempotency_key
        ).first()
        if existing is not None:
            if existing.invoice_id != invoice.pk or existing.amount != amount:
                raise BillingRuleViolation(
                    "This Idempotency-Key was already used for a different payment.",
                    code="idempotency_key_reused",
                )
            return existing, False
    invoice = _lock(invoice)
    if invoice.status == Invoice.Status.VOID:
        raise BillingRuleViolation("This invoice is void.", code="invoice_void")
    if amount > invoice.balance:
        raise BillingRuleViolation(
            f"The payment is more than the balance due ({invoice.balance} paise).",
            code="overpayment",
        )
    payment = Payment.objects.create(
        organization=invoice.organization,
        created_by=actor,
        invoice=invoice,
        receipt_number=next_number(invoice.organization, "receipt", "RCPT"),
        amount=amount,
        mode=mode,
        reference=reference,
        received_on=received_on,
        idempotency_key=idempotency_key or None,
    )
    invoice.paid += amount
    _refresh_status(invoice)
    invoice.save(update_fields=["paid", "status", "updated_at"])
    audit.record(
        organization=invoice.organization,
        actor=actor,
        action="payment.record",
        obj=payment,
        invoice=invoice.pk,
        amount=amount,
        mode=mode,
    )
    return payment, True
