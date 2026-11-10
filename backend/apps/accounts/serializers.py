from __future__ import annotations

from typing import Any

from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from apps.accounts.models import User, normalize_email_address
from apps.organizations.models import Membership, Organization
from apps.subscriptions.entitlements import features_off, for_org
from core.validators import normalize_indian_mobile


class RegisterSerializer(serializers.Serializer):
    full_name = serializers.CharField(max_length=150)
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True, trim_whitespace=False)
    phone = serializers.CharField(max_length=20)
    organization_name = serializers.CharField(max_length=150)
    contact_phone = serializers.CharField(max_length=20, required=False, allow_blank=True)

    def validate_email(self, value: str) -> str:
        email = normalize_email_address(value) or ""
        if User.objects.filter(email=email).exists():
            raise serializers.ValidationError(
                "An account with this email already exists.", code="email_taken"
            )
        return email

    def validate_phone(self, value: str) -> str:
        phone = normalize_indian_mobile(value)
        if User.objects.filter(phone=phone).exists():
            raise serializers.ValidationError("An account with this mobile already exists.")
        return phone

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        candidate = User(email=attrs["email"], full_name=attrs["full_name"])
        try:
            validate_password(attrs["password"], user=candidate)
        except DjangoValidationError as exc:
            raise serializers.ValidationError({"password": list(exc.messages)}) from exc
        return attrs


class SeekerRegisterSerializer(serializers.Serializer):
    """Someone looking for a PG: no organization, just an account to apply and save PGs."""

    full_name = serializers.CharField(max_length=150)
    email = serializers.EmailField()
    phone = serializers.CharField(max_length=20)
    password = serializers.CharField(write_only=True, trim_whitespace=False)

    def validate_email(self, value: str) -> str:
        email = normalize_email_address(value) or ""
        if User.objects.filter(email=email).exists():
            raise serializers.ValidationError(
                "An account with this email already exists.", code="email_taken"
            )
        return email

    def validate_phone(self, value: str) -> str:
        phone = normalize_indian_mobile(value)
        if User.objects.filter(phone=phone).exists():
            raise serializers.ValidationError("An account with this mobile already exists.")
        return phone

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        candidate = User(email=attrs["email"], full_name=attrs["full_name"])
        try:
            validate_password(attrs["password"], user=candidate)
        except DjangoValidationError as exc:
            raise serializers.ValidationError({"password": list(exc.messages)}) from exc
        return attrs


class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True, trim_whitespace=False)


class OrganizationSummarySerializer(serializers.Serializer):
    id = serializers.UUIDField()
    name = serializers.CharField()
    slug = serializers.CharField()
    logo_url = serializers.CharField(allow_null=True)
    disabled_features = serializers.ListField(child=serializers.CharField())
    plan_name = serializers.CharField()


class MembershipSummarySerializer(serializers.ModelSerializer):
    organization = serializers.SerializerMethodField()
    role_label = serializers.CharField(source="get_role_display", read_only=True)
    permissions = serializers.SerializerMethodField()
    all_properties = serializers.SerializerMethodField()

    class Meta:
        model = Membership
        fields = ["organization", "role", "role_label", "permissions", "all_properties"]

    def get_permissions(self, obj: Membership) -> list[str]:
        """What this person may do in this business (core/access.py), sorted."""
        return sorted(obj.permissions)

    def get_all_properties(self, obj: Membership) -> bool:
        """False when this person works only in some properties."""
        from core.access import sees_all_properties

        return sees_all_properties(obj)

    @extend_schema_field(OrganizationSummarySerializer)
    def get_organization(self, obj: Membership) -> dict[str, Any]:
        org: Organization = obj.organization
        return {
            "id": str(org.id),
            "name": org.name,
            "slug": org.slug,
            "logo_url": org.logo.url if org.logo else None,
            "disabled_features": features_off(org),
            "plan_name": for_org(org).plan.name,
        }


class MeSerializer(serializers.ModelSerializer):
    memberships = serializers.SerializerMethodField()
    is_platform_admin = serializers.SerializerMethodField()
    platform_role_label = serializers.SerializerMethodField()
    platform_permissions = serializers.SerializerMethodField()
    phone_verified = serializers.SerializerMethodField()
    email_verified = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            "id",
            "email",
            "phone",
            "phone_verified",
            "email_verified",
            "full_name",
            "is_platform_admin",
            "platform_role_label",
            "platform_permissions",
            "memberships",
        ]
        read_only_fields = fields

    def get_is_platform_admin(self, obj: User) -> bool:
        """On the PG Manager team (has at least one platform permission)."""
        return bool(self.get_platform_permissions(obj))

    def get_platform_permissions(self, obj: User) -> list[str]:
        from apps.platform.access import user_platform_permissions

        return sorted(user_platform_permissions(obj))

    def get_platform_role_label(self, obj: User) -> str | None:
        staff = getattr(obj, "platform_staff", None) if obj.is_staff else None
        return staff.get_role_display() if staff else None

    def get_email_verified(self, obj: User) -> bool:
        return obj.email_verified_at is not None

    def get_phone_verified(self, obj: User) -> bool:
        return obj.phone_verified_at is not None

    @extend_schema_field(MembershipSummarySerializer(many=True))
    def get_memberships(self, obj: User) -> list[dict[str, Any]]:
        memberships = (
            Membership.objects.filter(
                user=obj, is_active=True, organization__status=Organization.Status.ACTIVE
            )
            .select_related("organization")
            .order_by("organization__name")
        )
        return list(MembershipSummarySerializer(memberships, many=True).data)


class AccessTokenSerializer(serializers.Serializer):
    access = serializers.CharField()


class AuthResponseSerializer(AccessTokenSerializer):
    user = MeSerializer()
