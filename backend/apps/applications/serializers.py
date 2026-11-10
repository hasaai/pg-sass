from __future__ import annotations

import datetime as dt
from typing import Any

from django.utils import timezone
from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from apps.applications.models import Application
from apps.properties.models import Bed
from apps.tenants import places
from apps.tenants.models import Tenant
from core.fields import OrgScopedRelatedField
from core.validators import normalize_indian_mobile


class ListingSummarySerializer(serializers.Serializer):
    slug = serializers.CharField()
    headline = serializers.CharField()
    name = serializers.CharField(source="property.name")
    locality = serializers.CharField(source="property.locality")


class AllocatedBedSerializer(serializers.Serializer):
    room_number = serializers.CharField()
    bed_label = serializers.CharField()
    check_in = serializers.DateField()
    monthly_rent = serializers.IntegerField()


def _allocated(app: Application) -> dict[str, Any] | None:
    stay = app.stay
    if stay is None:
        return None
    return {
        "room_number": places.room_number(stay),
        "bed_label": places.bed_label(stay),
        "check_in": stay.check_in,
        "monthly_rent": stay.monthly_rent,
    }


class ApplicationSerializer(serializers.ModelSerializer):
    """Shared shape for the seeker ("my applications") and the operator inbox."""

    listing = ListingSummarySerializer(read_only=True)
    allocated = serializers.SerializerMethodField()
    operator = serializers.CharField(source="organization.name", read_only=True)

    class Meta:
        model = Application
        fields = [
            "id",
            "listing",
            "operator",
            "full_name",
            "phone",
            "email",
            "gender",
            "occupation",
            "id_type",
            "id_last4",
            "preferred_sharing",
            "move_in_date",
            "message",
            "status",
            "decline_reason",
            "decided_at",
            "allocated",
            "created_at",
        ]
        read_only_fields = fields

    @extend_schema_field(AllocatedBedSerializer(allow_null=True))
    def get_allocated(self, obj: Application) -> dict[str, Any] | None:
        return _allocated(obj)


class ApplyRequestSerializer(serializers.Serializer):
    listing = serializers.SlugField(help_text="Listing slug")
    full_name = serializers.CharField(max_length=150)
    phone = serializers.CharField(max_length=20)
    email = serializers.EmailField(required=False, allow_blank=True)
    gender = serializers.ChoiceField(
        choices=Tenant.Gender.choices, required=False, allow_blank=True
    )
    occupation = serializers.CharField(max_length=100, required=False, allow_blank=True)
    id_type = serializers.ChoiceField(
        choices=Tenant.IdType.choices, required=False, allow_blank=True
    )
    id_last4 = serializers.CharField(max_length=4, required=False, allow_blank=True)
    preferred_sharing = serializers.IntegerField(min_value=1, max_value=12, required=False)
    move_in_date = serializers.DateField()
    message = serializers.CharField(max_length=1000, required=False, allow_blank=True)
    consent = serializers.BooleanField()

    def validate_phone(self, value: str) -> str:
        return normalize_indian_mobile(value)

    def validate_id_last4(self, value: str) -> str:
        if value and (len(value) != 4 or not value.isalnum()):
            raise serializers.ValidationError("Enter only the last 4 characters of the ID.")
        return value.upper()

    def validate_move_in_date(self, value: dt.date) -> dt.date:
        today = timezone.localdate()
        if value < today:
            raise serializers.ValidationError("Choose a date from today onwards.")
        if value > today + dt.timedelta(days=120):
            raise serializers.ValidationError("Apply at most 4 months ahead.")
        return value

    def validate_consent(self, value: bool) -> bool:
        if not value:
            raise serializers.ValidationError(
                "Please agree to share these details with the PG operator."
            )
        return value


class ApproveSerializer(serializers.Serializer):
    bed = OrgScopedRelatedField(queryset=Bed.objects.select_related("room"))
    check_in = serializers.DateField()
    monthly_rent = serializers.IntegerField(min_value=0, required=False)
    deposit_amount = serializers.IntegerField(min_value=0, default=0)
    deposit_collected = serializers.IntegerField(min_value=0, default=0)


class DeclineSerializer(serializers.Serializer):
    reason = serializers.CharField(max_length=255)


class WishlistAddSerializer(serializers.Serializer):
    listing = serializers.SlugField()
