import datetime as dt
from typing import Any

from django.db.models import F, Q, QuerySet
from django.utils import timezone
from drf_spectacular.utils import OpenApiParameter, extend_schema, extend_schema_view
from rest_framework import mixins, status
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.request import Request
from rest_framework.response import Response

from apps.billing import services
from apps.billing.models import Invoice, Payment
from apps.billing.serializers import (
    ChargeSerializer,
    GenerateInvoicesSerializer,
    GenerateResultSerializer,
    InvoiceSerializer,
    PaymentSerializer,
    VoidSerializer,
)
from apps.tenants.places import PLACE_RELATED
from core.access import allowed_property_ids
from core.params import choice_param, month_param, uuid_param
from core.views import OrgScopedViewSet

_INVOICE_RELATED = ("stay__tenant", *(f"stay__{p}" for p in PLACE_RELATED))


@extend_schema_view(
    list=extend_schema(
        parameters=[
            OpenApiParameter("period", str, required=False, description="YYYY-MM"),
            OpenApiParameter("status", str, required=False, enum=Invoice.Status.values),
            OpenApiParameter("property", str, required=False),
            OpenApiParameter("tenant", str, required=False),
            OpenApiParameter("stay", str, required=False),
            OpenApiParameter("outstanding", bool, required=False),
            OpenApiParameter("overdue", bool, required=False),
        ]
    )
)
class InvoiceViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, OrgScopedViewSet):
    serializer_class = InvoiceSerializer
    queryset = Invoice.objects.select_related(*_INVOICE_RELATED).prefetch_related(
        "lines", "payments"
    )
    http_method_names = ["get", "post", "head", "options"]
    permission_map = {
        "list": "rent.view",
        "retrieve": "rent.view",
        "generate": "rent.adjust",
        "charges": "rent.adjust",
        "void": "rent.adjust",
    }

    def get_serializer_context(self) -> dict[str, Any]:
        return {**super().get_serializer_context(), "today": timezone.localdate()}

    def get_queryset(self) -> QuerySet[Any]:
        queryset = super().get_queryset()
        request = self.request
        period = month_param(request)
        inv_status = choice_param(request, "status", Invoice.Status.values)
        prop = uuid_param(request, "property")
        tenant = uuid_param(request, "tenant")
        stay = uuid_param(request, "stay")
        if period:
            queryset = queryset.filter(period=period)
        if inv_status:
            queryset = queryset.filter(status=inv_status)
        if prop:
            queryset = queryset.filter(stay__property_id=prop)
        if tenant:
            queryset = queryset.filter(stay__tenant_id=tenant)
        if stay:
            queryset = queryset.filter(stay_id=stay)
        outstanding = Q(paid__lt=F("total")) & ~Q(status=Invoice.Status.VOID)
        if request.query_params.get("outstanding") == "true":
            queryset = queryset.filter(outstanding)
        if request.query_params.get("overdue") == "true":
            queryset = queryset.filter(outstanding, due_date__lt=timezone.localdate())
        return queryset

    def _respond(self, invoice: Invoice) -> Response:
        fresh = self.get_queryset().get(pk=invoice.pk)
        return Response(self.get_serializer(fresh).data)

    @extend_schema(request=GenerateInvoicesSerializer, responses={201: GenerateResultSerializer})
    @action(detail=False, methods=["post"])
    def generate(self, request: Request) -> Response:
        """Create rent invoices for every stay in the month that has none yet."""
        payload = GenerateInvoicesSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        period = dt.datetime.strptime(payload.validated_data["period"], "%Y-%m").date()
        prop = payload.validated_data.get("property")
        created = services.generate_invoices(
            organization=request.organization,  # type: ignore[attr-defined]
            actor=request.user,  # type: ignore[arg-type]
            period=period,
            property_id=str(prop) if prop else None,
            property_ids=allowed_property_ids(request.membership),  # type: ignore[attr-defined]
        )
        return Response(
            {"created": len(created), "invoice_ids": [str(i.pk) for i in created]},
            status=status.HTTP_201_CREATED,
        )

    @extend_schema(request=ChargeSerializer, responses=InvoiceSerializer)
    @action(detail=True, methods=["post"])
    def charges(self, request: Request, pk: str | None = None) -> Response:
        """Add an extra charge (electricity, food, late fee, other)."""
        invoice = self.get_object()
        payload = ChargeSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        services.add_charge(
            actor=request.user,  # type: ignore[arg-type]
            invoice=invoice,
            **payload.validated_data,
        )
        return self._respond(invoice)

    @extend_schema(request=VoidSerializer, responses=InvoiceSerializer)
    @action(detail=True, methods=["post"])
    def void(self, request: Request, pk: str | None = None) -> Response:
        invoice = self.get_object()
        payload = VoidSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        services.void_invoice(
            actor=request.user,  # type: ignore[arg-type]
            invoice=invoice,
            reason=payload.validated_data["reason"],
        )
        return self._respond(invoice)


@extend_schema_view(
    list=extend_schema(
        parameters=[
            OpenApiParameter("invoice", str, required=False),
            OpenApiParameter("tenant", str, required=False),
            OpenApiParameter("received_from", dt.date, required=False),
            OpenApiParameter("received_to", dt.date, required=False),
        ]
    )
)
class PaymentViewSet(
    mixins.ListModelMixin, mixins.RetrieveModelMixin, mixins.CreateModelMixin, OrgScopedViewSet
):
    serializer_class = PaymentSerializer
    queryset = Payment.objects.select_related(
        "organization",
        "created_by",
        "invoice__stay__tenant",
        *(f"invoice__stay__{p}" for p in PLACE_RELATED),
    )
    http_method_names = ["get", "post", "head", "options"]
    permission_map = {"list": "rent.view", "retrieve": "rent.view", "create": "rent.collect"}

    def get_queryset(self) -> QuerySet[Any]:
        queryset = super().get_queryset()
        invoice = uuid_param(self.request, "invoice")
        tenant = uuid_param(self.request, "tenant")
        if invoice:
            queryset = queryset.filter(invoice_id=invoice)
        if tenant:
            queryset = queryset.filter(invoice__stay__tenant_id=tenant)
        params = self.request.query_params
        for name, lookup in (("received_from", "gte"), ("received_to", "lte")):
            if params.get(name):
                try:
                    value = dt.date.fromisoformat(params[name])
                except ValueError:
                    raise ValidationError({name: "Use the format YYYY-MM-DD."}) from None
                queryset = queryset.filter(**{f"received_on__{lookup}": value})
        return queryset

    @extend_schema(
        parameters=[
            OpenApiParameter(
                "Idempotency-Key",
                str,
                OpenApiParameter.HEADER,
                required=False,
                description="Send the same key on a retry so the payment is recorded once.",
            )
        ],
        responses={201: PaymentSerializer, 200: PaymentSerializer},
    )
    def create(self, request: Request, *args: Any, **kwargs: Any) -> Response:
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        key = (request.headers.get("Idempotency-Key") or "").strip()[:80] or None
        payment, created = services.record_payment(
            actor=request.user,  # type: ignore[arg-type]
            invoice=data["invoice"],
            amount=data["amount"],
            mode=data["mode"],
            received_on=data["received_on"],
            reference=data.get("reference", ""),
            idempotency_key=key,
        )
        fresh = self.get_queryset().get(pk=payment.pk)
        return Response(
            self.get_serializer(fresh).data,
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )
