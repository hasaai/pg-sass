import builtins
from typing import Any

from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.db.models import Q

from apps.amenities.catalog import PG, PROPERTY_TYPES
from core.models import OrgScopedModel
from core.uploads import property_document_path, property_logo_path, property_photo_path


def ordinal_floor(number: int) -> str:
    """0 → "Ground floor", 1 → "1st floor", -1 → "Basement 1"."""
    if number == 0:
        return "Ground floor"
    if number < 0:
        return f"Basement {-number}"
    suffix = (
        "th" if 10 <= number % 100 <= 20 else {1: "st", 2: "nd", 3: "rd"}.get(number % 10, "th")
    )
    return f"{number}{suffix} floor"


class Letting(models.TextChoices):
    """How a flat or room is rented: as one thing, or by its parts."""

    WHOLE = "whole", "Whole"
    BY_PARTS = "by_parts", "By parts"


REFERENCE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # no 0/O or 1/I mix-ups


def new_property_reference() -> str:
    """A fresh "PG-XXXXXX" not used by any property (about 1 billion possibilities)."""
    import secrets

    while True:
        code = "PG-" + "".join(secrets.choice(REFERENCE_ALPHABET) for _ in range(6))
        if not Property.objects.filter(reference=code).exists():
            return code


class Property(OrgScopedModel):
    """A PG, co-living space, hostel, apartment, house or building run by one organization."""

    class Status(models.TextChoices):
        DRAFT = "draft", "Not finished"
        ACTIVE = "active", "Open"
        INACTIVE = "inactive", "Closed"
        ARCHIVED = "archived", "Removed"

    class Verification(models.TextChoices):
        UNVERIFIED = "unverified", "Not checked yet"
        SUBMITTED = "submitted", "Being checked"
        VERIFIED = "verified", "Verified"
        CHANGES_REQUESTED = "changes_requested", "Changes needed"
        REJECTED = "rejected", "Not approved"

    class Gender(models.TextChoices):
        MEN = "men", "Men"
        WOMEN = "women", "Women"
        COED = "coed", "Co-living (any)"

    name = models.CharField(max_length=150)
    # Short reference people can read out on the phone ("PG-7K3M9Q"); unique everywhere.
    reference = models.CharField(max_length=12, unique=True, editable=False)
    # The number tenants and the PG Manager team call about this property (optional).
    contact_phone = models.CharField(max_length=15, blank=True)
    status = models.CharField(
        max_length=10, choices=Status.choices, default=Status.ACTIVE, db_index=True
    )
    verification_status = models.CharField(
        max_length=20, choices=Verification.choices, default=Verification.UNVERIFIED
    )
    building_name = models.CharField(max_length=150, blank=True)
    description = models.TextField(blank=True)
    property_type = models.CharField(max_length=12, choices=PROPERTY_TYPES, default=PG)
    address_line = models.CharField(max_length=255)
    locality = models.CharField(max_length=100, db_index=True)
    landmark = models.CharField(max_length=150, blank=True)
    city = models.CharField(max_length=60, default="Bengaluru")
    state = models.CharField(max_length=60, default="Karnataka")
    pincode = models.CharField(max_length=6, blank=True)
    total_floors = models.PositiveSmallIntegerField(
        null=True, blank=True, validators=[MinValueValidator(1), MaxValueValidator(200)]
    )
    built_up_area_sqft = models.PositiveIntegerField(null=True, blank=True)
    year_built = models.PositiveSmallIntegerField(
        null=True, blank=True, validators=[MinValueValidator(1800), MaxValueValidator(2100)]
    )
    gender = models.CharField(max_length=10, choices=Gender.choices, default=Gender.COED)
    # Keys of the amenities marked available, kept in sync by apps.amenities.services.
    # Denormalised so marketplace search can filter without joins; never edit directly.
    amenities = models.JSONField(default=list, blank=True)
    latitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    longitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    rent_due_day = models.PositiveSmallIntegerField(
        default=5, validators=[MinValueValidator(1), MaxValueValidator(28)]
    )
    logo = models.ImageField(upload_to=property_logo_path, blank=True)
    # Kept in step with `status` (True only when open) for code that predates statuses.
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["name"]
        verbose_name_plural = "properties"

    def __str__(self) -> str:
        return self.name

    def save(self, *args: Any, **kwargs: Any) -> None:
        if not self.reference:
            self.reference = new_property_reference()
        self.is_active = self.status == self.Status.ACTIVE
        update_fields = kwargs.get("update_fields")
        if update_fields is not None and "status" in update_fields:
            kwargs["update_fields"] = {*update_fields, "is_active"}
        super().save(*args, **kwargs)


class Archivable(models.Model):
    """Inventory with history is archived (hidden), never deleted."""

    archived_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        abstract = True

    @property
    def is_archived(self) -> bool:
        return self.archived_at is not None


class Floor(OrgScopedModel, Archivable):
    property = models.ForeignKey(Property, on_delete=models.CASCADE, related_name="floors")
    number = models.SmallIntegerField(validators=[MinValueValidator(-5), MaxValueValidator(200)])
    name = models.CharField(
        max_length=40, blank=True, help_text='e.g. "Terrace"; blank = "1st floor"'
    )

    class Meta:
        ordering = ["property__name", "number"]
        constraints = [
            models.UniqueConstraint(fields=["property", "number"], name="uniq_floor_number"),
        ]

    def __str__(self) -> str:
        return f"{self.property.name} / {self.display_name}"

    @builtins.property
    def display_name(self) -> str:
        return self.name or ordinal_floor(self.number)


class RentalUnit(OrgScopedModel, Archivable):
    """A flat in a building or a portion of a house. Rented whole or room by room."""

    class UnitType(models.TextChoices):
        RK1 = "1rk", "1 RK"
        BHK1 = "1bhk", "1 BHK"
        BHK2 = "2bhk", "2 BHK"
        BHK3 = "3bhk", "3 BHK"
        BHK4 = "4bhk", "4 BHK or more"
        STUDIO = "studio", "Studio"
        PORTION = "portion", "Portion of a house"
        WHOLE_HOUSE = "whole_house", "Whole house"
        OTHER = "other", "Other"

    class Furnishing(models.TextChoices):
        UNFURNISHED = "unfurnished", "Unfurnished"
        SEMI = "semi", "Semi-furnished"
        FULLY = "fully", "Fully furnished"

    class Status(models.TextChoices):
        AVAILABLE = "available", "Available"
        BLOCKED = "blocked", "Not available"

    property = models.ForeignKey(Property, on_delete=models.PROTECT, related_name="units")
    floor = models.ForeignKey(
        Floor, on_delete=models.PROTECT, related_name="units", null=True, blank=True
    )
    code = models.CharField(max_length=30, help_text='e.g. "Flat 302"')
    unit_type = models.CharField(max_length=12, choices=UnitType.choices, default=UnitType.BHK2)
    bedrooms = models.PositiveSmallIntegerField(null=True, blank=True)
    bathrooms = models.PositiveSmallIntegerField(null=True, blank=True)
    area_sqft = models.PositiveIntegerField(null=True, blank=True)
    furnishing = models.CharField(max_length=12, choices=Furnishing.choices, blank=True)
    letting = models.CharField(max_length=10, choices=Letting.choices, default=Letting.WHOLE)
    monthly_rent = models.PositiveIntegerField(null=True, blank=True, help_text="Paise")
    deposit = models.PositiveIntegerField(null=True, blank=True, help_text="Paise")
    max_occupants = models.PositiveSmallIntegerField(null=True, blank=True)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.AVAILABLE)

    class Meta:
        ordering = ["property__name", "code"]
        constraints = [
            models.UniqueConstraint(fields=["property", "code"], name="uniq_unit_code"),
        ]

    def __str__(self) -> str:
        return f"{self.property.name} / {self.code}"


class Room(OrgScopedModel, Archivable):
    class RoomType(models.TextChoices):
        PRIVATE = "private", "Private room"
        SHARED = "shared", "Shared room"
        DORMITORY = "dormitory", "Dormitory"

    property = models.ForeignKey(Property, on_delete=models.PROTECT, related_name="rooms")
    unit = models.ForeignKey(
        RentalUnit, on_delete=models.PROTECT, related_name="rooms", null=True, blank=True
    )
    floor = models.ForeignKey(
        Floor, on_delete=models.PROTECT, related_name="rooms", null=True, blank=True
    )
    # Free-text floor from before floors existed; kept for one release, then removed.
    floor_label = models.CharField(max_length=20, blank=True)
    number = models.CharField(max_length=20)
    room_type = models.CharField(max_length=10, choices=RoomType.choices, default=RoomType.SHARED)
    # by_parts = bed by bed (the PG default); whole = the room is rented to one tenant.
    letting = models.CharField(max_length=10, choices=Letting.choices, default=Letting.BY_PARTS)
    monthly_rent = models.PositiveIntegerField(
        null=True, blank=True, help_text="Paise; only when the room is rented whole"
    )
    sharing = models.PositiveSmallIntegerField(
        validators=[MinValueValidator(1), MaxValueValidator(12)]
    )
    is_ac = models.BooleanField(default=False)
    has_attached_bath = models.BooleanField(default=False)

    class Meta:
        ordering = ["property__name", "number"]
        constraints = [
            models.UniqueConstraint(
                fields=["property", "number"],
                condition=Q(unit__isnull=True),
                name="uniq_room_number",
            ),
            models.UniqueConstraint(
                fields=["unit", "number"],
                condition=Q(unit__isnull=False),
                name="uniq_room_number_in_unit",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.property.name} / {self.number}"


class Bed(OrgScopedModel, Archivable):
    class Status(models.TextChoices):
        VACANT = "vacant", "Vacant"
        RESERVED = "reserved", "Reserved"
        OCCUPIED = "occupied", "Occupied"
        BLOCKED = "blocked", "Blocked"

    room = models.ForeignKey(Room, on_delete=models.PROTECT, related_name="beds")
    label = models.CharField(max_length=10)
    monthly_rent = models.PositiveIntegerField(help_text="Paise")
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.VACANT)

    class Meta:
        ordering = ["room__number", "label"]
        constraints = [
            models.UniqueConstraint(fields=["room", "label"], name="uniq_bed_label"),
        ]

    def __str__(self) -> str:
        return f"{self.room} / {self.label}"


class RoomFeature(OrgScopedModel):
    """Something a room has (balcony, geyser, TV ...), included in the rent or charged extra.

    The feature itself comes from the amenity catalog (only amenities that can belong to a
    room). An extra charge is per tenant per month and is added to each rent bill.
    """

    class Charge(models.TextChoices):
        INCLUDED = "included", "Included in rent"
        EXTRA = "extra", "Extra charge"

    room = models.ForeignKey(Room, on_delete=models.CASCADE, related_name="features")
    amenity = models.ForeignKey("amenities.Amenity", on_delete=models.PROTECT, related_name="+")
    charge = models.CharField(max_length=8, choices=Charge.choices, default=Charge.INCLUDED)
    charge_amount = models.PositiveIntegerField(
        null=True, blank=True, help_text="Paise per tenant per month (extra charge only)"
    )

    class Meta:
        ordering = ["amenity__category__position", "amenity__position", "amenity__name"]
        constraints = [
            models.UniqueConstraint(fields=["room", "amenity"], name="uniq_room_feature"),
            models.CheckConstraint(
                condition=(
                    Q(charge="extra", charge_amount__gt=0)
                    | Q(charge="included", charge_amount__isnull=True)
                ),
                name="room_feature_charge_amount",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.room} / {self.amenity_id}"


class PropertyPhoto(OrgScopedModel):
    """Photos of the building, rooms and common areas. Also shown on the public listing."""

    property = models.ForeignKey(Property, on_delete=models.CASCADE, related_name="photos")
    image = models.ImageField(
        upload_to=property_photo_path, width_field="width", height_field="height"
    )
    width = models.PositiveIntegerField(default=0)
    height = models.PositiveIntegerField(default=0)
    caption = models.CharField(max_length=120, blank=True)
    position = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ["position", "created_at"]

    def __str__(self) -> str:
        return f"Photo of {self.property}"


class PropertyDocument(OrgScopedModel):
    """A private file about the property (ownership proof, licences, bills).

    Stored under media/private/ and only streamed by an authenticated endpoint to the
    business's owners and managers (and platform staff during verification).
    """

    class Kind(models.TextChoices):
        OWNERSHIP_PROOF = "ownership_proof", "Ownership proof (sale deed, khata)"
        RENTAL_AGREEMENT = "rental_agreement", "Rental or lease agreement with the owner"
        MANAGEMENT_AUTHORIZATION = "management_authorization", "Letter allowing you to manage it"
        PROPERTY_TAX = "property_tax", "Property tax receipt"
        TRADE_LICENSE = "trade_license", "Trade licence"
        FIRE_NOC = "fire_noc", "Fire safety NOC"
        BUILDING_APPROVAL = "building_approval", "Building plan / occupancy certificate"
        ELECTRICITY_BILL = "electricity_bill", "Electricity bill"
        WATER_BILL = "water_bill", "Water bill"
        INSURANCE = "insurance", "Insurance"
        OTHER = "other", "Other"

    property = models.ForeignKey(Property, on_delete=models.CASCADE, related_name="documents")
    kind = models.CharField(max_length=30, choices=Kind.choices)
    title = models.CharField(max_length=150, blank=True)
    file = models.FileField(upload_to=property_document_path)
    file_name = models.CharField(max_length=255, help_text="Name of the file as uploaded")
    size_bytes = models.PositiveIntegerField(default=0)
    content_type = models.CharField(max_length=60)
    issued_on = models.DateField(null=True, blank=True)
    expires_on = models.DateField(null=True, blank=True)
    note = models.CharField(max_length=500, blank=True)

    class Meta:
        ordering = ["kind", "-created_at"]
        constraints = [
            models.CheckConstraint(
                condition=Q(expires_on__isnull=True)
                | Q(issued_on__isnull=True)
                | Q(expires_on__gte=models.F("issued_on")),
                name="document_expires_after_issue",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.get_kind_display()} for {self.property}"


# Documents that prove the business may run the property; verification looks at these.
PROOF_KINDS = frozenset(
    {
        PropertyDocument.Kind.OWNERSHIP_PROOF,
        PropertyDocument.Kind.RENTAL_AGREEMENT,
        PropertyDocument.Kind.MANAGEMENT_AUTHORIZATION,
    }
)


class VerificationEvent(OrgScopedModel):
    """Append-only history of a property's verification (who decided what, and why)."""

    property = models.ForeignKey(
        Property, on_delete=models.CASCADE, related_name="verification_events"
    )
    status = models.CharField(max_length=20, choices=Property.Verification.choices)
    note = models.CharField(max_length=1000, blank=True)
    by_platform = models.BooleanField(default=False)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"{self.property} → {self.status}"
