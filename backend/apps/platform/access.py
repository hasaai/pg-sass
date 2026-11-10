"""Platform (PG Manager team) permissions and roles: the only list of what each person on
the platform team may do. Business permissions are in core/access.py.

A person on the team is a user with ``is_staff`` and a ``PlatformStaff`` row. Their
permissions are their role's set, plus their own extra ticks, minus their removed ticks.
A Platform owner always has every permission, and at least one always remains.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from core.access import Permission

if TYPE_CHECKING:
    from apps.platform.models import PlatformStaff

PLATFORM_PERMISSIONS: tuple[Permission, ...] = (
    Permission("p.overview.view", "Overview", "Platform overview and counts"),
    Permission("p.businesses.view", "Businesses", "Business list and details"),
    Permission("p.businesses.suspend", "Businesses", "Suspend or reactivate a business"),
    Permission("p.businesses.features", "Businesses", "Switch features off for a business"),
    Permission(
        "p.business_data.view",
        "Businesses",
        "Open any business and see everything inside it",
    ),
    Permission(
        "p.business_data.edit", "Businesses", "Change anything inside any business, as its owner"
    ),
    Permission("p.plans.manage", "Money", "Create and edit membership plans"),
    Permission(
        "p.subscriptions.assign", "Money", "Give a business a plan, end date and custom limits"
    ),
    Permission("p.payments.view", "Money", "Plan payments list"),
    Permission("p.gateways.manage", "Money", "Payment gateways on or off"),
    Permission("p.verification.review", "Checking", "Verify, ask for changes or refuse properties"),
    Permission(
        "p.documents.download",
        "Checking",
        "Open private property documents (every download recorded)",
    ),
    Permission("p.users.view", "Support", "Search people by name, email or mobile"),
    Permission("p.users.help", "Support", "Resend codes, confirm a mobile, sign someone out"),
    Permission("p.users.deactivate", "Support", "Switch a person's sign-in off or on"),
    Permission("p.activity.view", "Support", "Activity log"),
    Permission("p.catalog.manage", "Settings", "Amenity catalog"),
    Permission("p.sms.manage", "Settings", "SMS gateways and keys"),
    Permission("p.staff.manage", "Settings", "Add platform staff, set their role and ticks"),
)

PLATFORM_CODES: frozenset[str] = frozenset(p.code for p in PLATFORM_PERMISSIONS)
PLATFORM_LABELS: dict[str, str] = {p.code: p.label for p in PLATFORM_PERMISSIONS}

_EVERYONE = {"p.overview.view", "p.businesses.view", "p.activity.view"}

PLATFORM_ROLE_PERMISSIONS: dict[str, frozenset[str]] = {
    "platform_owner": PLATFORM_CODES,
    "finance_admin": frozenset(
        _EVERYONE
        | {"p.plans.manage", "p.subscriptions.assign", "p.payments.view", "p.gateways.manage"}
    ),
    "support_agent": frozenset(
        _EVERYONE | {"p.businesses.features", "p.users.view", "p.users.help"}
    ),
    "verification_reviewer": frozenset(
        _EVERYONE | {"p.verification.review", "p.documents.download"}
    ),
}

PLATFORM_ROLE_HELP: dict[str, str] = {
    "platform_owner": "Everything on the platform and inside every business. Manages the team.",
    "finance_admin": "Membership plans, giving plans to businesses, plan payments and gateways.",
    "support_agent": "Helps businesses and people: finds users, switches features, resends codes.",
    "verification_reviewer": "Checks properties and their private documents.",
}


def platform_role_permissions(role: str) -> frozenset[str]:
    return PLATFORM_ROLE_PERMISSIONS.get(role, frozenset())


def staff_permissions(staff: PlatformStaff | None) -> frozenset[str]:
    if staff is None:
        return frozenset()
    if staff.role == "platform_owner":
        return PLATFORM_CODES
    extra = set(staff.extra_permissions or []) & PLATFORM_CODES
    removed = set(staff.removed_permissions or [])
    return frozenset((platform_role_permissions(staff.role) | extra) - removed)


def user_platform_permissions(user: Any) -> frozenset[str]:
    """What this user may do on the platform (nothing unless on the platform team)."""
    if not (user and user.is_authenticated and user.is_active and user.is_staff):
        return frozenset()
    from apps.platform.models import PlatformStaff

    cache = user.__dict__
    if "_platform_permissions" not in cache:
        staff = PlatformStaff.objects.filter(user=user).first()
        cache["_platform_permissions"] = staff_permissions(staff)
    result: frozenset[str] = cache["_platform_permissions"]
    return result


def has_platform_permission(user: Any, code: str) -> bool:
    return code in user_platform_permissions(user)
