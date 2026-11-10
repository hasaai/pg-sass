from __future__ import annotations

import datetime as dt
from typing import Any

from django.utils import timezone
from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from apps.billing.models import Invoice, InvoiceLine, Payment
from apps.tenants import places
from core.fields import OrgScopedRelatedField


class InvoiceLineSerializer(serializers.ModelSerializer):
    class Meta:
        model = InvoiceLine
        fields = ["id", "kind", "description", "amount", "created_at"]
        read_only_fields = fields


class PaymentSummarySerializer(serializers.ModelSerializer):
    class Meta:
        model = Payment
        fields = ["id", "receipt_number", "amount", "mode", "reference", "received_on"]
        read_only_fields = fields


class StayDetailsSerializer(serializers.Serializer):
    stay_id = serializers.UUIDField()
    tenant_id = serializers.UUIDField()
    tenant_name = serializers.CharField()
    tenant_phone = serializers.CharField()
    property_id = serializers.UUIDField()
    property_name = serializers.CharField()
    room_number = serializers.CharField()
    bed_label = serializers.CharField()
    place_label = serializers.CharField()


def _stay_context(stay: Any) -> dict[str, Any]:
    return {
        "stay_id": str(stay.id),
        "tenant_id": str(stay.tenant_id),
        "tenant_name": stay.tenant.full_name,
        "tenant_phone": stay.tenant.phone,
        "property_id": str(stay.property_id),
        "property_name": stay.property.name,
        "room_number": places.room_number(stay),
        "bed_label": places.bed_label(stay),
        "place_label": places.place_label(stay),
    }


class InvoiceSerializer(serializers.ModelSerializer):
    balance = serializers.IntegerField(read_only=True)
    is_overdue = serializers.SerializerMethodField()
    details = serializers.SerializerMethodField()
    lines = InvoiceLineSerializer(many=True, read_only=True)
    payments = PaymentSummarySerializer(many=True, read_only=True)

    class Meta:
        model = Invoice
        fields = [
            "id",
            "number",
            "period",
            "issue_date",
            "due_date",
            "status",
            "total",
            "paid",
            "balance",
            "is_overdue",
            "void_reason",
            "details",
            "lines",
            "payments",
            "created_at",
        ]
        read_only_fields = fields

    @extend_schema_field(serializers.BooleanField())
    def get_is_overdue(self, obj: Invoice) -> bool:
        today = self.context["today"]
        return obj.balance > 0 and obj.due_date < today

    @extend_schema_field(StayDetailsSerializer)
    def get_details(self, obj: Invoice) -> dict[str, Any]:
        return _stay_context(obj.stay)


class GenerateInvoicesSerializer(serializers.Serializer):
    period = serializers.RegexField(r"^\d{4}-(0[1-9]|1[0-2])$", help_text="YYYY-MM")
    property = serializers.UUIDField(required=False)


class GenerateResultSerializer(serializers.Serializer):
    created = serializers.IntegerField()
    invoice_ids = serializers.ListField(child=serializers.UUIDField())


class ChargeSerializer(serializers.Serializer):
    kind = serializers.ChoiceField(
        choices=[c for c in InvoiceLine.Kind.choices if c[0] != InvoiceLine.Kind.RENT]
    )
    description = serializers.CharField(max_length=255)
    amount = serializers.IntegerField(min_value=1, max_value=10_000_000)


class VoidSerializer(serializers.Serializer):
    reason = serializers.CharField(max_length=255)


class PaymentSerializer(serializers.ModelSerializer):
    invoice = OrgScopedRelatedField(queryset=Invoice.objects.all())
    invoice_number = serializers.CharField(source="invoice.number", read_only=True)
    invoice_period = serializers.DateField(source="invoice.period", read_only=True)
    invoice_balance = serializers.IntegerField(source="invoice.balance", read_only=True)
    organization_name = serializers.CharField(source="organization.name", read_only=True)
    received_by = serializers.CharField(source="created_by.full_name", read_only=True, default="")
    details = serializers.SerializerMethodField()

    class Meta:
        model = Payment
        fields = [
            "id",
            "receipt_number",
            "invoice",
            "invoice_number",
            "invoice_period",
            "invoice_balance",
            "amount",
            "mode",
            "reference",
            "received_on",
            "received_by",
            "organization_name",
            "details",
            "created_at",
        ]
        read_only_fields = ["id", "receipt_number", "created_at"]
        extra_kwargs = {"amount": {"min_value": 1, "max_value": 10_000_000}}

    @extend_schema_field(StayDetailsSerializer)
    def get_details(self, obj: Payment) -> dict[str, Any]:
        return _stay_context(obj.invoice.stay)

    def validate_received_on(self, value: dt.date) -> dt.date:
        if value > timezone.localdate():
            raise serializers.ValidationError("A payment cannot be received in the future.")
        return value
