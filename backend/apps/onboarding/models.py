"""Records made while a PG owner signs up: what they agreed to, and when."""

from __future__ import annotations

from django.conf import settings
from django.db import models

from core.models import OrgScopedModel, UUIDModel
from core.uploads import owner_document_path


class ConsentRecord(UUIDModel):
    """One answer to Terms, Privacy or marketing messages. Append-only: a change of mind
    adds a new row, so the history of what was agreed (and which version) is kept."""

    class Kind(models.TextChoices):
        TERMS = "terms", "Terms and Conditions"
        PRIVACY = "privacy", "Privacy Policy"
        MARKETING = "marketing", "Offers and product news"

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="consents"
    )
    kind = models.CharField(max_length=20, choices=Kind.choices)
    version = models.CharField(max_length=40, blank=True)
    accepted = models.BooleanField()
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.CharField(max_length=255, blank=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["user", "kind", "created_at"])]

    def __str__(self) -> str:
        return f"{self.user_id} {self.kind} {'yes' if self.accepted else 'no'}"


class OwnerVerification(OrgScopedModel):
    """A business owner's identity check. One per owner per business; it never blocks the
    app. Only the platform team (p.verification.review) decides; the owner cannot."""

    class Status(models.TextChoices):
        NOT_STARTED = "not_started", "Not started"
        DRAFT = "draft", "Not sent yet"
        SUBMITTED = "submitted", "Sent for checking"
        UNDER_REVIEW = "under_review", "Being checked"
        MORE_INFO = "more_info", "More information needed"
        APPROVED = "approved", "Verified"
        REJECTED = "rejected", "Not approved"

    class IdType(models.TextChoices):
        PAN = "pan", "PAN card"
        AADHAAR = "aadhaar", "Aadhaar (first 8 digits covered)"
        PASSPORT = "passport", "Passport"
        DRIVING_LICENCE = "driving_licence", "Driving licence"
        VOTER_ID = "voter_id", "Voter ID"

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="owner_verifications"
    )
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.NOT_STARTED)
    id_type = models.CharField(max_length=20, choices=IdType.choices, blank=True)
    # Only the last 4 characters of the ID number are kept, never the whole number.
    id_last4 = models.CharField(max_length=4, blank=True)
    name_on_id = models.CharField(max_length=150, blank=True)
    submitted_at = models.DateTimeField(null=True, blank=True)
    decided_at = models.DateTimeField(null=True, blank=True)
    reviewer_note = models.CharField(max_length=1000, blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["organization", "user"], name="uniq_owner_check")
        ]

    def __str__(self) -> str:
        return f"{self.user_id} {self.status}"


class OwnerDocument(OrgScopedModel):
    """A private file for the owner check (ID card, business registration ...)."""

    class Kind(models.TextChoices):
        ID_FRONT = "id_front", "ID card (front)"
        ID_BACK = "id_back", "ID card (back)"
        BUSINESS_REGISTRATION = "business_registration", "Business registration (GST, Udyam ...)"
        OTHER = "other", "Other"

    verification = models.ForeignKey(
        OwnerVerification, on_delete=models.CASCADE, related_name="documents"
    )
    kind = models.CharField(max_length=30, choices=Kind.choices)
    file = models.FileField(upload_to=owner_document_path)
    file_name = models.CharField(max_length=255)
    size_bytes = models.PositiveIntegerField(default=0)
    content_type = models.CharField(max_length=60)

    class Meta:
        ordering = ["kind", "-created_at"]


class OwnerVerificationEvent(OrgScopedModel):
    """Append-only history: who sent, who decided what, and why."""

    verification = models.ForeignKey(
        OwnerVerification, on_delete=models.CASCADE, related_name="events"
    )
    status = models.CharField(max_length=20, choices=OwnerVerification.Status.choices)
    note = models.CharField(max_length=1000, blank=True)
    by_platform = models.BooleanField(default=False)

    class Meta:
        ordering = ["-created_at"]
