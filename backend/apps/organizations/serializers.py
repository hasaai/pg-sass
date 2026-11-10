from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from apps.organizations.models import Membership, Organization, Role


class OrganizationSerializer(serializers.ModelSerializer):
    logo_url = serializers.SerializerMethodField()
    disabled_features = serializers.SerializerMethodField()

    class Meta:
        model = Organization
        fields = [
            "id",
            "name",
            "slug",
            "contact_phone",
            "status",
            "logo_url",
            "disabled_features",
            "created_at",
        ]
        read_only_fields = ["id", "slug", "status", "logo_url", "disabled_features", "created_at"]

    @extend_schema_field(serializers.ListField(child=serializers.CharField()))
    def get_disabled_features(self, obj: Organization) -> list[str]:
        from apps.subscriptions.entitlements import features_off

        return features_off(obj)

    def get_logo_url(self, obj: Organization) -> str | None:
        return obj.logo.url if obj.logo else None


class MemberUserSerializer(serializers.Serializer):
    id = serializers.UUIDField(read_only=True)
    email = serializers.EmailField(read_only=True)
    full_name = serializers.CharField(read_only=True)


class MembershipSerializer(serializers.ModelSerializer):
    user = MemberUserSerializer(read_only=True)
    role_label = serializers.CharField(source="get_role_display", read_only=True)
    permissions = serializers.SerializerMethodField()
    property_ids = serializers.SerializerMethodField()
    extra_permissions = serializers.ListField(child=serializers.CharField(), read_only=True)
    removed_permissions = serializers.ListField(child=serializers.CharField(), read_only=True)

    class Meta:
        model = Membership
        fields = [
            "id",
            "user",
            "role",
            "role_label",
            "is_active",
            "permissions",
            "extra_permissions",
            "removed_permissions",
            "property_ids",
            "created_at",
        ]
        read_only_fields = fields

    def get_permissions(self, obj: Membership) -> list[str]:
        return sorted(obj.permissions)

    @extend_schema_field(serializers.ListField(child=serializers.UUIDField()))
    def get_property_ids(self, obj: Membership) -> list[str]:
        """Empty means all properties."""
        return sorted(str(p.pk) for p in obj.properties.all())


class MemberAccessSerializer(serializers.Serializer):
    role = serializers.ChoiceField(choices=Role.choices, required=False)
    permissions = serializers.ListField(
        child=serializers.CharField(),
        required=False,
        help_text="All the ticks this person should have. Leave out to keep them.",
    )
    property_ids = serializers.ListField(
        child=serializers.UUIDField(),
        required=False,
        help_text="The properties this person works in. Empty means all properties.",
    )


class PermissionChoiceSerializer(serializers.Serializer):
    code = serializers.CharField()
    area = serializers.CharField()
    label = serializers.CharField()  # type: ignore[assignment]


class RoleChoiceSerializer(serializers.Serializer):
    value = serializers.CharField()
    label = serializers.CharField()  # type: ignore[assignment]
    help = serializers.CharField()
    permissions = serializers.ListField(child=serializers.CharField())


class AccessChoicesSerializer(serializers.Serializer):
    roles = RoleChoiceSerializer(many=True)
    permissions = PermissionChoiceSerializer(many=True)


class MemberCreateSerializer(serializers.Serializer):
    email = serializers.EmailField()
    full_name = serializers.CharField(max_length=150)
    role = serializers.ChoiceField(choices=Role.choices)
    temporary_password = serializers.CharField(
        write_only=True,
        required=False,
        trim_whitespace=False,
        help_text="Required when the person has no account yet.",
    )
    permissions = serializers.ListField(child=serializers.CharField(), required=False)
    property_ids = serializers.ListField(child=serializers.UUIDField(), required=False)
