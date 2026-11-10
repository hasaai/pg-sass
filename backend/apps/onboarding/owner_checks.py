"""Owner identity check: the owner fills it in and sends it; the platform team decides.

It never blocks the app. Only public publishing may depend on it (onboarding step 9).
"""

from __future__ import annotations

import re
from typing import Any

from django.db import transaction
from django.utils import timezone
from rest_framework import status
from rest_framework.exceptions import APIException, ValidationError

from apps.accounts.models import User
from apps.onboarding.models import OwnerDocument, OwnerVerification, OwnerVerificationEvent
from apps.organizations.models import Membership
from core import audit
from core.uploads import DOCUMENT_TYPES, validate_upload

S = OwnerVerification.Status
EDITABLE = {S.NOT_STARTED, S.DRAFT, S.MORE_INFO}
SENDABLE = EDITABLE
MAX_DOCUMENTS = 6


class OwnerCheckRule(APIException):
    status_code = status.HTTP_409_CONFLICT
    default_code = "owner_check_rule"

    def __init__(self, detail: str, code: str = "owner_check_rule") -> None:
        super().__init__(detail=detail, code=code)


def for_membership(membership: Membership) -> OwnerVerification:
    check, _ = OwnerVerification.objects.get_or_create(
        organization=membership.organization,
        user=membership.user,
        defaults={"created_by": membership.user},
    )
    return check


def _locked(check: OwnerVerification) -> None:
    if check.status not in EDITABLE:
        words: dict[str, str] = {
            S.SUBMITTED: "It has been sent for checking.",
            S.UNDER_REVIEW: "It is being checked.",
            S.APPROVED: "It is already verified.",
            S.REJECTED: "It was not approved. Contact PG Manager support.",
        }
        raise OwnerCheckRule(
            f"{words.get(str(check.status), '')} You cannot change it now.".strip(),
            "owner_check_locked",
        )


def _started(check: OwnerVerification) -> None:
    if check.status == S.NOT_STARTED:
        check.status = S.DRAFT


def missing(check: OwnerVerification) -> list[str]:
    """What is still needed before it can be sent, in plain words."""
    needs = []
    if not check.id_type:
        needs.append("Choose the type of ID.")
    if not check.id_last4:
        needs.append("Enter the last 4 characters of the ID number.")
    if not check.name_on_id:
        needs.append("Enter your name as printed on the ID.")
    if not check.documents.filter(kind=OwnerDocument.Kind.ID_FRONT).exists():
        needs.append("Upload a photo or scan of the front of the ID.")
    return needs


@transaction.atomic
def update_details(
    check: OwnerVerification,
    actor: User,
    *,
    id_type: str | None = None,
    id_last4: str | None = None,
    name_on_id: str | None = None,
) -> OwnerVerification:
    _locked(check)
    if id_type is not None:
        check.id_type = id_type
    if id_last4 is not None:
        cleaned = re.sub(r"[\s-]", "", id_last4).upper()
        if cleaned and not re.fullmatch(r"[A-Z0-9]{4}", cleaned):
            raise ValidationError({"id_last4": "Enter exactly the last 4 letters or digits."})
        check.id_last4 = cleaned
    if name_on_id is not None:
        check.name_on_id = name_on_id.strip()[:150]
    _started(check)
    check.save()
    return check


@transaction.atomic
def add_document(check: OwnerVerification, actor: User, *, upload: Any, kind: str) -> OwnerDocument:
    _locked(check)
    if check.documents.count() >= MAX_DOCUMENTS:
        raise OwnerCheckRule(f"At most {MAX_DOCUMENTS} files. Remove one first.", "too_many_files")
    content_type = validate_upload(upload, DOCUMENT_TYPES)
    doc = OwnerDocument(
        organization=check.organization,
        created_by=actor,
        verification=check,
        kind=kind,
        file_name=(getattr(upload, "name", "") or "document")[:255],
        size_bytes=getattr(upload, "size", 0) or 0,
        content_type=content_type,
    )
    doc.file = upload
    doc.save()
    _started(check)
    check.save(update_fields=["status", "updated_at"])
    audit.record(
        organization=check.organization,
        actor=actor,
        action="owner_check.document_added",
        obj=check,
        kind=kind,
    )
    return doc


@transaction.atomic
def remove_document(doc: OwnerDocument, actor: User) -> None:
    check = doc.verification
    _locked(check)
    audit.record(
        organization=check.organization,
        actor=actor,
        action="owner_check.document_removed",
        obj=check,
        kind=doc.kind,
    )
    doc.file.delete(save=False)
    doc.delete()


def _event(check: OwnerVerification, actor: User | None, note: str, by_platform: bool) -> None:
    OwnerVerificationEvent.objects.create(
        organization=check.organization,
        created_by=actor,
        verification=check,
        status=check.status,
        note=note,
        by_platform=by_platform,
    )
    audit.record(
        organization=check.organization,
        actor=actor,
        action=f"owner_check.{check.status}",
        obj=check,
        note=note,
    )


@transaction.atomic
def submit(check: OwnerVerification, actor: User) -> OwnerVerification:
    check = OwnerVerification.objects.select_for_update().get(pk=check.pk)
    if check.status not in SENDABLE:
        _locked(check)
    needs = missing(check)
    if needs:
        raise OwnerCheckRule(" ".join(needs), "owner_check_incomplete")
    check.status = S.SUBMITTED
    check.submitted_at = timezone.now()
    check.reviewer_note = ""
    check.save()
    _event(check, actor, "", by_platform=False)
    return check


def log_download(doc: OwnerDocument, actor: User, *, by_platform: bool) -> None:
    audit.record(
        organization=doc.organization,
        actor=actor,
        action="owner_check.document_downloaded",
        obj=doc.verification,
        kind=doc.kind,
        by_platform=by_platform,
    )
