"""Everything a membership plan can control. One list, used by the admin form, the checks
and the owner's "Your plan" page, so they always agree."""

from __future__ import annotations

from dataclasses import dataclass

from core.features import FEATURES as MODULES


@dataclass(frozen=True)
class Entry:
    key: str
    label: str
    description: str = ""


# Numbers; None (empty in the form) means no limit.
LIMITS: tuple[Entry, ...] = (
    Entry("properties", "Properties", "Properties not removed"),
    Entry("rooms", "Rooms", "Rooms not removed, in all properties"),
    Entry("beds", "Beds", "Beds not removed, in all properties"),
    Entry("tenants", "Tenants staying", "Tenants staying now or leaving soon"),
    Entry("team", "Team members", "Active owners, managers and staff"),
)
LIMIT_KEYS = tuple(e.key for e in LIMITS)

# Reset on the 1st of every month.
ALLOWANCES: tuple[Entry, ...] = (
    Entry("ekyc_checks", "DigiLocker e-KYC checks a month", "Paid per check (coming with e-KYC)"),
)
ALLOWANCE_KEYS = tuple(e.key for e in ALLOWANCES)

# On / off. The modules that the platform team could already switch off, plus plan-only ones.
FEATURES: tuple[Entry, ...] = (
    *(Entry(m.key, m.label, m.description) for m in MODULES),
    Entry(
        "verification", "Tenant verification", "ID check, selfie and police verification tracker"
    ),
    Entry("csv_import", "Upload rooms from CSV", "Add many rooms and beds from a file"),
    Entry("room_extras", "Room extras on rent bills", "Charge extra for a balcony, AC …"),
    Entry("logo", "Logo on receipts", "Business and property logos"),
    Entry("reports_download", "Reports download", "Monthly report and collections as CSV"),
)
FEATURE_KEYS = tuple(e.key for e in FEATURES)
FEATURE_LABELS = {e.key: e.label for e in FEATURES}
LIMIT_LABELS = {e.key: e.label for e in LIMITS}
