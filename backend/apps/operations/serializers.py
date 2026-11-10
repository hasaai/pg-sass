from __future__ import annotations

from typing import Any

from django.utils import timezone
from rest_framework import serializers

from apps.accounts.models import User
from apps.operations.models import Complaint, Notice
from apps.organizations.models import Membership
from apps.properties.models import Property
from apps.tenants.models import Tenant
from core.fields import OrgScopedRelatedField


class ComplaintSerializer(serializers.ModelSerializer):
    property = OrgScopedRelatedField(queryset=Property.objects.all())
    property_name = serializers.CharField(source="property.name", read_only=True)
    tenant = OrgScopedRelatedField(queryset=Tenant.objects.all(), required=False, allow_null=True)
    tenant_name = serializers.CharField(source="tenant.full_name", read_only=True, default=None)
    assignee = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.all(), required=False, allow_null=True
    )
    assignee_name = serializers.CharField(source="assignee.full_name", read_only=True, default=None)

    class Meta:
        model = Complaint
        fields = [
            "id",
            "property",
            "property_name",
            "tenant",
            "tenant_name",
            "category",
            "title",
            "description",
            "priority",
            "status",
            "assignee",
            "assignee_name",
            "resolved_at",
            "resolution_note",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "resolved_at", "created_at", "updated_at"]

    def validate_assignee(self, value: User | None) -> User | None:
        if value is None:
            return value
        organization = self.context["request"].organization
        if not Membership.objects.filter(
            organization=organization, user=value, is_active=True
        ).exists():
            raise serializers.ValidationError("Assign the complaint to a member of your team.")
        return value

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        new_status = attrs.get("status")
        if new_status in (Complaint.Status.RESOLVED, Complaint.Status.CLOSED):
            if self.instance is None or self.instance.resolved_at is None:
                attrs["resolved_at"] = timezone.now()
        elif new_status in (Complaint.Status.OPEN, Complaint.Status.IN_PROGRESS):
            attrs["resolved_at"] = None
        return attrs


class NoticeSerializer(serializers.ModelSerializer):
    property = OrgScopedRelatedField(
        queryset=Property.objects.all(), required=False, allow_null=True
    )
    property_name = serializers.CharField(source="property.name", read_only=True, default=None)

    class Meta:
        model = Notice
        fields = ["id", "property", "property_name", "title", "body", "is_pinned", "created_at"]
        read_only_fields = ["id", "created_at"]
