"""The starting plans and payment gateways (used by the seed migration and seed_demo)."""

from __future__ import annotations

from typing import Any

ALL_FEATURES = [
    "reminders",
    "finance",
    "staff",
    "complaints",
    "notices",
    "marketplace",
    "verification",
    "csv_import",
    "room_extras",
    "logo",
    "reports_download",
]
CORE = ["complaints", "notices"]
BASIC = [*CORE, "reminders", "verification", "csv_import", "logo"]
PLANS: list[tuple[Any, ...]] = [
    # key, name, description, month, year, limits, features, allowances, trial_days, public
    (
        "free",
        "Free",
        "For one small PG getting started.",
        0,
        0,
        {"properties": 1, "rooms": 15, "beds": 25, "tenants": 25, "team": 1},
        CORE,
        {},
        0,
        True,
    ),
    (
        "basic",
        "Basic",
        "Rent reminders, tenant verification and CSV upload for up to 2 properties.",
        49900,
        499000,
        {"properties": 2, "rooms": 40, "beds": 80, "tenants": 80, "team": 3},
        BASIC,
        {},
        0,
        True,
    ),
    (
        "pro",
        "Pro",
        "Everything, for up to 5 properties.",
        149900,
        1499000,
        {"properties": 5, "rooms": 150, "beds": 300, "tenants": 300, "team": 10},
        ALL_FEATURES,
        {"ekyc_checks": 50},
        14,
        True,
    ),
    (
        "business",
        "Business",
        "No limits; price agreed with the business.",
        0,
        0,
        {},
        ALL_FEATURES,
        {"ekyc_checks": 300},
        0,
        False,
    ),
]


GATEWAYS = [("razorpay", True, True), ("cashfree", True, False), ("paytm", False, False)]


def ensure_defaults(plan_model: Any, gateway_model: Any) -> dict[str, Any]:
    """Create the starting plans and gateways if missing; return plans by key."""
    plans = {}
    for pos, (key, name, desc, month, year, limits, features, allow, trial, public) in enumerate(
        PLANS
    ):
        plans[key], _ = plan_model.objects.get_or_create(
            key=key,
            defaults={
                "name": name,
                "description": desc,
                "price_month": month,
                "price_year": year,
                "limits": limits,
                "features": features,
                "allowances": allow,
                "trial_days": trial,
                "is_public": public,
                "position": pos,
            },
        )
    for pos, (code, enabled, default) in enumerate(GATEWAYS):
        gateway_model.objects.get_or_create(
            code=code, defaults={"is_enabled": enabled, "is_default": default, "position": pos}
        )
    return plans
