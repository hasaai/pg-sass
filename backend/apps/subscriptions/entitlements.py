"""What a business may do under its plan. Every limit and paid feature is checked here, on the
server; screens only show what this module allows."""

from __future__ import annotations

import datetime as dt
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any

from django.utils import timezone
from rest_framework import status
from rest_framework.exceptions import APIException

from apps.subscriptions.catalog import FEATURE_KEYS, FEATURE_LABELS, LIMIT_KEYS, LIMITS

if TYPE_CHECKING:
    from apps.organizations.models import Organization
    from apps.subscriptions.models import Plan, Subscription

FREE_PLAN = "free"


class PlanLimitReached(APIException):
    status_code = status.HTTP_403_FORBIDDEN
    default_code = "plan_limit"

    def __init__(self, detail: str) -> None:
        super().__init__(detail=detail, code="plan_limit")


class FeatureNotInPlan(APIException):
    status_code = status.HTTP_403_FORBIDDEN
    default_code = "feature_disabled"

    def __init__(self, detail: str) -> None:
        super().__init__(detail=detail, code="feature_disabled")


@dataclass(frozen=True)
class Entitlements:
    plan: Plan
    subscription: Subscription | None
    status: str  # trial | active | expired | none
    limits: dict[str, int | None]
    features: frozenset[str]
    allowances: dict[str, int]
    ends_on: dt.date | None

    def has(self, feature: str) -> bool:
        return feature in self.features

    @property
    def plan_name(self) -> str:
        return self.plan.name


def _free_plan() -> Plan:
    from apps.subscriptions.models import Plan

    plan = Plan.objects.filter(key=FREE_PLAN).first()
    if plan is None:  # the seed migration always creates it; this is a safety net
        plan = Plan(key=FREE_PLAN, name="Free", limits={}, features=[])
    return plan


def for_org(org: Organization, today: dt.date | None = None) -> Entitlements:
    """The plan in force today (an ended trial or plan falls back to Free)."""
    from apps.subscriptions.models import Subscription

    today = today or timezone.localdate()
    sub = Subscription.objects.select_related("plan").filter(organization=org).first()
    if sub is None:
        plan, state, ends = _free_plan(), "none", None
    elif sub.ends_on is not None and sub.ends_on < today:
        plan, state, ends = _free_plan(), "expired", sub.ends_on
    else:
        plan, state, ends = sub.plan, sub.status, sub.ends_on
    limits: dict[str, int | None] = {k: plan.limits.get(k) for k in LIMIT_KEYS}
    if sub is not None and state != "expired":
        for k, v in (sub.limit_overrides or {}).items():
            if k in limits:
                limits[k] = v
    switched_off = set(org.disabled_features or [])
    features = frozenset(k for k in plan.features if k in FEATURE_KEYS and k not in switched_off)
    return Entitlements(
        plan=plan,
        subscription=sub,
        status=state,
        limits=limits,
        features=features,
        allowances=dict(plan.allowances or {}),
        ends_on=ends,
    )


# ---------------------------------------------------------------- usage


def usage(org: Organization) -> dict[str, int]:
    from apps.organizations.models import Membership
    from apps.properties.models import Bed, Property, Room
    from apps.tenants.models import OPEN_STAY_STATUSES, Stay

    return {
        "properties": Property.objects.filter(organization=org)
        .exclude(status=Property.Status.ARCHIVED)
        .count(),
        "rooms": Room.objects.filter(organization=org, archived_at__isnull=True)
        .exclude(property__status=Property.Status.ARCHIVED)
        .count(),
        "beds": Bed.objects.filter(organization=org, archived_at__isnull=True)
        .exclude(room__property__status=Property.Status.ARCHIVED)
        .count(),
        "tenants": Stay.objects.filter(organization=org, status__in=OPEN_STAY_STATUSES).count(),
        "team": Membership.objects.filter(organization=org, is_active=True).count(),
    }


_UNITS = {
    "properties": ("property", "properties"),
    "rooms": ("room", "rooms"),
    "beds": ("bed", "beds"),
    "tenants": ("tenant staying", "tenants staying"),
    "team": ("team member", "team members"),
}


def _plural(n: int, key: str) -> str:
    one, many = _UNITS[key]
    return f"{n} {one if n == 1 else many}"


def check_can_add(org: Organization, key: str, count: int = 1) -> None:
    """Refuse adding `count` more of `key` when the plan's limit would be passed."""
    if count <= 0:
        return
    ent = for_org(org)
    limit = ent.limits.get(key)
    if limit is None:
        return
    used = usage(org)[key]
    if used + count <= limit:
        return
    left = max(0, limit - used)
    plan = ent.plan.name
    if left == 0:
        raise PlanLimitReached(
            f"Your {plan} plan allows {_plural(limit, key)} and you have {used}. "
            "Upgrade your plan to add more."
        )
    raise PlanLimitReached(
        f"Your {plan} plan allows {_plural(limit, key)}; you can add {left} more, not {count}. "
        "Upgrade your plan to add more."
    )


def check_feature(org: Organization, feature: str) -> None:
    ent = for_org(org)
    if feature in ent.features:
        return
    label = FEATURE_LABELS.get(feature, "This feature")
    if feature in (org.disabled_features or []):
        raise FeatureNotInPlan(
            f"{label} is switched off for your business. Contact support to turn it on."
        )
    raise FeatureNotInPlan(
        f"{label} is not part of your {ent.plan.name} plan. Upgrade your plan to use it."
    )


def features_off(org: Organization) -> list[str]:
    """Feature keys the business cannot use (not in its plan, or switched off)."""
    on = for_org(org).features
    return [k for k in FEATURE_KEYS if k not in on]


def summary(org: Organization) -> dict[str, Any]:
    """Everything the owner's "Your plan" page shows."""
    from apps.subscriptions.catalog import ALLOWANCES, FEATURES

    ent = for_org(org)
    used = usage(org)
    today = timezone.localdate()
    status_words = {
        "trial": "Free trial",
        "active": "Active",
        "expired": "Ended, now on Free",
        "none": "Free",
    }
    return {
        "plan_key": ent.plan.key,
        "plan_name": ent.plan.name,
        "status": ent.status,
        "status_label": status_words[ent.status],
        "ends_on": ent.ends_on,
        "days_left": (ent.ends_on - today).days if ent.ends_on and ent.ends_on >= today else None,
        "subscribed_plan": ent.subscription.plan.key if ent.subscription else None,
        "usage": [
            {
                "key": e.key,
                "label": e.label,
                "used": used[e.key],
                "limit": ent.limits.get(e.key),
            }
            for e in LIMITS
        ],
        "features": [
            {"key": e.key, "label": e.label, "on": e.key in ent.features} for e in FEATURES
        ],
        "allowances": [
            {"key": e.key, "label": e.label, "per_month": ent.allowances.get(e.key, 0)}
            for e in ALLOWANCES
        ],
    }
