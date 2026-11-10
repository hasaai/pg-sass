"""Platform admin API (/api/v1/platform/…): the PG Manager team's view across all businesses."""

from __future__ import annotations

import datetime as dt
from typing import Any, cast

from django.db.models import Count, IntegerField, Max, OuterRef, Q, QuerySet, Subquery
from django.db.models.functions import Coalesce
from django.http import FileResponse
from django.utils import timezone
from drf_spectacular.utils import OpenApiParameter, extend_schema, extend_schema_view
from rest_framework import mixins, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.models import User
from apps.amenities.models import Amenity
from apps.organizations.models import Membership, Organization
from apps.organizations.serializers import AccessChoicesSerializer
from apps.platform import services
from apps.platform import staff as staff_rules
from apps.platform.access import PLATFORM_PERMISSIONS, PLATFORM_ROLE_HELP, platform_role_permissions
from apps.platform.models import PlatformEvent, PlatformRole, PlatformStaff
from apps.platform.permissions import IsPlatformAdmin
from apps.platform.serializers import (
    ActivitySerializer,
    FeaturesUpdateSerializer,
    OverviewSerializer,
    PlatformAmenitySerializer,
    PlatformOrganizationSerializer,
    PlatformPropertyDetailSerializer,
    PlatformPropertySerializer,
    PlatformUserSerializer,
    StaffAccessSerializer,
    StaffCreateSerializer,
    StaffEventSerializer,
    StaffSerializer,
    SuspendSerializer,
    VerificationDecisionSerializer,
)
from apps.properties import services as property_services
from apps.properties.models import PROOF_KINDS, Bed, Property, PropertyDocument, VerificationEvent
from apps.properties.views import document_response
from apps.tenants.models import OPEN_STAY_STATUSES, Stay
from core.models import AuditLog
from core.pagination import NumberedPagination
from core.params import choice_param

PERMISSIONS = [IsAuthenticated, IsPlatformAdmin]


def _actor(request: Request) -> User:
    return cast(User, request.user)


def _count(model: Any, path: str, **filters: Any) -> Coalesce:
    sub = (
        model.objects.filter(**{path: OuterRef("pk")}, **filters)
        .order_by()
        .values(path)
        .annotate(n=Count("pk"))
        .values("n")
    )
    return Coalesce(Subquery(sub, output_field=IntegerField()), 0)


class OverviewView(APIView):
    permission_classes = PERMISSIONS
    platform_permission_map = {"GET": "p.overview.view"}

    @extend_schema(responses=OverviewSerializer)
    def get(self, request: Request) -> Response:
        soon = timezone.localdate() + dt.timedelta(days=property_services.EXPIRY_WARNING_DAYS)
        live_beds = Bed.objects.filter(archived_at__isnull=True)
        return Response(
            {
                "businesses": Organization.objects.count(),
                "businesses_suspended": Organization.objects.filter(
                    status=Organization.Status.SUSPENDED
                ).count(),
                "properties": Property.objects.exclude(status=Property.Status.ARCHIVED).count(),
                "properties_open": Property.objects.filter(status=Property.Status.ACTIVE).count(),
                "awaiting_verification": Property.objects.filter(
                    verification_status=Property.Verification.SUBMITTED
                ).count(),
                "verified": Property.objects.filter(
                    verification_status=Property.Verification.VERIFIED
                ).count(),
                "beds": live_beds.count(),
                "beds_occupied": live_beds.filter(status=Bed.Status.OCCUPIED).count(),
                "users": User.objects.filter(is_active=True).count(),
                "documents_expiring": PropertyDocument.objects.filter(
                    expires_on__isnull=False, expires_on__lte=soon
                ).count(),
            }
        )


@extend_schema_view(
    list=extend_schema(
        parameters=[
            OpenApiParameter("q", str, required=False),
            OpenApiParameter("status", str, required=False, enum=Organization.Status.values),
        ]
    )
)
class OrganizationViewSet(
    mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet
):
    permission_classes = PERMISSIONS
    serializer_class = PlatformOrganizationSerializer
    platform_permission_map = {
        "list": "p.businesses.view",
        "retrieve": "p.businesses.view",
        "features": "p.businesses.features",
        "suspend": "p.businesses.suspend",
        "reactivate": "p.businesses.suspend",
    }
    pagination_class = NumberedPagination

    def get_queryset(self) -> QuerySet[Organization]:
        queryset = Organization.objects.annotate(
            properties_count=_count(
                Property, "organization", status__in=["draft", "active", "inactive"]
            ),
            members_count=_count(Membership, "organization", is_active=True),
            beds_total=_count(Bed, "organization", archived_at__isnull=True),
            tenants_count=_count(Stay, "organization", status__in=OPEN_STAY_STATUSES),
            awaiting_verification=_count(
                Property, "organization", verification_status=Property.Verification.SUBMITTED
            ),
        )
        q = self.request.query_params.get("q", "").strip()
        if q:
            by_member = Membership.objects.filter(user__email__icontains=q).values(
                "organization_id"
            )
            queryset = queryset.filter(
                Q(name__icontains=q) | Q(slug__icontains=q) | Q(pk__in=by_member)
            )
        status = choice_param(self.request, "status", Organization.Status.values)
        if status:
            queryset = queryset.filter(status=status)
        return queryset.order_by("name")

    def _detail(self, org: Organization) -> Response:
        return Response(self.get_serializer(self.get_queryset().get(pk=org.pk)).data)

    @extend_schema(request=FeaturesUpdateSerializer, responses=PlatformOrganizationSerializer)
    @action(detail=True, methods=["put"])
    def features(self, request: Request, pk: str | None = None) -> Response:
        """Switch modules on or off for this business (send the full list that is off)."""
        payload = FeaturesUpdateSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        org = self.get_object()
        services.set_disabled_features(
            org=org, disabled=payload.validated_data["disabled_features"], actor=_actor(request)
        )
        return self._detail(org)

    @extend_schema(request=SuspendSerializer, responses=PlatformOrganizationSerializer)
    @action(detail=True, methods=["post"])
    def suspend(self, request: Request, pk: str | None = None) -> Response:
        """Block every member of this business from signing in to it; listings are hidden."""
        payload = SuspendSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        org = self.get_object()
        services.suspend(org=org, reason=payload.validated_data["reason"], actor=_actor(request))
        return self._detail(org)

    @extend_schema(request=None, responses=PlatformOrganizationSerializer)
    @action(detail=True, methods=["post"])
    def reactivate(self, request: Request, pk: str | None = None) -> Response:
        org = self.get_object()
        services.reactivate(org=org, actor=_actor(request))
        return self._detail(org)


@extend_schema_view(
    list=extend_schema(
        parameters=[
            OpenApiParameter("q", str, required=False),
            OpenApiParameter(
                "verification_status",
                str,
                required=False,
                enum=Property.Verification.values,
            ),
            OpenApiParameter("organization", str, required=False),
        ]
    )
)
class PropertyViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    """Every property of every business, for verification and support."""

    permission_classes = PERMISSIONS
    platform_permission_map = {
        "list": ("p.businesses.view", "p.verification.review"),
        "retrieve": ("p.businesses.view", "p.verification.review"),
        "verification": "p.verification.review",
    }
    pagination_class = NumberedPagination

    def get_serializer_class(self) -> Any:
        return (
            PlatformPropertyDetailSerializer
            if self.action == "retrieve"
            else PlatformPropertySerializer
        )

    def get_queryset(self) -> QuerySet[Property]:
        submitted = (
            VerificationEvent.objects.filter(
                property=OuterRef("pk"), status=Property.Verification.SUBMITTED
            )
            .order_by()
            .values("property")
            .annotate(at=Max("created_at"))
            .values("at")
        )
        queryset = Property.objects.select_related("organization").annotate(
            documents_count=_count(PropertyDocument, "property"),
            proof_documents_count=_count(PropertyDocument, "property", kind__in=PROOF_KINDS),
            submitted_at=Subquery(submitted),
        )
        if self.action == "retrieve":
            queryset = queryset.prefetch_related(
                "documents__created_by", "verification_events__created_by"
            )
        params = self.request.query_params
        q = params.get("q", "").strip()
        if q:
            queryset = queryset.filter(
                Q(name__icontains=q) | Q(locality__icontains=q) | Q(organization__name__icontains=q)
            )
        verification = choice_param(
            self.request, "verification_status", Property.Verification.values
        )
        if verification:
            queryset = queryset.filter(verification_status=verification)
        if params.get("organization"):
            from core.params import uuid_param

            org = uuid_param(self.request, "organization")
            queryset = queryset.filter(organization_id=org)
        # The verification queue: oldest submission first.
        if verification == Property.Verification.SUBMITTED:
            return queryset.order_by("submitted_at", "name")
        return queryset.order_by("organization__name", "name")

    @extend_schema(
        request=VerificationDecisionSerializer, responses=PlatformPropertyDetailSerializer
    )
    @action(detail=True, methods=["post"])
    def verification(self, request: Request, pk: str | None = None) -> Response:
        """Accept, ask for changes, or reject. A note is required unless accepted."""
        payload = VerificationDecisionSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        prop = self.get_object()
        property_services.decide_verification(
            prop=prop,
            decision=payload.validated_data["decision"],
            note=payload.validated_data["note"],
            actor=_actor(request),
        )
        return Response(PlatformPropertyDetailSerializer(self.get_queryset().get(pk=prop.pk)).data)


class DocumentDownloadView(APIView):
    permission_classes = PERMISSIONS
    platform_permission_map = {"GET": "p.documents.download"}

    @extend_schema(responses={(200, "application/octet-stream"): bytes})
    def get(self, request: Request, pk: str) -> FileResponse:
        from django.shortcuts import get_object_or_404

        doc = get_object_or_404(PropertyDocument, pk=pk)
        property_services.log_document_download(doc=doc, actor=_actor(request), by_platform=True)
        return document_response(doc)


@extend_schema_view(list=extend_schema(parameters=[OpenApiParameter("q", str, required=False)]))
class UserViewSet(mixins.ListModelMixin, viewsets.GenericViewSet):
    permission_classes = PERMISSIONS
    serializer_class = PlatformUserSerializer
    platform_permission_map = {
        "list": "p.users.view",
        "deactivate": "p.users.deactivate",
        "reactivate": "p.users.deactivate",
    }
    pagination_class = NumberedPagination

    def get_queryset(self) -> QuerySet[User]:
        queryset = User.objects.prefetch_related("memberships__organization").order_by(
            "full_name", "id"
        )
        q = self.request.query_params.get("q", "").strip()
        if q:
            queryset = queryset.filter(
                Q(full_name__icontains=q) | Q(email__icontains=q) | Q(phone__icontains=q)
            )
        return queryset

    def _set_active(self, request: Request, active: bool) -> Response:
        from rest_framework.exceptions import ValidationError

        user = self.get_object()
        if user.pk == request.user.pk:
            raise ValidationError({"user": "You cannot switch off your own sign-in."})
        user.is_active = active
        user.save(update_fields=["is_active"])
        for membership in user.memberships.select_related("organization"):
            from core import audit

            audit.record(
                organization=membership.organization,
                actor=_actor(request),
                action="platform.user_activated" if active else "platform.user_deactivated",
                obj=user,
            )
        return Response(PlatformUserSerializer(user).data)

    @extend_schema(request=None, responses=PlatformUserSerializer)
    @action(detail=True, methods=["post"])
    def deactivate(self, request: Request, pk: str | None = None) -> Response:
        """Stop this person signing in (to every business)."""
        return self._set_active(request, False)

    @extend_schema(request=None, responses=PlatformUserSerializer)
    @action(detail=True, methods=["post"])
    def reactivate(self, request: Request, pk: str | None = None) -> Response:
        return self._set_active(request, True)


class AmenityViewSet(mixins.ListModelMixin, mixins.UpdateModelMixin, viewsets.GenericViewSet):
    """The global amenity catalog. Switching one off hides it from pickers; saved ones stay."""

    permission_classes = PERMISSIONS
    serializer_class = PlatformAmenitySerializer
    platform_permission_map = {"*": "p.catalog.manage"}
    queryset = Amenity.objects.select_related("category").order_by(
        "category__position", "position", "name"
    )
    lookup_field = "key"
    http_method_names = ["get", "patch", "options"]
    pagination_class = None


class ActivityView(APIView):
    """The latest 100 audit entries across businesses (money, roles, verification…)."""

    permission_classes = PERMISSIONS
    platform_permission_map = {"GET": "p.activity.view"}

    @extend_schema(
        parameters=[OpenApiParameter("organization", str, required=False)],
        responses=ActivitySerializer(many=True),
    )
    def get(self, request: Request) -> Response:
        from core.params import uuid_param

        entries = AuditLog.objects.select_related("organization", "created_by")
        org = uuid_param(request, "organization")
        if org:
            entries = entries.filter(organization_id=org)
        rows = [
            {
                "id": e.pk,
                "action": e.action,
                "organization_id": e.organization_id,
                "organization_name": e.organization.name,
                "actor": e.created_by.full_name if e.created_by else None,
                "object_type": e.object_type,
                "object_id": e.object_id,
                "data": e.data,
                "created_at": e.created_at,
            }
            for e in entries.order_by("-created_at")[:100]
        ]
        return Response(ActivitySerializer(rows, many=True).data)


class StaffViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    viewsets.GenericViewSet,
):
    """The PG Manager team: roles and ticks per person (Platform → Staff)."""

    permission_classes = PERMISSIONS
    platform_permission_map = {"*": "p.staff.manage"}
    serializer_class = StaffSerializer
    pagination_class = None  # a small team
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    def get_queryset(self) -> QuerySet[PlatformStaff]:
        return PlatformStaff.objects.select_related("user").order_by("user__full_name")

    @extend_schema(request=StaffCreateSerializer, responses={201: StaffSerializer})
    def create(self, request: Request) -> Response:
        payload = StaffCreateSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        staff = staff_rules.add_staff(actor=_actor(request), **payload.validated_data)
        return Response(StaffSerializer(staff).data, status=201)

    @extend_schema(request=StaffAccessSerializer, responses=StaffSerializer)
    def partial_update(self, request: Request, pk: str | None = None) -> Response:
        payload = StaffAccessSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        staff = staff_rules.set_access(
            staff=self.get_object(),
            actor=_actor(request),
            role=payload.validated_data.get("role"),
            permissions=payload.validated_data.get("permissions"),
        )
        return Response(StaffSerializer(staff).data)

    @extend_schema(responses={204: None})
    def destroy(self, request: Request, pk: str | None = None) -> Response:
        staff_rules.remove_staff(staff=self.get_object(), actor=_actor(request))
        return Response(status=204)

    @extend_schema(responses=AccessChoicesSerializer)
    @action(detail=False, methods=["get"], url_path="access-choices")
    def access_choices(self, request: Request) -> Response:
        roles = [
            {
                "value": value,
                "label": label,
                "help": PLATFORM_ROLE_HELP[value],
                "permissions": sorted(platform_role_permissions(value)),
            }
            for value, label in PlatformRole.choices
        ]
        permissions = [
            {"code": p.code, "area": p.area, "label": p.label} for p in PLATFORM_PERMISSIONS
        ]
        return Response(AccessChoicesSerializer({"roles": roles, "permissions": permissions}).data)

    @extend_schema(responses=StaffEventSerializer(many=True))
    @action(detail=False, methods=["get"])
    def history(self, request: Request) -> Response:
        """The last 50 changes to the team."""
        events = PlatformEvent.objects.select_related("actor", "target")[:50]
        return Response(StaffEventSerializer(events, many=True).data)
