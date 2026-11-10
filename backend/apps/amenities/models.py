"""Amenity catalog (platform-wide) and the amenities assigned to each property."""

from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models

from core.models import OrgScopedModel, UUIDModel

# ---------- catalog: managed by the platform team, shared by every organization ----------


class AmenityCategory(UUIDModel):
    key = models.SlugField(max_length=40, unique=True)
    name = models.CharField(max_length=80)
    position = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ["position", "name"]
        verbose_name_plural = "amenity categories"

    def __str__(self) -> str:
        return self.name


class Amenity(UUIDModel):
    """One canonical amenity, with the details it supports (see apps.amenities.catalog)."""

    key = models.SlugField(max_length=40, unique=True)
    name = models.CharField(max_length=80)
    category = models.ForeignKey(
        AmenityCategory, on_delete=models.PROTECT, related_name="amenities"
    )
    position = models.PositiveSmallIntegerField(default=0)
    property_types = models.JSONField(
        default=list, blank=True, help_text="Property types it applies to; empty means all."
    )
    supports_sharing = models.BooleanField(default=False)
    supports_charge = models.BooleanField(default=False)
    supports_quantity = models.BooleanField(default=False)
    supports_rooms = models.BooleanField(default=False)
    attributes = models.JSONField(
        default=list, blank=True, help_text="Amenity-specific detail fields (see catalog.py)."
    )
    aliases = models.JSONField(default=list, blank=True, help_text="Extra search words.")
    is_filterable = models.BooleanField(
        default=False, help_text="Offered as a filter on the public marketplace."
    )
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["category__position", "position", "name"]
        verbose_name_plural = "amenities"

    def __str__(self) -> str:
        return self.name

    def applies_to(self, property_type: str) -> bool:
        return not self.property_types or property_type in self.property_types


# ---------- assignments: what one property offers ----------


class PropertyAmenity(OrgScopedModel):
    """An amenity a property has (or explicitly does not have).

    "Not specified" is the absence of a row. Generic details only apply when the
    catalog entry supports them; `details` holds the amenity-specific ones.
    """

    class Status(models.TextChoices):
        AVAILABLE = "available", "Available"
        UNAVAILABLE = "unavailable", "Not available"

    class Sharing(models.TextChoices):
        SHARED = "shared", "Shared"
        PRIVATE = "private", "Private"

    class Charge(models.TextChoices):
        INCLUDED = "included", "Included in rent"
        EXTRA = "extra", "Additional charge"

    class ChargePeriod(models.TextChoices):
        MONTH = "month", "per month"
        ONE_TIME = "one_time", "one time"
        PER_USE = "per_use", "per use"

    class Level(models.TextChoices):
        PROPERTY = "property", "Whole property"
        ROOM = "room", "Selected rooms"

    property = models.ForeignKey(
        "properties.Property", on_delete=models.CASCADE, related_name="amenity_assignments"
    )
    amenity = models.ForeignKey(Amenity, on_delete=models.PROTECT, related_name="assignments")
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.AVAILABLE)
    sharing = models.CharField(max_length=8, choices=Sharing.choices, blank=True)
    charge = models.CharField(max_length=8, choices=Charge.choices, blank=True)
    charge_amount = models.PositiveIntegerField(null=True, blank=True, help_text="Paise")
    charge_period = models.CharField(max_length=10, choices=ChargePeriod.choices, blank=True)
    quantity = models.PositiveSmallIntegerField(
        null=True, blank=True, validators=[MinValueValidator(1), MaxValueValidator(1000)]
    )
    level = models.CharField(max_length=10, choices=Level.choices, default=Level.PROPERTY)
    rooms = models.ManyToManyField(
        "properties.Room", blank=True, related_name="amenity_assignments"
    )
    details = models.JSONField(default=dict, blank=True)
    note = models.CharField(max_length=200, blank=True)

    class Meta:
        ordering = ["amenity__category__position", "amenity__position"]
        constraints = [
            models.UniqueConstraint(fields=["property", "amenity"], name="uniq_property_amenity"),
            models.CheckConstraint(
                condition=models.Q(charge="extra") | models.Q(charge_amount__isnull=True),
                name="amenity_amount_only_when_extra",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.amenity} at {self.property}"
