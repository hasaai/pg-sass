from django.conf import settings
from django.db import models

from core.models import OrgScopedModel, UUIDModel
from core.uploads import listing_photo_path


class Listing(OrgScopedModel):
    """The public marketplace page for one property."""

    property = models.OneToOneField(
        "properties.Property", on_delete=models.CASCADE, related_name="listing"
    )
    slug = models.SlugField(max_length=120, unique=True)
    headline = models.CharField(max_length=150)
    description = models.TextField(blank=True)
    contact_phone = models.CharField(max_length=15, blank=True)
    food_included = models.BooleanField(default=False)
    house_rules = models.TextField(blank=True)
    is_published = models.BooleanField(default=False)
    published_at = models.DateTimeField(null=True, blank=True)
    # Set only by the platform team (Django admin) after checking photos and owner details.
    is_verified = models.BooleanField(default=False)
    verified_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-published_at", "headline"]

    def __str__(self) -> str:
        return self.headline


class Enquiry(OrgScopedModel):
    class Status(models.TextChoices):
        NEW = "new", "New"
        CONTACTED = "contacted", "Contacted"
        VISIT_SCHEDULED = "visit_scheduled", "Visit scheduled"
        CONVERTED = "converted", "Converted"
        LOST = "lost", "Lost"

    listing = models.ForeignKey(Listing, on_delete=models.CASCADE, related_name="enquiries")
    name = models.CharField(max_length=150)
    phone = models.CharField(max_length=15)
    email = models.EmailField(blank=True)
    preferred_sharing = models.PositiveSmallIntegerField(null=True, blank=True)
    move_in_date = models.DateField(null=True, blank=True)
    message = models.TextField(blank=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.NEW)
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ["-created_at"]
        verbose_name_plural = "enquiries"

    def __str__(self) -> str:
        return f"{self.name} for {self.listing}"


class ListingPhoto(OrgScopedModel):
    listing = models.ForeignKey(Listing, on_delete=models.CASCADE, related_name="photos")
    image = models.ImageField(
        upload_to=listing_photo_path, width_field="width", height_field="height"
    )
    width = models.PositiveIntegerField(default=0)
    height = models.PositiveIntegerField(default=0)
    caption = models.CharField(max_length=120, blank=True)
    position = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ["position", "created_at"]


# ---------- platform-level records (not owned by one operator) ----------


class ListingReport(UUIDModel):
    """A visitor says a listing does not match reality. Reviewed by the platform team."""

    class Reason(models.TextChoices):
        PHOTOS_MISMATCH = "photos_mismatch", "Photos don't match the place"
        WRONG_PRICE = "wrong_price", "Rent or charges are different"
        NOT_AVAILABLE = "not_available", "Says available but is full"
        FRAUD = "fraud", "Asked for money before a visit / suspicious"
        OTHER = "other", "Something else"

    class Status(models.TextChoices):
        OPEN = "open", "Open"
        REVIEWED = "reviewed", "Reviewed, action taken"
        DISMISSED = "dismissed", "Dismissed"

    listing = models.ForeignKey(Listing, on_delete=models.CASCADE, related_name="reports")
    reporter = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )
    reason = models.CharField(max_length=20, choices=Reason.choices)
    details = models.TextField(blank=True)
    contact = models.CharField(max_length=150, blank=True)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.OPEN)

    class Meta:
        ordering = ["-created_at"]


class PgRequest(UUIDModel):
    """ "I can't find my PG here": the platform team contacts the owner."""

    class Status(models.TextChoices):
        NEW = "new", "New"
        CONTACTED = "contacted", "Owner contacted"
        LISTED = "listed", "Now listed"
        CLOSED = "closed", "Closed"

    pg_name = models.CharField(max_length=150)
    locality = models.CharField(max_length=100)
    owner_phone = models.CharField(max_length=15, blank=True)
    contact_name = models.CharField(max_length=150)
    contact_phone = models.CharField(max_length=15)
    notes = models.TextField(blank=True)
    requested_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.NEW)

    class Meta:
        ordering = ["-created_at"]
