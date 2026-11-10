from typing import Any

from django.db.models import Prefetch, Q, QuerySet
from django.http import FileResponse
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, extend_schema, extend_schema_view
from rest_framework import mixins, status
from rest_framework.decorators import action
from rest_framework.exceptions import NotFound
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.request import Request
from rest_framework.response import Response

from apps.properties.models import Property
from apps.tenants import services
from apps.tenants.models import OPEN_STAY_STATUSES, Stay, Tenant
from apps.tenants.places import PLACE_RELATED
from apps.tenants.serializers import (
    AgreementUploadSerializer,
    CheckInSerializer,
    CheckoutSerializer,
    DepositCollectSerializer,
    FreePlaceSerializer,
    StayNoticeSerializer,
    StaySerializer,
    StayTermsSerializer,
    TenantSerializer,
    TenantSummaryCountsSerializer,
    TransferSerializer,
)
from core import audit
from core.access import visible
from core.pagination import NumberedPagination
from core.params import choice_param, uuid_param
from core.views import OrgScopedModelViewSet, OrgScopedViewSet

_STAY_RELATED = ("tenant", *PLACE_RELATED)

TENANT_STATUSES = ["active", "notice", "past", "never"]
TENANT_ORDERING = {
    "name": ("full_name", "id"),
    "-name": ("-full_name", "id"),
    "newest": ("-created_at", "id"),
    "oldest": ("created_at", "id"),
}


def _filter_status(queryset: QuerySet[Any], value: str | None) -> QuerySet[Any]:
    """active = staying · notice = leaving soon · past = moved out · never = not checked in."""
    open_q = Q(stays__status__in=OPEN_STAY_STATUSES)
    if value == "active":
        return queryset.filter(stays__status="active").distinct()
    if value == "notice":
        return queryset.filter(stays__status="notice").distinct()
    if value == "past":
        return queryset.filter(stays__isnull=False).exclude(open_q).distinct()
    if value == "never":
        return queryset.filter(stays__isnull=True)
    return queryset


@extend_schema_view(
    list=extend_schema(
        parameters=[
            OpenApiParameter("q", str, required=False, description="Name, phone or email"),
            OpenApiParameter("residency", str, required=False, enum=["current", "past"]),
            OpenApiParameter("status", str, required=False, enum=TENANT_STATUSES),
            OpenApiParameter(
                "property", str, required=False, description="Staying now in this property"
            ),
            OpenApiParameter("ordering", str, required=False, enum=list(TENANT_ORDERING)),
        ]
    )
)
class TenantViewSet(OrgScopedModelViewSet):
    serializer_class = TenantSerializer
    pagination_class = NumberedPagination
    queryset = Tenant.objects.prefetch_related(
        Prefetch("stays", queryset=Stay.objects.select_related(*PLACE_RELATED))
    )

    view_permission = "tenants.view"
    manage_permission = "tenants.manage"
    permission_map = {"summary": "tenants.view"}

    def _filtered(self, *, with_status: bool) -> QuerySet[Any]:
        queryset = super().get_queryset()
        q = self.request.query_params.get("q", "").strip()
        if q:
            queryset = queryset.filter(
                Q(full_name__icontains=q) | Q(phone__contains=q) | Q(email__icontains=q)
            )
        residency = choice_param(self.request, "residency", ["current", "past"])
        open_q = Q(stays__status__in=OPEN_STAY_STATUSES)
        if residency == "current":
            queryset = queryset.filter(open_q).distinct()
        elif residency == "past":
            queryset = queryset.exclude(open_q)
        prop = uuid_param(self.request, "property")
        if prop:
            queryset = queryset.filter(
                stays__status__in=OPEN_STAY_STATUSES, stays__property_id=prop
            ).distinct()
        if with_status:
            queryset = _filter_status(
                queryset, choice_param(self.request, "status", TENANT_STATUSES)
            )
        return queryset

    def get_queryset(self) -> QuerySet[Any]:
        queryset = self._filtered(with_status=self.action == "list")
        ordering = choice_param(self.request, "ordering", list(TENANT_ORDERING)) or "name"
        return queryset.order_by(*TENANT_ORDERING[ordering])

    @extend_schema(responses=TenantSummaryCountsSerializer)
    @action(detail=False, methods=["get"])
    def summary(self, request: Request) -> Response:
        """How many tenants are in each status (for the tabs), with the same filters."""
        base = self._filtered(with_status=False)
        counts = {key: _filter_status(base, key).count() for key in TENANT_STATUSES}
        counts["all"] = base.count()
        return Response(TenantSummaryCountsSerializer(counts).data)


@extend_schema_view(
    list=extend_schema(
        parameters=[
            OpenApiParameter("status", str, required=False, enum=Stay.Status.values),
            OpenApiParameter("property", str, required=False),
            OpenApiParameter("tenant", str, required=False),
        ]
    )
)
class StayViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, OrgScopedViewSet):
    serializer_class = StaySerializer
    queryset = Stay.objects.select_related(*_STAY_RELATED).prefetch_related("deposit_transactions")
    http_method_names = ["get", "post", "head", "options"]
    permission_map = {
        "list": "tenants.view",
        "retrieve": "tenants.view",
        "create": "tenants.manage",
        "deposit": "rent.adjust",
        "notice": "tenants.manage",
        "withdraw_notice": "tenants.manage",
        "transfer": "tenants.manage",
        "checkout": "tenants.manage",
        "terms": "tenants.manage",
        "agreement": "tenants.id_documents",
        "free_places": "tenants.manage",
    }

    def get_queryset(self) -> QuerySet[Any]:
        queryset = super().get_queryset()
        stay_status = choice_param(self.request, "status", Stay.Status.values)
        prop = uuid_param(self.request, "property")
        tenant = uuid_param(self.request, "tenant")
        if stay_status:
            queryset = queryset.filter(status=stay_status)
        if prop:
            queryset = queryset.filter(property_id=prop)
        if tenant:
            queryset = queryset.filter(tenant_id=tenant)
        return queryset

    @extend_schema(
        parameters=[OpenApiParameter("property", str, required=True)],
        responses=FreePlaceSerializer(many=True),
    )
    @action(detail=False, methods=["get"], url_path="free-places")
    def free_places(self, request: Request) -> Response:
        """Beds, whole rooms and whole flats in a property that a tenant can move into now."""
        prop_id = uuid_param(request, "property")
        prop = visible(Property, request).filter(pk=prop_id).first() if prop_id else None
        if prop is None:
            raise NotFound("Property not found.")
        rows = [vars(p) for p in services.free_places(prop)]
        return Response(FreePlaceSerializer(rows, many=True).data)

    def _respond(self, stay: Stay, code: int = status.HTTP_200_OK) -> Response:
        fresh = self.get_queryset().get(pk=stay.pk)
        return Response(StaySerializer(fresh).data, status=code)

    @extend_schema(request=CheckInSerializer, responses={201: StaySerializer})
    def create(self, request: Request) -> Response:
        """Check a tenant into a bed, a whole room or a whole flat (send exactly one)."""
        data = self._validated(CheckInSerializer, request)
        stay = services.check_in(
            actor=request.user,  # type: ignore[arg-type]
            tenant=data["tenant"],
            place=data["place"],
            check_in_date=data["check_in"],
            monthly_rent=data.get("monthly_rent"),
            deposit_amount=data["deposit_amount"],
            deposit_collected=data["deposit_collected"],
            notice_period_days=data["notice_period_days"],
            lock_in_months=data["lock_in_months"],
            agreement_end=data.get("agreement_end"),
        )
        return self._respond(stay, status.HTTP_201_CREATED)

    @extend_schema(request=StayTermsSerializer, responses=StaySerializer)
    @action(detail=True, methods=["post"])
    def terms(self, request: Request, pk: str | None = None) -> Response:
        """Update the agreement terms: notice period, lock-in, agreement end date."""
        stay = self.get_object()
        payload = StayTermsSerializer(stay, data=request.data, partial=True)
        payload.is_valid(raise_exception=True)
        payload.save()
        return self._respond(stay)

    @extend_schema(
        methods=["POST"],
        request={"multipart/form-data": AgreementUploadSerializer},
        responses=StaySerializer,
    )
    @extend_schema(
        methods=["GET"], responses={(200, "application/octet-stream"): OpenApiTypes.BINARY}
    )
    @action(detail=True, methods=["get", "post"], parser_classes=[MultiPartParser, FormParser])
    def agreement(self, request: Request, pk: str | None = None) -> Any:
        """Upload (PDF/JPG/PNG, 5 MB) or download the signed agreement. Never public."""
        stay = self.get_object()
        if request.method == "GET":
            if not stay.agreement_file:
                raise NotFound("No agreement uploaded yet.")
            name = f"agreement-{stay.tenant.full_name.replace(' ', '-').lower()}"
            ext = stay.agreement_file.name.rsplit(".", 1)[-1]
            return FileResponse(
                stay.agreement_file.open("rb"), as_attachment=True, filename=f"{name}.{ext}"
            )
        payload = AgreementUploadSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        if stay.agreement_file:
            stay.agreement_file.delete(save=False)
        stay.agreement_file = payload.validated_data["file"]
        stay.save(update_fields=["agreement_file", "updated_at"])
        audit.record(
            organization=stay.organization,
            actor=request.user,  # type: ignore[arg-type]
            action="stay.agreement_upload",
            obj=stay,
        )
        return self._respond(stay)

    @extend_schema(request=DepositCollectSerializer, responses=StaySerializer)
    @action(detail=True, methods=["post"])
    def deposit(self, request: Request, pk: str | None = None) -> Response:
        stay = self.get_object()
        data = self._validated(DepositCollectSerializer, request)
        services.collect_deposit(
            actor=request.user,  # type: ignore[arg-type]
            stay=stay,
            amount=data["amount"],
            date=data["date"],
            note=data.get("note", ""),
        )
        return self._respond(stay)

    @extend_schema(request=StayNoticeSerializer, responses=StaySerializer)
    @action(detail=True, methods=["post"])
    def notice(self, request: Request, pk: str | None = None) -> Response:
        stay = self.get_object()
        data = self._validated(StayNoticeSerializer, request)
        services.give_notice(
            actor=request.user,  # type: ignore[arg-type]
            stay=stay,
            notice_date=data["notice_date"],
            expected_checkout=data["expected_checkout"],
        )
        return self._respond(stay)

    @extend_schema(request=None, responses=StaySerializer)
    @action(detail=True, methods=["post"], url_path="withdraw-notice")
    def withdraw_notice(self, request: Request, pk: str | None = None) -> Response:
        stay = self.get_object()
        services.withdraw_notice(actor=request.user, stay=stay)  # type: ignore[arg-type]
        return self._respond(stay)

    @extend_schema(request=TransferSerializer, responses=StaySerializer)
    @action(detail=True, methods=["post"])
    def transfer(self, request: Request, pk: str | None = None) -> Response:
        stay = self.get_object()
        data = self._validated(TransferSerializer, request)
        services.transfer(
            actor=request.user,  # type: ignore[arg-type]
            stay=stay,
            new_place=data["place"],
            monthly_rent=data.get("monthly_rent"),
        )
        return self._respond(stay)

    @extend_schema(request=CheckoutSerializer, responses=StaySerializer)
    @action(detail=True, methods=["post"])
    def checkout(self, request: Request, pk: str | None = None) -> Response:
        stay = self.get_object()
        data = self._validated(CheckoutSerializer, request)
        services.checkout(
            actor=request.user,  # type: ignore[arg-type]
            stay=stay,
            check_out_date=data["check_out"],
            deductions=[services.Deduction(**d) for d in data["deductions"]],
        )
        return self._respond(stay)

    def _validated(self, serializer_class: Any, request: Request) -> dict[str, Any]:
        serializer = serializer_class(data=request.data, context=self.get_serializer_context())
        serializer.is_valid(raise_exception=True)
        return dict(serializer.validated_data)
