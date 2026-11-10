"""Modules the platform team can switch off for one business (Platform admin → Businesses).

A view opts in with ``feature = "<key>"``; ``OrgRolePermission`` refuses requests to a
switched-off module with 403 ``feature_disabled``. Properties, tenants, rent and the
dashboard are the core and cannot be switched off.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Feature:
    key: str
    label: str
    description: str


FEATURES: tuple[Feature, ...] = (
    Feature("reminders", "Rent reminders", "WhatsApp and email reminders for unpaid rent."),
    Feature("finance", "Expenses & profit", "Expenses, monthly profit and the CSV report."),
    Feature("staff", "Staff & salaries", "Staff list and monthly salary payments."),
    Feature("complaints", "Complaints", "Tenant complaints and their resolution."),
    Feature("notices", "Notices", "Notices to tenants of a property."),
    Feature(
        "marketplace",
        "Marketplace",
        "Public listings, enquiries and online applications. Switching it off hides the "
        "business's listings.",
    ),
)
FEATURE_KEYS = frozenset(f.key for f in FEATURES)
