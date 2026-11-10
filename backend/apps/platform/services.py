"""Platform-team actions on businesses. Every change is written to that business's audit log."""

from __future__ import annotations

from typing import TYPE_CHECKING

from django.db import transaction
from rest_framework.exceptions import ValidationError

from apps.organizations.models import Organization
from core import audit
from core.features import FEATURE_KEYS

if TYPE_CHECKING:
    from apps.accounts.models import User


@transaction.atomic
def set_disabled_features(*, org: Organization, disabled: list[str], actor: User) -> Organization:
    unknown = sorted(set(disabled) - FEATURE_KEYS)
    if unknown:
        raise ValidationError({"disabled_features": f"Unknown features: {', '.join(unknown)}."})
    before = sorted(org.disabled_features or [])
    org.disabled_features = sorted(set(disabled))
    org.save(update_fields=["disabled_features", "updated_at"])
    if "marketplace" in org.disabled_features:
        from apps.listings.models import Listing

        Listing.objects.filter(organization=org, is_published=True).update(is_published=False)
    audit.record(
        organization=org,
        actor=actor,
        action="platform.features_changed",
        obj=org,
        before=",".join(before),
        after=",".join(org.disabled_features),
    )
    return org


@transaction.atomic
def suspend(*, org: Organization, reason: str, actor: User) -> Organization:
    if not reason.strip():
        raise ValidationError({"reason": "Say why the business is suspended (the owner sees it)."})
    org.status = Organization.Status.SUSPENDED
    org.suspended_reason = reason.strip()[:255]
    org.save(update_fields=["status", "suspended_reason", "updated_at"])
    audit.record(organization=org, actor=actor, action="platform.suspended", obj=org, reason=reason)
    return org


@transaction.atomic
def reactivate(*, org: Organization, actor: User) -> Organization:
    org.status = Organization.Status.ACTIVE
    org.suspended_reason = ""
    org.save(update_fields=["status", "suspended_reason", "updated_at"])
    audit.record(organization=org, actor=actor, action="platform.reactivated", obj=org)
    return org
