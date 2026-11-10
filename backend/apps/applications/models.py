"""Room seekers: wishlists and online applications to a listed PG."""

from django.conf import settings
from django.db import models
from django.db.models import Q

from core.models import OrgScopedModel, UUIDModel


class WishlistItem(UUIDModel):
    """A seeker's saved listing. Belongs to the seeker, not to an operator."""

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="wishlist"
    )
    listing = models.ForeignKey(
        "listings.Listing", on_delete=models.CASCADE, related_name="wishlisted_by"
    )

    class Meta:
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(fields=["user", "listing"], name="uniq_wishlist_item"),
        ]


class Application(OrgScopedModel):
    """A seeker applies to live in a listed PG; the operator approves into a bed or declines.

    The organization is the listing's operator, so only they (and the applicant) see it.
    """

    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        APPROVED = "approved", "Approved"
        DECLINED = "declined", "Declined"
        WITHDRAWN = "withdrawn", "Withdrawn"

    listing = models.ForeignKey(
        "listings.Listing", on_delete=models.CASCADE, related_name="applications"
    )
    applicant = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="applications"
    )
    full_name = models.CharField(max_length=150)
    phone = models.CharField(max_length=15)
    email = models.EmailField(blank=True)
    gender = models.CharField(max_length=10, blank=True)
    occupation = models.CharField(max_length=100, blank=True)
    id_type = models.CharField(max_length=20, blank=True)
    id_last4 = models.CharField(max_length=4, blank=True)
    preferred_sharing = models.PositiveSmallIntegerField(null=True, blank=True)
    move_in_date = models.DateField()
    message = models.TextField(blank=True)
    consent_given_at = models.DateTimeField()
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.PENDING)
    decline_reason = models.CharField(max_length=255, blank=True)
    decided_at = models.DateTimeField(null=True, blank=True)
    decided_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="+",
    )
    stay = models.OneToOneField(
        "tenants.Stay",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="application",
    )

    class Meta:
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["listing", "applicant"],
                condition=Q(status="pending"),
                name="one_pending_application_per_listing",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.full_name} → {self.listing}"
