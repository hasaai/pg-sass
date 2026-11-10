from __future__ import annotations

from typing import Any

from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from apps.accounts.models import User
from apps.amenities.models import Amenity
from apps.organizations.models import Membership, Organization, Role
from apps.platform.models import PlatformRole
from apps.properties.models import Property
from apps.properties.serializers import PropertyDocumentSerializer, VerificationEventSerializer
from core.features import FEATURES


class FeatureSerializer(serializers.Serializer):
    key = serializers.CharField()
    label = serializers.CharField()  # type: ignore[assignment]  # API field, not Field.label
    description = serializers.CharField()
    enabled = serializers.BooleanField()


def features_of(org: Organization) -> list[dict[str, Any]]:
    off = set(org.disabled_features or [])
    return [
        {"key": f.key, "label": f.label, "description": f.description, "enabled": f.key not in off}
        for f in FEATURES
    ]


class PersonSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    full_name = serializers.CharField()
    email = serializers.CharField(allow_null=True)


class PlatformOrganizationSerializer(serializers.ModelSerializer):
    status_label = serializers.CharField(source="get_status_display", read_only=True)
    logo_url = serializers.SerializerMethodField()
    owners = serializers.SerializerMethodField()
    properties_count = serializers.IntegerField(read_only=True, default=0)
    members_count = serializers.IntegerField(read_only=True, default=0)
    beds_total = serializers.IntegerField(read_only=True, default=0)
    tenants_count = serializers.IntegerField(read_only=True, default=0)
    awaiting_verification = serializers.IntegerField(read_only=True, default=0)
    features = serializers.SerializerMethodField()

    class Meta:
        model = Organization
        fields = [
            "id",
            "name",
            "slug",
            "contact_phone",
            "status",
            "status_label",
            "suspended_reason",
            "logo_url",
            "owners",
            "properties_count",
            "members_count",
            "beds_total",
            "tenants_count",
            "awaiting_verification",
            "disabled_features",
            "features",
            "created_at",
        ]
        read_only_fields = fields

    def get_logo_url(self, obj: Organization) -> str | None:
        return obj.logo.url if obj.logo else None

    @extend_schema_field(PersonSerializer(many=True))
    def get_owners(self, obj: Organization) -> list[dict[str, Any]]:
        owners = [
            m.user
            for m in Membership.objects.filter(
                organization=obj, role=Role.OWNER, is_active=True
            ).select_related("user")
        ]
        return [{"id": str(u.id), "full_name": u.full_name, "email": u.email} for u in owners]

    @extend_schema_field(FeatureSerializer(many=True))
    def get_features(self, obj: Organization) -> list[dict[str, Any]]:
        return features_of(obj)


class FeaturesUpdateSerializer(serializers.Serializer):
    disabled_features = serializers.ListField(child=serializers.CharField(), allow_empty=True)


class SuspendSerializer(serializers.Serializer):
    reason = serializers.CharField(max_length=255)


class PlatformPropertySerializer(serializers.ModelSerializer):
    organization_name = serializers.CharField(source="organization.name", read_only=True)
    organization_id = serializers.UUIDField(read_only=True)
    status_label = serializers.CharField(source="get_status_display", read_only=True)
    verification_status_label = serializers.CharField(
        source="get_verification_status_display", read_only=True
    )
    property_type_label = serializers.CharField(source="get_property_type_display", read_only=True)
    documents_count = serializers.IntegerField(read_only=True, default=0)
    proof_documents_count = serializers.IntegerField(read_only=True, default=0)
    submitted_at = serializers.DateTimeField(read_only=True, default=None)
    logo_url = serializers.SerializerMethodField()

    class Meta:
        model = Property
        fields = [
            "id",
            "name",
            "reference",
            "contact_phone",
            "organization_id",
            "organization_name",
            "property_type",
            "property_type_label",
            "status",
            "status_label",
            "verification_status",
            "verification_status_label",
            "address_line",
            "locality",
            "city",
            "pincode",
            "latitude",
            "longitude",
            "documents_count",
            "proof_documents_count",
            "submitted_at",
            "logo_url",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields

    def get_logo_url(self, obj: Property) -> str | None:
        return obj.logo.url if obj.logo else None


class PlatformPropertyDetailSerializer(PlatformPropertySerializer):
    documents = PropertyDocumentSerializer(many=True, read_only=True)
    history = VerificationEventSerializer(many=True, read_only=True, source="verification_events")

    class Meta(PlatformPropertySerializer.Meta):
        fields = [*PlatformPropertySerializer.Meta.fields, "documents", "history"]
        read_only_fields = fields


class VerificationDecisionSerializer(serializers.Serializer):
    decision = serializers.ChoiceField(
        choices=[
            (Property.Verification.VERIFIED, "Verified"),
            (Property.Verification.CHANGES_REQUESTED, "Changes needed"),
            (Property.Verification.REJECTED, "Not approved"),
        ]
    )
    note = serializers.CharField(max_length=1000, required=False, allow_blank=True, default="")


class UserMembershipSerializer(serializers.ModelSerializer):
    organization_id = serializers.UUIDField(read_only=True)
    organization_name = serializers.CharField(source="organization.name", read_only=True)
    role_label = serializers.CharField(source="get_role_display", read_only=True)

    class Meta:
        model = Membership
        fields = ["organization_id", "organization_name", "role", "role_label", "is_active"]
        read_only_fields = fields


class PlatformUserSerializer(serializers.ModelSerializer):
    memberships = UserMembershipSerializer(many=True, read_only=True)
    is_platform_admin = serializers.BooleanField(source="is_staff", read_only=True)

    class Meta:
        model = User
        fields = [
            "id",
            "email",
            "phone",
            "full_name",
            "is_active",
            "is_platform_admin",
            "last_login",
            "date_joined",
            "memberships",
        ]
        read_only_fields = fields


class PlatformAmenitySerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source="category.name", read_only=True)

    class Meta:
        model = Amenity
        fields = [
            "key",
            "name",
            "category",
            "category_name",
            "position",
            "is_active",
            "is_filterable",
            "property_types",
        ]
        read_only_fields = ["key", "category", "category_name", "property_types"]


class OverviewSerializer(serializers.Serializer):
    businesses = serializers.IntegerField()
    businesses_suspended = serializers.IntegerField()
    properties = serializers.IntegerField()
    properties_open = serializers.IntegerField()
    awaiting_verification = serializers.IntegerField()
    verified = serializers.IntegerField()
    beds = serializers.IntegerField()
    beds_occupied = serializers.IntegerField()
    users = serializers.IntegerField()
    documents_expiring = serializers.IntegerField()


class ActivitySerializer(serializers.Serializer):
    id = serializers.UUIDField()
    action = serializers.CharField()
    organization_id = serializers.UUIDField()
    organization_name = serializers.CharField()
    actor = serializers.CharField(allow_null=True)
    object_type = serializers.CharField()
    object_id = serializers.CharField()
    data = serializers.DictField()  # type: ignore[assignment]  # API field
    created_at = serializers.DateTimeField()


class StaffSerializer(serializers.Serializer):
    id = serializers.UUIDField(read_only=True)
    user = PersonSerializer(read_only=True)
    role = serializers.CharField(read_only=True)
    role_label = serializers.CharField(source="get_role_display", read_only=True)
    permissions = serializers.SerializerMethodField()
    extra_permissions = serializers.ListField(child=serializers.CharField(), read_only=True)
    removed_permissions = serializers.ListField(child=serializers.CharField(), read_only=True)
    is_active = serializers.BooleanField(source="user.is_active", read_only=True)
    created_at = serializers.DateTimeField(read_only=True)

    def get_permissions(self, obj: Any) -> list[str]:
        return sorted(obj.permissions)


class StaffAccessSerializer(serializers.Serializer):
    role = serializers.ChoiceField(choices=PlatformRole.choices, required=False)
    permissions = serializers.ListField(child=serializers.CharField(), required=False)


class StaffCreateSerializer(serializers.Serializer):
    email = serializers.EmailField()
    full_name = serializers.CharField(max_length=150)
    role = serializers.ChoiceField(choices=PlatformRole.choices)
    permissions = serializers.ListField(child=serializers.CharField(), required=False)
    temporary_password = serializers.CharField(
        write_only=True, required=False, trim_whitespace=False
    )


class StaffEventSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    action = serializers.CharField()
    actor = serializers.CharField(source="actor.full_name", default=None)
    target = serializers.CharField(source="target.full_name", default=None)
    details = serializers.DictField(source="data")
    created_at = serializers.DateTimeField()
