"""Plan changes: trials, assignment by the platform team, and online payments."""

from __future__ import annotations

import calendar
import datetime as dt
from typing import TYPE_CHECKING, Any

from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.subscriptions.catalog import ALLOWANCE_KEYS, FEATURE_KEYS, LIMIT_KEYS
from apps.subscriptions.models import Plan, PlanPayment, Subscription, SubscriptionEvent
from core import audit

if TYPE_CHECKING:
    from apps.accounts.models import User
    from apps.organizations.models import Organization

TRIAL_PLAN = "pro"


def add_months(day: dt.date, months: int) -> dt.date:
    month = day.month - 1 + months
    year = day.year + month // 12
    month = month % 12 + 1
    return day.replace(
        year=year, month=month, day=min(day.day, calendar.monthrange(year, month)[1])
    )


def start_trial(org: Organization) -> Subscription | None:
    """New businesses get the trial plan for its trial days, then fall back to Free."""
    if Subscription.objects.filter(organization=org).exists():
        return None
    today = timezone.localdate()
    plan = Plan.objects.filter(key=TRIAL_PLAN, is_active=True, trial_days__gt=0).first()
    if plan is not None:
        sub = Subscription.objects.create(
            organization=org,
            plan=plan,
            status=Subscription.Status.TRIAL,
            starts_on=today,
            ends_on=today + dt.timedelta(days=plan.trial_days),
        )
        kind = SubscriptionEvent.Kind.TRIAL
    else:
        free = Plan.objects.filter(key="free").first()
        if free is None:
            return None
        sub = Subscription.objects.create(
            organization=org, plan=free, status=Subscription.Status.ACTIVE, starts_on=today
        )
        kind = SubscriptionEvent.Kind.ASSIGNED
    SubscriptionEvent.objects.create(
        organization=org, kind=kind, to_plan=sub.plan, ends_on=sub.ends_on
    )
    return sub


def clean_plan_values(data: dict[str, Any]) -> dict[str, Any]:
    """Keep only known keys; limits are whole numbers or None (= no limit)."""
    out = dict(data)
    if "limits" in data:
        limits: dict[str, int | None] = {}
        for key, value in (data["limits"] or {}).items():
            if key not in LIMIT_KEYS:
                raise ValidationError({"limits": f"Unknown limit “{key}”."})
            if value is not None and (not isinstance(value, int) or value < 0):
                raise ValidationError({"limits": f"{key}: enter a whole number, or leave empty."})
            limits[key] = value
        out["limits"] = limits
    if "features" in data:
        unknown = sorted(set(data["features"] or []) - set(FEATURE_KEYS))
        if unknown:
            raise ValidationError({"features": f"Unknown features: {', '.join(unknown)}."})
        out["features"] = sorted(set(data["features"] or []))
    if "allowances" in data:
        allowances: dict[str, int] = {}
        for key, value in (data["allowances"] or {}).items():
            if key not in ALLOWANCE_KEYS or not isinstance(value, int) or value < 0:
                raise ValidationError({"allowances": f"{key}: enter a whole number."})
            allowances[key] = value
        out["allowances"] = allowances
    return out


@transaction.atomic
def assign_plan(
    *,
    org: Organization,
    plan: Plan,
    actor: User,
    ends_on: dt.date | None,
    limit_overrides: dict[str, int | None] | None = None,
    note: str = "",
) -> Subscription:
    overrides = clean_plan_values({"limits": limit_overrides or {}})["limits"]
    today = timezone.localdate()
    sub = Subscription.objects.select_for_update().filter(organization=org).first()
    before = sub.plan if sub else None
    if sub is None:
        sub = Subscription(organization=org, starts_on=today)
    if before is None or before.pk != plan.pk:
        sub.starts_on = today
    sub.plan = plan
    sub.status = Subscription.Status.ACTIVE
    sub.ends_on = ends_on
    sub.limit_overrides = overrides
    sub.note = note[:255]
    sub.save()
    SubscriptionEvent.objects.create(
        organization=org,
        created_by=actor,
        kind=SubscriptionEvent.Kind.ASSIGNED,
        from_plan=before,
        to_plan=plan,
        ends_on=ends_on,
        note=note[:255],
    )
    audit.record(
        organization=org,
        actor=actor,
        action="platform.plan_assigned",
        obj=org,
        plan=plan.key,
        ends_on=str(ends_on or ""),
    )
    return sub


def price_for(plan: Plan, period: str) -> int:
    return plan.price_year if period == PlanPayment.Period.YEAR else plan.price_month


@transaction.atomic
def apply_payment(payment: PlanPayment, gateway_payment_id: str) -> PlanPayment:
    """Mark a payment paid and start or extend the plan. Safe to call twice."""
    payment = PlanPayment.objects.select_for_update().get(pk=payment.pk)
    if payment.status == PlanPayment.Status.PAID:
        return payment
    today = timezone.localdate()
    org = payment.organization
    sub = Subscription.objects.select_for_update().filter(organization=org).first()
    before = sub.plan if sub else None
    months = 12 if payment.period == PlanPayment.Period.YEAR else 1
    same_paid_plan = (
        sub is not None
        and sub.plan_id == payment.plan_id
        and sub.status == Subscription.Status.ACTIVE
        and sub.ends_on is not None
        and sub.ends_on >= today
    )
    start = sub.ends_on if same_paid_plan and sub and sub.ends_on else today
    if sub is None:
        sub = Subscription(organization=org, starts_on=today)
    if not same_paid_plan:
        sub.starts_on = today
    sub.plan = payment.plan
    sub.status = Subscription.Status.ACTIVE
    sub.ends_on = add_months(start, months)
    sub.save()
    payment.status = PlanPayment.Status.PAID
    payment.gateway_payment_id = gateway_payment_id[:100]
    payment.paid_at = timezone.now()
    payment.save(update_fields=["status", "gateway_payment_id", "paid_at", "updated_at"])
    SubscriptionEvent.objects.create(
        organization=org,
        created_by=payment.created_by,
        kind=SubscriptionEvent.Kind.PAID,
        from_plan=before,
        to_plan=payment.plan,
        ends_on=sub.ends_on,
        note=f"{payment.get_gateway_display()} {payment.gateway_payment_id}",
    )
    audit.record(
        organization=org,
        actor=payment.created_by,
        action="subscription.paid",
        obj=payment,
        plan=payment.plan.key,
        amount=payment.amount,
        gateway=payment.gateway,
    )
    return payment


def mark_failed(payment: PlanPayment, reason: str) -> None:
    if payment.status == PlanPayment.Status.CREATED:
        payment.status = PlanPayment.Status.FAILED
        payment.failure_reason = reason[:255]
        payment.save(update_fields=["status", "failure_reason", "updated_at"])
