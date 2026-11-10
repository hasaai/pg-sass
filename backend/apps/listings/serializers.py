from __future__ import annotations

from typing import Any

from django.utils import timezone
from django.utils.text import slugify
from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from apps.amenities.models import PropertyAmenity
from apps.amenities.serializers import PublicAmenitySerializer
from apps.listings.availability import sharing_options
from apps.listings.models import Enquiry, Listing, ListingPhoto, ListingReport, PgRequest
from apps.properties.models import Property
from core.fields import OrgScopedRelatedField
from core.uploads import IMAGE_TYPES, validate_upload
from core.validators import normalize_indian_mobile


class SharingOptionSerializer(serializers.Serializer):
    sharing = serializers.IntegerField()
    min_rent = serializers.IntegerField(allow_null=True)
    max_rent = serializers.IntegerField(allow_null=True)
    vacant_beds = serializers.IntegerField()
    is_ac = serializers.BooleanField()


class ListingPhotoSerializer(serializers.ModelSerializer):
    image = serializers.ImageField(write_only=True)
    url = serializers.SerializerMethodField()

    class Meta:
        model = ListingPhoto
        fields = ["id", "image", "url", "caption", "position", "width", "height", "created_at"]
        read_only_fields = ["id", "url", "width", "height", "created_at"]

    def get_url(self, obj: ListingPhoto) -> str:
        return obj.image.url

    def validate_image(self, value: Any) -> Any:
        validate_upload(value, IMAGE_TYPES)
        return value


class PhotoUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = ListingPhoto
        fields = ["caption", "position"]


def unique_listing_slug(prop: Property) -> str:
    base = slugify(f"{prop.name} {prop.locality}")[:100] or "pg"
    slug, n = base, 2
    while Listing.objects.filter(slug=slug).exists():
        slug, n = f"{base}-{n}", n + 1
    return slug


class ListingSerializer(serializers.ModelSerializer):
    property = OrgScopedRelatedField(queryset=Property.objects.all())
    property_name = serializers.CharField(source="property.name", read_only=True)
    locality = serializers.CharField(source="property.locality", read_only=True)
    options = serializers.SerializerMethodField()
    enquiries_new = serializers.IntegerField(read_only=True, default=0)
    photos = ListingPhotoSerializer(many=True, read_only=True)

    class Meta:
        model = Listing
        fields = [
            "id",
            "property",
            "property_name",
            "locality",
            "slug",
            "headline",
            "description",
            "contact_phone",
            "food_included",
            "house_rules",
            "is_published",
            "published_at",
            "is_verified",
            "options",
            "enquiries_new",
            "photos",
            "created_at",
        ]
        read_only_fields = ["id", "slug", "published_at", "is_verified", "created_at"]

    @extend_schema_field(SharingOptionSerializer(many=True))
    def get_options(self, obj: Listing) -> list[dict[str, Any]]:
        return sharing_options(obj.property)

    def validate_contact_phone(self, value: str) -> str:
        return normalize_indian_mobile(value) if value else value

    def validate_property(self, value: Property) -> Property:
        clash = Listing.objects.filter(property=value)
        if self.instance is not None:
            if value != self.instance.property:
                raise serializers.ValidationError("A listing cannot move to another property.")
            clash = clash.exclude(pk=self.instance.pk)
        if clash.exists():
            raise serializers.ValidationError("This property already has a listing.")
        return value

    def _publish_fields(self, attrs: dict[str, Any]) -> dict[str, Any]:
        published = attrs.get("is_published")
        if published and (self.instance is None or not self.instance.is_published):
            attrs["published_at"] = timezone.now()
        return attrs

    def create(self, validated_data: dict[str, Any]) -> Listing:
        validated_data["slug"] = unique_listing_slug(validated_data["property"])
        return super().create(self._publish_fields(validated_data))

    def update(self, instance: Listing, validated_data: dict[str, Any]) -> Listing:
        return super().update(instance, self._publish_fields(validated_data))


class EnquirySerializer(serializers.ModelSerializer):
    listing_headline = serializers.CharField(source="listing.headline", read_only=True)
    property_name = serializers.CharField(source="listing.property.name", read_only=True)

    class Meta:
        model = Enquiry
        fields = [
            "id",
            "listing",
            "listing_headline",
            "property_name",
            "name",
            "phone",
            "email",
            "preferred_sharing",
            "move_in_date",
            "message",
            "status",
            "notes",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "listing",
            "name",
            "phone",
            "email",
            "preferred_sharing",
            "move_in_date",
            "message",
            "created_at",
            "updated_at",
        ]


# ---------- public (no login) ----------


class PublicPhotoSerializer(serializers.Serializer):
    """A listing photo or a property photo; the public page shows both kinds alike."""

    url = serializers.SerializerMethodField()
    caption = serializers.CharField(read_only=True)
    width = serializers.IntegerField(read_only=True)
    height = serializers.IntegerField(read_only=True)

    def get_url(self, obj: Any) -> str:
        return str(obj.image.url)


def _approximate(value: Any) -> float | None:
    """Public map pins are rounded to ~100 m so the exact building is not exposed."""
    return None if value is None else round(float(value), 3)


class PublicListingSerializer(serializers.ModelSerializer):
    """What anyone on the internet sees. No exact address, no operator data.

    The owner's phone number is shown only to signed-in visitors (as PG Buddy does),
    which keeps scrapers from harvesting numbers.
    """

    name = serializers.CharField(source="property.name")
    locality = serializers.CharField(source="property.locality")
    landmark = serializers.CharField(source="property.landmark")
    city = serializers.CharField(source="property.city")
    gender = serializers.CharField(source="property.gender")
    amenities = serializers.ListField(source="property.amenities", child=serializers.CharField())
    operator = serializers.CharField(source="organization.name")
    options = serializers.SerializerMethodField()
    starting_rent = serializers.SerializerMethodField()
    vacant_beds = serializers.SerializerMethodField()
    contact_phone = serializers.SerializerMethodField()
    phone_hidden = serializers.SerializerMethodField()
    photos = serializers.SerializerMethodField()
    amenity_details = serializers.SerializerMethodField()
    latitude = serializers.SerializerMethodField()
    longitude = serializers.SerializerMethodField()

    class Meta:
        model = Listing
        fields = [
            "slug",
            "headline",
            "description",
            "name",
            "locality",
            "landmark",
            "city",
            "gender",
            "amenities",
            "food_included",
            "house_rules",
            "contact_phone",
            "phone_hidden",
            "operator",
            "is_verified",
            "photos",
            "amenity_details",
            "latitude",
            "longitude",
            "options",
            "starting_rent",
            "vacant_beds",
        ]
        read_only_fields = fields

    def _signed_in(self) -> bool:
        request = self.context.get("request")
        return bool(request and request.user and request.user.is_authenticated)

    @extend_schema_field(PublicAmenitySerializer(many=True))
    def get_amenity_details(self, obj: Listing) -> Any:
        rows = [
            pa
            for pa in obj.property.amenity_assignments.all()
            if pa.status == PropertyAmenity.Status.AVAILABLE
        ]
        return PublicAmenitySerializer(rows, many=True).data

    @extend_schema_field(PublicPhotoSerializer(many=True))
    def get_photos(self, obj: Listing) -> Any:
        # Property photos first (uploaded once, shown everywhere), then listing-only ones.
        photos = [*obj.property.photos.all(), *obj.photos.all()]
        return PublicPhotoSerializer(photos, many=True).data

    @extend_schema_field(serializers.CharField(allow_null=True))
    def get_contact_phone(self, obj: Listing) -> str | None:
        return (obj.contact_phone or None) if self._signed_in() else None

    @extend_schema_field(serializers.BooleanField())
    def get_phone_hidden(self, obj: Listing) -> bool:
        return bool(obj.contact_phone) and not self._signed_in()

    @extend_schema_field(serializers.FloatField(allow_null=True))
    def get_latitude(self, obj: Listing) -> float | None:
        return _approximate(obj.property.latitude)

    @extend_schema_field(serializers.FloatField(allow_null=True))
    def get_longitude(self, obj: Listing) -> float | None:
        return _approximate(obj.property.longitude)

    def _options(self, obj: Listing) -> list[dict[str, Any]]:
        cache = self.context.setdefault("_options", {})
        if obj.pk not in cache:
            cache[obj.pk] = sharing_options(obj.property)
        return cache[obj.pk]

    @extend_schema_field(SharingOptionSerializer(many=True))
    def get_options(self, obj: Listing) -> list[dict[str, Any]]:
        return self._options(obj)

    @extend_schema_field(serializers.IntegerField(allow_null=True))
    def get_starting_rent(self, obj: Listing) -> int | None:
        rents = [o["min_rent"] for o in self._options(obj) if o["min_rent"] is not None]
        return min(rents) if rents else None

    @extend_schema_field(serializers.IntegerField())
    def get_vacant_beds(self, obj: Listing) -> int:
        return sum(o["vacant_beds"] for o in self._options(obj))


class PublicEnquirySerializer(serializers.ModelSerializer):
    # Honeypot: real people never see or fill this field; bots often do.
    website = serializers.CharField(required=False, allow_blank=True, write_only=True)

    class Meta:
        model = Enquiry
        fields = [
            "name",
            "phone",
            "email",
            "preferred_sharing",
            "move_in_date",
            "message",
            "website",
        ]
        extra_kwargs = {
            "preferred_sharing": {"min_value": 1, "max_value": 12},
            "message": {"max_length": 1000},
        }

    def validate_phone(self, value: str) -> str:
        return normalize_indian_mobile(value)

    def validate_move_in_date(self, value: Any) -> Any:
        if value and value < timezone.localdate():
            raise serializers.ValidationError("Choose a date from today onwards.")
        return value


class LocalitySerializer(serializers.Serializer):
    locality = serializers.CharField()
    listings = serializers.IntegerField()


class ListingReportSerializer(serializers.ModelSerializer):
    class Meta:
        model = ListingReport
        fields = ["reason", "details", "contact"]
        extra_kwargs = {"details": {"max_length": 2000}}


class PgRequestSerializer(serializers.ModelSerializer):
    website = serializers.CharField(required=False, allow_blank=True, write_only=True)

    class Meta:
        model = PgRequest
        fields = [
            "pg_name",
            "locality",
            "owner_phone",
            "contact_name",
            "contact_phone",
            "notes",
            "website",
        ]
        extra_kwargs = {"notes": {"max_length": 2000}}

    def validate_contact_phone(self, value: str) -> str:
        return normalize_indian_mobile(value)

    def validate_owner_phone(self, value: str) -> str:
        return normalize_indian_mobile(value) if value else value
