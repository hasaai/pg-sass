from __future__ import annotations

from typing import Any

from django.db.models import Count, ProtectedError, QuerySet
from django.shortcuts import get_object_or_404
from drf_spectacular.utils import OpenApiParameter, extend_schema, extend_schema_view
from rest_framework import mixins, status, viewsets
from rest_framework.exceptions import NotFound, ValidationError
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.organizations.models import Organization
from apps.platform.permissions import IsPlatformAdmin
from apps.subscriptions import entitlements, gateways, services
from apps.subscriptions.models import (
    PaymentGateway,
    Plan,
    PlanPayment,
    Subscription,
    SubscriptionEvent,
)
from apps.subscriptions.serializers import (
    AssignPlanSerializer,
    CheckoutGatewaySerializer,
    MyPlanSerializer,
    PaymentGatewaySerializer,
    PlanCatalogSerializer,
    PlanCheckoutResultSerializer,
    PlanCheckoutSerializer,
    PlanConfirmSerializer,
    PlanPaymentSerializer,
    PlanSerializer,
    PlatformSubscriptionSerializer,
    PublicPlanSerializer,
)
from core.pagination import NumberedPagination
from core.params import choice_param, uuid_param
from core.views import OrgScopedAPIView

PLATFORM = [IsAuthenticated, IsPlatformAdmin]

# ---------------------------------------------------------------- owner side


class MyPlanView(OrgScopedAPIView):
    """The business's plan, what it has used and what is switched on."""

    permission_map = {
        "GET": "dashboard.view",
    }

    @extend_schema(responses=MyPlanSerializer)
    def get(self, request: Request) -> Response:
        return Response(MyPlanSerializer(entitlements.summary(request.organization)).data)  # type: ignore[attr-defined]


class PlanChoicesView(OrgScopedAPIView):
    permission_map = {
        "GET": "dashboard.view",
    }

    @extend_schema(responses=PublicPlanSerializer(many=True))
    def get(self, request: Request) -> Response:
        plans = Plan.objects.filter(is_active=True, is_public=True)
        return Response(PublicPlanSerializer(plans, many=True).data)


def _usable_gateways() -> list[PaymentGateway]:
    return [
        g
        for g in PaymentGateway.objects.filter(is_enabled=True)
        if gateways.get(g.code).configured()
    ]


class CheckoutGatewaysView(OrgScopedAPIView):
    permission_map = {
        "GET": "dashboard.view",
    }

    @extend_schema(responses=CheckoutGatewaySerializer(many=True))
    def get(self, request: Request) -> Response:
        rows = [
            {
                "code": g.code,
                "name": g.get_code_display(),
                "test_mode": gateways.get(g.code).test_mode(),
                "is_default": g.is_default,
            }
            for g in _usable_gateways()
        ]
        return Response(CheckoutGatewaySerializer(rows, many=True).data)


class CheckoutView(OrgScopedAPIView):
    """Start paying for a plan: creates the gateway order the browser then opens."""

    permission_map = {
        "POST": "plan.billing",
    }

    @extend_schema(request=PlanCheckoutSerializer, responses={201: PlanCheckoutResultSerializer})
    def post(self, request: Request) -> Response:
        payload = PlanCheckoutSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        plan: Plan = payload.validated_data["plan"]
        period = payload.validated_data["period"]
        code = payload.validated_data["gateway"]
        amount = services.price_for(plan, period)
        if amount <= 0:
            raise ValidationError({"plan": "This plan is free; nothing to pay."})
        if code not in {g.code for g in _usable_gateways()}:
            raise ValidationError({"gateway": "This payment method is not available right now."})
        org: Organization = request.organization  # type: ignore[attr-defined]
        gateway = gateways.get(code)
        payment = PlanPayment(
            organization=org,
            created_by=request.user,  # type: ignore[misc]
            plan=plan,
            period=period,
            amount=amount,
            gateway=code,
            test_mode=gateway.test_mode(),
        )
        user = request.user
        order_id, checkout = gateway.create_order(
            payment,
            {
                "name": getattr(user, "full_name", ""),
                "email": getattr(user, "email", ""),
                "phone": getattr(user, "phone", None) or org.contact_phone,
            },
        )
        payment.gateway_order_id = order_id
        payment.save()
        return Response(
            PlanCheckoutResultSerializer({"payment": payment, "checkout": checkout}).data,
            status=status.HTTP_201_CREATED,
        )


class ConfirmView(OrgScopedAPIView):
    """After the payment window closes: check the payment with the gateway, then apply it."""

    permission_map = {
        "POST": "plan.billing",
    }

    @extend_schema(request=PlanConfirmSerializer, responses=PlanPaymentSerializer)
    def post(self, request: Request) -> Response:
        payload = PlanConfirmSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        payment = get_object_or_404(
            PlanPayment,
            pk=payload.validated_data["payment"],
            organization=request.organization,  # type: ignore[attr-defined]
        )
        if payment.status != PlanPayment.Status.PAID:
            gateway_payment_id = gateways.get(payment.gateway).confirm(
                payment, payload.validated_data["result"]
            )
            payment = services.apply_payment(payment, gateway_payment_id)
        return Response(PlanPaymentSerializer(payment).data)


class MyPaymentsView(OrgScopedAPIView):
    permission_map = {
        "GET": "plan.view",
    }

    @extend_schema(responses=PlanPaymentSerializer(many=True))
    def get(self, request: Request) -> Response:
        org = request.organization  # type: ignore[attr-defined]
        rows = PlanPayment.objects.filter(organization=org).select_related("plan", "organization")
        rows = rows[:50]
        return Response(PlanPaymentSerializer(rows, many=True).data)


class WebhookView(APIView):
    """Gateways call this after a payment. The signature proves it came from the gateway."""

    authentication_classes: list[Any] = []
    permission_classes = [AllowAny]

    @extend_schema(request=None, responses={200: None})
    def post(self, request: Request, code: str) -> Response:
        gateway = gateways.GATEWAYS.get(code)
        if gateway is None or not gateway.configured():
            raise NotFound()
        headers = {k.lower(): v for k, v in request.headers.items()}
        result = gateway.webhook(request.body, headers)
        if result is not None:
            order_id, payment_id = result
            payment = PlanPayment.objects.filter(gateway=code, gateway_order_id=order_id).first()
            if payment is not None:
                services.apply_payment(payment, payment_id)
        return Response({"ok": True})


# ---------------------------------------------------------------- platform admin


class PlanCatalogView(APIView):
    permission_classes = PLATFORM
    platform_permission_map = {"GET": ("p.plans.manage", "p.subscriptions.assign")}

    @extend_schema(responses=PlanCatalogSerializer)
    def get(self, request: Request) -> Response:
        return Response(PlanCatalogSerializer(PlanCatalogSerializer.data_now()).data)


class PlatformPlanViewSet(
    mixins.ListModelMixin,
    mixins.CreateModelMixin,
    mixins.RetrieveModelMixin,
    mixins.UpdateModelMixin,
    mixins.DestroyModelMixin,
    viewsets.GenericViewSet,
):
    permission_classes = PLATFORM
    platform_permission_map = {
        "list": ("p.plans.manage", "p.subscriptions.assign"),
        "retrieve": ("p.plans.manage", "p.subscriptions.assign"),
        "create": "p.plans.manage",
        "partial_update": "p.plans.manage",
        "destroy": "p.plans.manage",
    }
    serializer_class = PlanSerializer
    pagination_class = None  # a handful of plans
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    def get_queryset(self) -> QuerySet[Plan]:
        return Plan.objects.annotate(businesses_count=Count("subscriptions")).order_by(
            "position", "price_month"
        )

    def perform_destroy(self, instance: Plan) -> None:
        try:
            instance.delete()
        except ProtectedError as err:
            raise ValidationError(
                {"plan": "Businesses use this plan. Hide it (switch off “Active”) instead."}
            ) from err


class PlatformSubscriptionView(APIView):
    permission_classes = PLATFORM
    platform_permission_map = {"GET": "p.businesses.view", "PUT": "p.subscriptions.assign"}

    def _payload(self, org: Organization) -> dict[str, Any]:
        sub = Subscription.objects.select_related("plan").filter(organization=org).first()
        history = SubscriptionEvent.objects.filter(organization=org).select_related(
            "from_plan", "to_plan", "created_by"
        )[:50]
        return {
            "summary": entitlements.summary(org),
            "plan": sub.plan.key if sub else None,
            "ends_on": sub.ends_on if sub else None,
            "limit_overrides": (sub.limit_overrides if sub else {}) or {},
            "note": sub.note if sub else "",
            "history": list(history),
        }

    @extend_schema(responses=PlatformSubscriptionSerializer)
    def get(self, request: Request, pk: str) -> Response:
        org = get_object_or_404(Organization, pk=pk)
        return Response(PlatformSubscriptionSerializer(self._payload(org)).data)

    @extend_schema(request=AssignPlanSerializer, responses=PlatformSubscriptionSerializer)
    def put(self, request: Request, pk: str) -> Response:
        org = get_object_or_404(Organization, pk=pk)
        payload = AssignPlanSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        data = payload.validated_data
        services.assign_plan(
            org=org,
            plan=data["plan"],
            actor=request.user,  # type: ignore[arg-type]
            ends_on=data.get("ends_on"),
            limit_overrides=data.get("limit_overrides") or {},
            note=data.get("note", ""),
        )
        return Response(PlatformSubscriptionSerializer(self._payload(org)).data)


@extend_schema_view(
    list=extend_schema(
        parameters=[
            OpenApiParameter("status", str, required=False, enum=PlanPayment.Status.values),
            OpenApiParameter("organization", str, required=False),
        ]
    )
)
class PlatformPaymentViewSet(mixins.ListModelMixin, viewsets.GenericViewSet):
    permission_classes = PLATFORM
    platform_permission_map = {"list": "p.payments.view"}
    serializer_class = PlanPaymentSerializer
    pagination_class = NumberedPagination

    def get_queryset(self) -> QuerySet[PlanPayment]:
        queryset = PlanPayment.objects.select_related("plan", "organization")
        state = choice_param(self.request, "status", PlanPayment.Status.values)
        org = uuid_param(self.request, "organization")
        if state:
            queryset = queryset.filter(status=state)
        if org:
            queryset = queryset.filter(organization_id=org)
        return queryset.order_by("-created_at")


class PlatformGatewayViewSet(
    mixins.ListModelMixin, mixins.UpdateModelMixin, viewsets.GenericViewSet
):
    permission_classes = PLATFORM
    platform_permission_map = {"*": "p.gateways.manage"}
    serializer_class = PaymentGatewaySerializer
    pagination_class = None
    lookup_field = "code"
    http_method_names = ["get", "patch", "head", "options"]
    queryset = PaymentGateway.objects.all()

    def perform_update(self, serializer: Any) -> None:
        gateway = gateways.get(serializer.instance.code)
        if serializer.validated_data.get("is_enabled") and not gateway.configured():
            raise ValidationError(
                {"is_enabled": gateway.unavailable_reason or "Set this gateway's keys first."}
            )
        saved = serializer.save()
        if saved.is_default:
            PaymentGateway.objects.exclude(pk=saved.pk).update(is_default=False)
