from __future__ import annotations

from typing import Any

from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from apps.subscriptions import gateways, services
from apps.subscriptions.catalog import ALLOWANCES, FEATURES, LIMITS
from apps.subscriptions.models import (
    PaymentGateway,
    Plan,
    PlanPayment,
    SubscriptionEvent,
)

# ---------------------------------------------------------------- shared


class UsageSerializer(serializers.Serializer):
    key = serializers.CharField()
    label = serializers.CharField()  # type: ignore[assignment]
    used = serializers.IntegerField()
    limit = serializers.IntegerField(allow_null=True)


class FeatureStateSerializer(serializers.Serializer):
    key = serializers.CharField()
    label = serializers.CharField()  # type: ignore[assignment]
    on = serializers.BooleanField()


class AllowanceSerializer(serializers.Serializer):
    key = serializers.CharField()
    label = serializers.CharField()  # type: ignore[assignment]
    per_month = serializers.IntegerField()


class MyPlanSerializer(serializers.Serializer):
    plan_key = serializers.CharField()
    plan_name = serializers.CharField()
    status = serializers.ChoiceField(choices=["trial", "active", "expired", "none"])
    status_label = serializers.CharField()
    ends_on = serializers.DateField(allow_null=True)
    days_left = serializers.IntegerField(allow_null=True)
    subscribed_plan = serializers.CharField(allow_null=True)
    usage = UsageSerializer(many=True)
    features = FeatureStateSerializer(many=True)
    allowances = AllowanceSerializer(many=True)


class CatalogEntrySerializer(serializers.Serializer):
    key = serializers.CharField()
    label = serializers.CharField()  # type: ignore[assignment]
    description = serializers.CharField()


class PlanCatalogSerializer(serializers.Serializer):
    """The list of everything a plan can control (for the admin plan editor)."""

    limits = CatalogEntrySerializer(many=True)
    features = CatalogEntrySerializer(many=True)
    allowances = CatalogEntrySerializer(many=True)

    @staticmethod
    def data_now() -> dict[str, Any]:
        def rows(entries: Any) -> list[dict[str, str]]:
            return [{"key": e.key, "label": e.label, "description": e.description} for e in entries]

        return {"limits": rows(LIMITS), "features": rows(FEATURES), "allowances": rows(ALLOWANCES)}


# ---------------------------------------------------------------- plans


class PlanSerializer(serializers.ModelSerializer):
    businesses = serializers.SerializerMethodField()
    limits = serializers.DictField(
        child=serializers.IntegerField(allow_null=True, min_value=0), required=False
    )
    features = serializers.ListField(child=serializers.CharField(), required=False)
    allowances = serializers.DictField(child=serializers.IntegerField(min_value=0), required=False)

    class Meta:
        model = Plan
        fields = [
            "id",
            "key",
            "name",
            "description",
            "price_month",
            "price_year",
            "limits",
            "features",
            "allowances",
            "trial_days",
            "is_public",
            "is_active",
            "position",
            "businesses",
        ]
        read_only_fields = ["id", "businesses"]

    @extend_schema_field(serializers.IntegerField())
    def get_businesses(self, obj: Plan) -> int:
        return getattr(obj, "businesses_count", None) or obj.subscriptions.count()

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        return services.clean_plan_values(attrs)


class PublicPlanSerializer(serializers.ModelSerializer):
    """What owners see when choosing a plan."""

    limits = serializers.DictField(child=serializers.IntegerField(allow_null=True), read_only=True)
    features = serializers.ListField(child=serializers.CharField(), read_only=True)
    allowances = serializers.DictField(child=serializers.IntegerField(), read_only=True)

    class Meta:
        model = Plan
        fields = [
            "key",
            "name",
            "description",
            "price_month",
            "price_year",
            "limits",
            "features",
            "allowances",
        ]
        read_only_fields = fields


# ---------------------------------------------------------------- subscriptions


class SubscriptionEventSerializer(serializers.ModelSerializer):
    kind_label = serializers.CharField(source="get_kind_display", read_only=True)
    from_plan = serializers.CharField(source="from_plan.name", read_only=True, allow_null=True)
    to_plan = serializers.CharField(source="to_plan.name", read_only=True)
    by = serializers.SerializerMethodField()

    class Meta:
        model = SubscriptionEvent
        fields = [
            "id",
            "kind",
            "kind_label",
            "from_plan",
            "to_plan",
            "ends_on",
            "note",
            "by",
            "created_at",
        ]
        read_only_fields = fields

    @extend_schema_field(serializers.CharField(allow_null=True))
    def get_by(self, obj: SubscriptionEvent) -> str | None:
        return obj.created_by.full_name if obj.created_by else None


class PlatformSubscriptionSerializer(serializers.Serializer):
    """The plan card of one business in the admin portal."""

    summary = MyPlanSerializer()
    plan = serializers.CharField(allow_null=True)
    ends_on = serializers.DateField(allow_null=True)
    limit_overrides = serializers.DictField(child=serializers.IntegerField(allow_null=True))
    note = serializers.CharField()
    history = SubscriptionEventSerializer(many=True)


class AssignPlanSerializer(serializers.Serializer):
    plan = serializers.SlugRelatedField(slug_field="key", queryset=Plan.objects.all())
    ends_on = serializers.DateField(required=False, allow_null=True)
    limit_overrides = serializers.DictField(
        child=serializers.IntegerField(allow_null=True, min_value=0), required=False
    )
    note = serializers.CharField(max_length=255, required=False, allow_blank=True)


# ---------------------------------------------------------------- payments


class PaymentGatewaySerializer(serializers.ModelSerializer):
    name = serializers.CharField(source="get_code_display", read_only=True)
    configured = serializers.SerializerMethodField()
    test_mode = serializers.SerializerMethodField()
    unavailable_reason = serializers.SerializerMethodField()

    class Meta:
        model = PaymentGateway
        fields = [
            "code",
            "name",
            "is_enabled",
            "is_default",
            "configured",
            "test_mode",
            "unavailable_reason",
        ]
        read_only_fields = ["code", "name", "configured", "test_mode", "unavailable_reason"]

    @extend_schema_field(serializers.BooleanField())
    def get_configured(self, obj: PaymentGateway) -> bool:
        return gateways.get(obj.code).configured()

    @extend_schema_field(serializers.BooleanField())
    def get_test_mode(self, obj: PaymentGateway) -> bool:
        return gateways.get(obj.code).test_mode()

    @extend_schema_field(serializers.CharField())
    def get_unavailable_reason(self, obj: PaymentGateway) -> str:
        g = gateways.get(obj.code)
        if g.unavailable_reason:
            return g.unavailable_reason
        if not g.configured():
            return "Keys are not set on the server yet."
        return ""


class CheckoutGatewaySerializer(serializers.Serializer):
    code = serializers.CharField()
    name = serializers.CharField()
    test_mode = serializers.BooleanField()
    is_default = serializers.BooleanField()


class PlanPaymentSerializer(serializers.ModelSerializer):
    plan_name = serializers.CharField(source="plan.name", read_only=True)
    business = serializers.CharField(source="organization.name", read_only=True)
    period_label = serializers.CharField(source="get_period_display", read_only=True)
    status_label = serializers.CharField(source="get_status_display", read_only=True)
    gateway_label = serializers.CharField(source="get_gateway_display", read_only=True)

    class Meta:
        model = PlanPayment
        fields = [
            "id",
            "business",
            "organization",
            "plan",
            "plan_name",
            "period",
            "period_label",
            "amount",
            "gateway",
            "gateway_label",
            "test_mode",
            "status",
            "status_label",
            "gateway_order_id",
            "gateway_payment_id",
            "paid_at",
            "failure_reason",
            "created_at",
        ]
        read_only_fields = fields


class PlanCheckoutSerializer(serializers.Serializer):
    plan = serializers.SlugRelatedField(
        slug_field="key", queryset=Plan.objects.filter(is_active=True, is_public=True)
    )
    period = serializers.ChoiceField(choices=PlanPayment.Period.choices)
    gateway = serializers.ChoiceField(choices=PaymentGateway.Code.choices)


class PlanCheckoutResultSerializer(serializers.Serializer):
    payment = PlanPaymentSerializer()
    checkout = serializers.DictField()


class PlanConfirmSerializer(serializers.Serializer):
    payment = serializers.UUIDField()
    result = serializers.DictField(
        required=False, default=dict, help_text="What the payment window returned"
    )
