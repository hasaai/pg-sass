"""Rent reminders.

Operators can open a ready-written WhatsApp message (no provider or API key needed),
send emails, or let `python manage.py send_rent_reminders` run daily from a scheduler.
The same invoice is never reminded twice on the same channel within REMIND_GAP_DAYS.
"""

from __future__ import annotations

import datetime as dt
from typing import TYPE_CHECKING, Any
from urllib.parse import quote

from django.db.models import F, Max, Q, QuerySet
from django.utils import timezone

from apps.billing.models import Invoice, RentReminder
from apps.tenants.places import PLACE_RELATED
from core import notify
from core.money import format_inr

if TYPE_CHECKING:
    from apps.accounts.models import User
    from apps.organizations.models import Organization

REMIND_GAP_DAYS = 3
DUE_SOON_DAYS = 3


def due_invoices(organization: Organization | None = None) -> QuerySet[Invoice]:
    """Unpaid invoices that are overdue or due within the next few days."""
    today = timezone.localdate()
    queryset = (
        Invoice.objects.filter(
            paid__lt=F("total"), due_date__lte=today + dt.timedelta(DUE_SOON_DAYS)
        )
        .exclude(status=Invoice.Status.VOID)
        .filter(stay__status__in=["active", "notice"])
        .select_related("organization", "stay__tenant", *(f"stay__{p}" for p in PLACE_RELATED))
        .annotate(last_reminded_at=Max("reminders__created_at"))
        .order_by("due_date", "number")
    )
    if organization is not None:
        queryset = queryset.filter(organization=organization)
    return queryset


def message_for(invoice: Invoice) -> str:
    tenant = invoice.stay.tenant
    prop = invoice.stay.property
    today = timezone.localdate()
    when = (
        f"was due on {invoice.due_date:%d %b}"
        if invoice.due_date < today
        else f"is due on {invoice.due_date:%d %b}"
    )
    return (
        f"Hi {tenant.full_name.split()[0]}, a friendly reminder from {prop.name}: "
        f"rent of {format_inr(invoice.balance)} for {invoice.period:%B %Y} {when} "
        f"(invoice {invoice.number}). Please pay by UPI or at the office. Thank you! "
        f"- {invoice.organization.name}"
    )


def whatsapp_url(invoice: Invoice) -> str:
    return f"https://wa.me/91{invoice.stay.tenant.phone}?text={quote(message_for(invoice))}"


def reminded_recently(invoice: Invoice, channel: str) -> bool:
    cutoff = timezone.now() - dt.timedelta(days=REMIND_GAP_DAYS)
    return invoice.reminders.filter(channel=channel, created_at__gte=cutoff).exists()


def log(
    invoice: Invoice, channel: str, actor: User | None, automatic: bool = False
) -> RentReminder:
    return RentReminder.objects.create(
        organization=invoice.organization,
        created_by=actor,
        invoice=invoice,
        channel=channel,
        automatic=automatic,
    )


def send_email(invoice: Invoice, actor: User | None, automatic: bool = False) -> str:
    """Return 'sent', 'skipped_recent' or 'no_email'."""
    tenant = invoice.stay.tenant
    if not tenant.email:
        return "no_email"
    if reminded_recently(invoice, RentReminder.Channel.EMAIL):
        return "skipped_recent"
    if notify.email(tenant.email, f"Rent reminder: {invoice.period:%B %Y}", message_for(invoice)):
        log(invoice, RentReminder.Channel.EMAIL, actor, automatic)
        return "sent"
    return "failed"


def run_automatic(today: dt.date | None = None) -> dict[str, Any]:
    """Daily job across all organizations: email every due/overdue tenant at most every 3 days."""
    results: dict[str, int] = {"sent": 0, "skipped_recent": 0, "no_email": 0, "failed": 0}
    for invoice in due_invoices().filter(~Q(organization__status="suspended")):
        results[send_email(invoice, actor=None, automatic=True)] += 1
    return results
