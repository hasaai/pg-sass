"""Business permissions and roles: the only list of what a person in a business may do.

Every organization-scoped endpoint names one permission per action (``permission_map`` on
the view); ``core.permissions.OrgRolePermission`` checks it. A person's permissions are
their role's set, plus their own extra ticks, minus their removed ticks
(``Membership.extra_permissions`` / ``removed_permissions``). An owner always has all.

Changing what a role may do is a change to ``ROLE_PERMISSIONS`` here; the access contract
test (core/tests/test_access.py) then shows exactly which endpoints changed.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING, Any

from django.db.models import Q, QuerySet

if TYPE_CHECKING:
    from apps.organizations.models import Membership


@dataclass(frozen=True)
class Permission:
    code: str
    area: str
    label: str


PERMISSIONS: tuple[Permission, ...] = (
    Permission("dashboard.view", "Dashboard", "See the dashboard, the plan and notices"),
    Permission("properties.view", "Properties", "See properties, rooms and beds"),
    Permission(
        "properties.manage",
        "Properties",
        "Add or change properties, rooms, beds, amenities and photos",
    ),
    Permission("properties.documents", "Properties", "Property documents and sending for checking"),
    Permission("tenants.view", "Tenants", "See tenants and their stays"),
    Permission("tenants.manage", "Tenants", "Add tenants, check in, move, notice, check out"),
    Permission("tenants.id_documents", "Tenants", "Tenant agreements and ID documents"),
    Permission("rent.view", "Rent", "See bills, payments and dues"),
    Permission("rent.collect", "Rent", "Record payments and send rent reminders"),
    Permission("rent.adjust", "Rent", "Make or cancel bills, add charges, deposits and refunds"),
    Permission("expenses.view", "Money", "See expenses and profit"),
    Permission("expenses.manage", "Money", "Add or change expenses"),
    Permission("salaries.manage", "Money", "Staff list and salary payments"),
    Permission("reports.download", "Money", "Download reports"),
    Permission("complaints.manage", "Operations", "See and handle complaints"),
    Permission("complaints.delete", "Operations", "Delete complaints"),
    Permission("notices.manage", "Operations", "Post and change notices"),
    Permission("listings.manage", "Marketplace", "Listings, applications and enquiries"),
    Permission("team.view", "Business", "See the team"),
    Permission("team.manage", "Business", "Add people, change their role and access"),
    Permission("business.settings", "Business", "Business details and logo"),
    Permission("plan.view", "Business", "See membership plan payments"),
    Permission("plan.billing", "Business", "Choose and pay for the membership plan"),
    Permission("activity.view", "Business", "See the activity log"),
    Permission("owner.verification", "Business", "Send the owner identity check"),
)

PERMISSION_CODES: frozenset[str] = frozenset(p.code for p in PERMISSIONS)
PERMISSION_LABELS: dict[str, str] = {p.code: p.label for p in PERMISSIONS}

_OWNER_ONLY = {
    "team.manage",
    "business.settings",
    "plan.billing",
    "activity.view",
    "owner.verification",
}

ROLE_PERMISSIONS: dict[str, frozenset[str]] = {
    "owner": PERMISSION_CODES,
    "manager": PERMISSION_CODES - _OWNER_ONLY,
    "accountant": frozenset(
        {
            "dashboard.view",
            "properties.view",
            "tenants.view",
            "rent.view",
            "rent.collect",
            "rent.adjust",
            "expenses.view",
            "expenses.manage",
            "salaries.manage",
            "reports.download",
            "plan.view",
        }
    ),
    # Shown to people as "Caretaker".
    "staff": frozenset({"dashboard.view", "properties.view", "tenants.view", "complaints.manage"}),
}

# Shown on the Team screen next to each role.
ROLE_HELP: dict[str, str] = {
    "owner": "Everything, including the team, business settings and the membership plan.",
    "manager": "Runs the PGs day to day: properties, tenants, rent, money and complaints.",
    "accountant": "Rent, payments, expenses, salaries and reports. Cannot add tenants.",
    "staff": "Sees properties and tenants and handles complaints. No money.",
}


def role_permissions(role: str) -> frozenset[str]:
    return ROLE_PERMISSIONS.get(role, frozenset())


def effective_permissions(membership: Membership) -> frozenset[str]:
    """What this person may do in this business: role + extra ticks - removed ticks."""
    if membership.role == "owner":
        return PERMISSION_CODES
    extra = set(membership.extra_permissions or []) & PERMISSION_CODES
    removed = set(membership.removed_permissions or [])
    return frozenset((role_permissions(membership.role) | extra) - removed)


def has_permission(membership: Membership, code: str) -> bool:
    return code in effective_permissions(membership)


# --- Property access -------------------------------------------------------------------
# A person can be limited to some properties (``Membership.properties``; empty = all).
# Every business record below is reached through its property; lists, lookups, dashboard
# numbers, reports and dropdown choices all go through ``limit_to_properties``.
PROPERTY_PATH: dict[str, str] = {
    "properties.Property": "pk",
    "properties.Floor": "property",
    "properties.RentalUnit": "property",
    "properties.Room": "property",
    "properties.Bed": "room__property",
    "properties.RoomFeature": "room__property",
    "properties.PropertyPhoto": "property",
    "properties.PropertyDocument": "property",
    "properties.VerificationEvent": "property",
    "amenities.PropertyAmenity": "property",
    "tenants.Stay": "property",
    "tenants.DepositTransaction": "stay__property",
    "billing.Invoice": "stay__property",
    "billing.InvoiceLine": "invoice__stay__property",
    "billing.Payment": "invoice__stay__property",
    "billing.RentReminder": "invoice__stay__property",
    "operations.Complaint": "property",
    # A notice with no property is for the whole business; everyone sees it.
    "operations.Notice": "property",
    "listings.Listing": "property",
    "listings.ListingPhoto": "listing__property",
    "listings.Enquiry": "listing__property",
    "applications.Application": "listing__property",
    # Expenses and staff with no property are business-level money: only people with
    # all properties see them.
    "finance.Employee": "property",
    "finance.Expense": "property",
}
SHOWN_WITHOUT_PROPERTY = frozenset({"operations.Notice"})
# Records that are about the business, not one property (never limited).
BUSINESS_WIDE = frozenset(
    {
        "core.AuditLog",
        "organizations.Membership",
        "billing.DocumentCounter",
        "subscriptions.Subscription",
        "subscriptions.SubscriptionEvent",
        "subscriptions.PlanPayment",
        "onboarding.OwnerVerification",
        "onboarding.OwnerDocument",
        "onboarding.OwnerVerificationEvent",
    }
)


def allowed_property_ids(membership: Membership | None) -> frozenset[Any] | None:
    """The properties this person may see, or None for all of them."""
    if membership is None or membership.role == "owner" or membership.pk is None:
        return None
    cache = membership.__dict__
    if _CACHE not in cache:
        cache[_CACHE] = frozenset(membership.properties.values_list("pk", flat=True)) or None
    result: frozenset[Any] | None = cache[_CACHE]
    return result


def forget_property_cache(membership: Membership) -> None:
    membership.__dict__.pop(_CACHE, None)


_CACHE = "_allowed_property_ids"


def limit_to_properties(queryset: QuerySet[Any], membership: Membership | None) -> QuerySet[Any]:
    """Keep only rows in the properties this person may see (all rows if not limited)."""
    ids = allowed_property_ids(membership)
    if ids is None:
        return queryset
    label = queryset.model._meta.label
    if label == "tenants.Tenant":
        from django.db.models import Exists, OuterRef

        from apps.tenants.models import Stay

        # A tenant is seen through their stays; a tenant not yet checked in anywhere is
        # seen by everyone who can see tenants.
        any_stay = Stay.objects.filter(tenant=OuterRef("pk"))
        return queryset.filter(Exists(any_stay.filter(property__in=ids)) | ~Exists(any_stay))
    path = PROPERTY_PATH.get(label)
    if path is None:
        return queryset
    condition = Q(**{f"{path}__in": ids})
    if label in SHOWN_WITHOUT_PROPERTY:
        condition |= Q(**{f"{path}__isnull": True})
    return queryset.filter(condition)


def sees_all_properties(membership: Membership | None) -> bool:
    return allowed_property_ids(membership) is None


def visible(model: Any, request: Any) -> QuerySet[Any]:
    """All rows of ``model`` the caller may see: their business, limited to their properties."""
    queryset = model.objects.filter(organization=request.organization)
    return limit_to_properties(queryset, getattr(request, "membership", None))
