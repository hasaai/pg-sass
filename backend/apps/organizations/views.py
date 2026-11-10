from typing import Any

from drf_spectacular.utils import extend_schema
from rest_framework import mixins, status
from rest_framework.decorators import action
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.request import Request
from rest_framework.response import Response

from apps.organizations import services
from apps.organizations.models import Membership, Role
from apps.organizations.serializers import (
    AccessChoicesSerializer,
    MemberAccessSerializer,
    MemberCreateSerializer,
    MembershipSerializer,
    OrganizationSerializer,
)
from apps.properties.serializers import LogoUploadSerializer
from core.access import PERMISSIONS, ROLE_HELP, role_permissions
from core.views import OrgScopedAPIView, OrgScopedViewSet


class CurrentOrganizationView(OrgScopedAPIView):
    permission_map = {
        "GET": "dashboard.view",
        "PATCH": "business.settings",
    }

    @extend_schema(responses=OrganizationSerializer)
    def get(self, request: Request) -> Response:
        return Response(OrganizationSerializer(request.organization).data)  # type: ignore[attr-defined]

    @extend_schema(request=OrganizationSerializer, responses=OrganizationSerializer)
    def patch(self, request: Request) -> Response:
        serializer = OrganizationSerializer(
            request.organization,  # type: ignore[attr-defined]
            data=request.data,
            partial=True,
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


class MembershipViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    OrgScopedViewSet,
):
    queryset = Membership.objects.select_related("user").prefetch_related("properties")
    serializer_class = MembershipSerializer
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    @extend_schema(request=MemberCreateSerializer, responses={201: MembershipSerializer})
    def create(self, request: Request, *args: Any, **kwargs: Any) -> Response:
        """Add a team member. New accounts get a temporary password to share in person."""
        payload = MemberCreateSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        data = dict(payload.validated_data)
        permissions = data.pop("permissions", None)
        property_ids = data.pop("property_ids", None)
        membership = services.add_member(
            organization=request.organization,  # type: ignore[attr-defined]
            actor=request.user,  # type: ignore[arg-type]
            **data,
        )
        # The same "no more than you have" rules as changing someone's access.
        services.update_access(
            membership=membership,
            actor=request.membership,  # type: ignore[attr-defined]
            role=data["role"],
            permissions=permissions if permissions is not None else role_permissions(data["role"]),
            property_ids=property_ids or [],
        )
        return Response(
            MembershipSerializer(self.get_queryset().get(pk=membership.pk)).data,
            status=status.HTTP_201_CREATED,
        )

    @extend_schema(responses=AccessChoicesSerializer)
    @action(detail=False, methods=["get"], url_path="access-choices")
    def access_choices(self, request: Request) -> Response:
        """The roles and the ticks the Team screen shows."""
        roles = [
            {
                "value": value,
                "label": label,
                "help": ROLE_HELP[value],
                "permissions": sorted(role_permissions(value)),
            }
            for value, label in Role.choices
        ]
        permissions = [{"code": p.code, "area": p.area, "label": p.label} for p in PERMISSIONS]
        return Response(AccessChoicesSerializer({"roles": roles, "permissions": permissions}).data)

    permission_map = {
        "create": "team.manage",
        "list": "team.view",
        "retrieve": "team.view",
        "partial_update": "team.manage",
        "destroy": "team.manage",
        "access_choices": "team.view",
    }

    @extend_schema(request=MemberAccessSerializer, responses=MembershipSerializer)
    def partial_update(self, request: Request, *args: Any, **kwargs: Any) -> Response:
        """Change a person's role, ticks and properties (send only what changes)."""
        membership = self.get_object()
        payload = MemberAccessSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        data = payload.validated_data
        services.update_access(
            membership=membership,
            actor=request.membership,  # type: ignore[attr-defined]
            role=data.get("role"),
            permissions=data.get("permissions"),
            property_ids=data.get("property_ids"),
        )
        return Response(MembershipSerializer(self.get_queryset().get(pk=membership.pk)).data)

    @extend_schema(responses={204: None})
    def destroy(self, request: Request, *args: Any, **kwargs: Any) -> Response:
        """Deactivate a member. Rows are kept for the audit trail."""
        services.deactivate_membership(
            membership=self.get_object(),
            actor=request.membership,  # type: ignore[attr-defined]
        )
        return Response(status=status.HTTP_204_NO_CONTENT)


class OrganizationLogoView(OrgScopedAPIView):
    """The business logo, shown in the app's sidebar and on rent receipts."""

    permission_map = {
        "POST": "business.settings",
        "DELETE": "business.settings",
    }
    parser_classes = [MultiPartParser, FormParser]

    @extend_schema(
        request={"multipart/form-data": LogoUploadSerializer}, responses=OrganizationSerializer
    )
    def post(self, request: Request) -> Response:
        org = request.organization  # type: ignore[attr-defined]
        from apps.subscriptions.entitlements import check_feature

        check_feature(org, "logo")
        payload = LogoUploadSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        if org.logo:
            org.logo.delete(save=False)
        org.logo = payload.validated_data["image"]
        org.save(update_fields=["logo", "updated_at"])
        return Response(OrganizationSerializer(org).data)

    @extend_schema(request=None, responses=OrganizationSerializer)
    def delete(self, request: Request) -> Response:
        org = request.organization  # type: ignore[attr-defined]
        if org.logo:
            org.logo.delete(save=False)
            org.save(update_fields=["logo", "updated_at"])
        return Response(OrganizationSerializer(org).data)
