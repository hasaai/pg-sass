"""Application lifecycle: apply → (withdraw) → approve into a bed, or decline with a reason."""

from __future__ import annotations

import datetime as dt
from typing import TYPE_CHECKING, Any

from django.db import transaction
from django.utils import timezone
from rest_framework import status
from rest_framework.exceptions import APIException

from apps.applications.models import Application
from apps.properties.models import Bed
from apps.tenants import services as stays
from apps.tenants.models import Tenant
from core import audit, notify

if TYPE_CHECKING:
    from apps.accounts.models import User
    from apps.listings.models import Listing


class ApplicationRuleViolation(APIException):
    status_code = status.HTTP_409_CONFLICT
    default_detail = "This change is not allowed."
    default_code = "application_rule_violation"

    def __init__(self, detail: str, code: str) -> None:
        super().__init__(detail=detail, code=code)


def apply(*, applicant: User, listing: Listing, data: dict[str, Any]) -> Application:
    if Application.objects.filter(
        listing=listing, applicant=applicant, status=Application.Status.PENDING
    ).exists():
        raise ApplicationRuleViolation(
            "You already have a pending application for this PG.", code="already_applied"
        )
    application = Application.objects.create(
        organization=listing.organization,
        listing=listing,
        applicant=applicant,
        consent_given_at=timezone.now(),
        **data,
    )
    _notify_managers(application)
    return application


def _notify_managers(application: Application) -> None:
    from apps.organizations.models import Membership
    from core.access import has_permission

    # Everyone who handles applications (listings.manage) hears about a new one.
    members = Membership.objects.filter(
        organization=application.organization, is_active=True
    ).select_related("user")
    recipients = [m.user.email for m in members if has_permission(m, "listings.manage")]
    for address in recipients:
        notify.email(
            address or "",
            f"New application: {application.full_name}",
            f"{application.full_name} ({application.phone}) applied for "
            f"{application.listing.headline}, moving in {application.move_in_date:%d %b %Y}.\n"
            "Open Applications in PG Manager to approve them into a bed or decline.",
        )


def _ensure_pending(application: Application) -> None:
    if application.status != Application.Status.PENDING:
        raise ApplicationRuleViolation(
            f"This application is already {application.get_status_display().lower()}.",
            code="not_pending",
        )


@transaction.atomic
def withdraw(*, application: Application) -> Application:
    application = Application.objects.select_for_update().get(pk=application.pk)
    _ensure_pending(application)
    application.status = Application.Status.WITHDRAWN
    application.save(update_fields=["status", "updated_at"])
    return application


@transaction.atomic
def approve(
    *,
    actor: User,
    application: Application,
    bed: Bed,
    check_in_date: dt.date,
    monthly_rent: int | None,
    deposit_amount: int,
    deposit_collected: int,
) -> Application:
    application = (
        Application.objects.select_for_update().select_related("listing").get(pk=application.pk)
    )
    _ensure_pending(application)
    if bed.room.property_id != application.listing.property_id:
        raise ApplicationRuleViolation(
            "Choose a bed in the property this person applied to.", code="wrong_property"
        )
    tenant, created = Tenant.objects.get_or_create(
        organization=application.organization,
        phone=application.phone,
        defaults={
            "created_by": actor,
            "full_name": application.full_name,
            "email": application.email,
            "gender": application.gender,
            "occupation": application.occupation,
            "id_type": application.id_type,
            "id_last4": application.id_last4,
            "consent_given_at": application.consent_given_at,
        },
    )
    stay = stays.check_in(
        actor=actor,
        tenant=tenant,
        place=bed,
        check_in_date=check_in_date,
        monthly_rent=monthly_rent,
        deposit_amount=deposit_amount,
        deposit_collected=deposit_collected,
    )
    application.status = Application.Status.APPROVED
    application.stay = stay
    application.decided_at = timezone.now()
    application.decided_by = actor
    application.save(update_fields=["status", "stay", "decided_at", "decided_by", "updated_at"])
    audit.record(
        organization=application.organization,
        actor=actor,
        action="application.approve",
        obj=application,
        stay=stay.pk,
        new_tenant=created,
    )
    notify.email(
        application.email or application.applicant.email or "",
        f"You're in! {application.listing.headline}",
        f"Hi {application.full_name},\n\nYour application was approved. "
        f"Your bed: Room {bed.room.number}, Bed {bed.label}, from {check_in_date:%d %b %Y}.\n"
        f"The {application.organization.name} team",
    )
    return application


@transaction.atomic
def decline(*, actor: User, application: Application, reason: str) -> Application:
    application = (
        Application.objects.select_for_update().select_related("listing").get(pk=application.pk)
    )
    _ensure_pending(application)
    application.status = Application.Status.DECLINED
    application.decline_reason = reason
    application.decided_at = timezone.now()
    application.decided_by = actor
    application.save(
        update_fields=["status", "decline_reason", "decided_at", "decided_by", "updated_at"]
    )
    audit.record(
        organization=application.organization,
        actor=actor,
        action="application.decline",
        obj=application,
        reason=reason,
    )
    notify.email(
        application.email or application.applicant.email or "",
        f"Update on your application: {application.listing.headline}",
        f"Hi {application.full_name},\n\nSorry, the PG could not take your application.\n"
        f"Reason: {reason}\n",
    )
    return application
