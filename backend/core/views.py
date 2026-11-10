"""Base views that make organization scoping the default."""

from __future__ import annotations

from typing import Any

from django.db import DatabaseError, connection
from django.db.models import QuerySet
from drf_spectacular.utils import extend_schema, inline_serializer
from rest_framework import mixins, serializers, status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.viewsets import GenericViewSet

from core.access import limit_to_properties
from core.permissions import OrgRolePermission


class OrgScopedViewSet(GenericViewSet):
    """Every queryset is filtered to the caller's organization (and their properties).

    Objects from another organization are simply not in the queryset, so a lookup
    returns 404 and never reveals that the object exists.
    """

    permission_classes = [IsAuthenticated, OrgRolePermission]
    # action -> permission code (core/access.py); see OrgRolePermission.
    permission_map: dict[str, str] = {}

    def get_queryset(self) -> QuerySet[Any]:
        queryset = super().get_queryset()
        queryset = queryset.filter(organization=self.request.organization)  # type: ignore[attr-defined]
        return limit_to_properties(queryset, getattr(self.request, "membership", None))

    def perform_create(self, serializer: serializers.BaseSerializer[Any]) -> None:
        serializer.save(
            organization=self.request.organization,  # type: ignore[attr-defined]
            created_by=self.request.user,
        )


class OrgScopedModelViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.CreateModelMixin,
    mixins.UpdateModelMixin,
    mixins.DestroyModelMixin,
    OrgScopedViewSet,
):
    """CRUD on organization data; reading and changing each need a permission."""

    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    def perform_create(self, serializer: serializers.BaseSerializer[Any]) -> None:
        # The mixins' perform_create would otherwise win in the MRO and skip the org.
        OrgScopedViewSet.perform_create(self, serializer)

    # Reading needs `view_permission`, changing needs `manage_permission`; extra actions
    # and exceptions go in `permission_map`, which wins over these defaults.
    view_permission = ""
    manage_permission = ""

    def get_permission_map(self) -> dict[str, str]:
        defaults = {
            "list": self.view_permission,
            "retrieve": self.view_permission,
            "create": self.manage_permission,
            "partial_update": self.manage_permission,
            "destroy": self.manage_permission,
        }
        return {**{k: v for k, v in defaults.items() if v}, **self.permission_map}


class OrgScopedAPIView(APIView):
    """Plain API view that acts on the caller's organization."""

    permission_classes = [IsAuthenticated, OrgRolePermission]
    # HTTP method -> permission code (core/access.py).
    permission_map: dict[str, str] = {}


class HealthView(APIView):
    authentication_classes: list[Any] = []
    permission_classes = [AllowAny]

    @extend_schema(
        responses=inline_serializer(
            "Health", {"status": serializers.CharField(), "database": serializers.CharField()}
        )
    )
    def get(self, request: Request) -> Response:
        try:
            with connection.cursor() as cursor:
                cursor.execute("SELECT 1")
        except DatabaseError:
            return Response(
                {"status": "degraded", "database": "unavailable"},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        return Response({"status": "ok", "database": "ok"})
