from __future__ import annotations

from typing import Any

from django.shortcuts import get_object_or_404
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework.permissions import AllowAny
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.amenities import services
from apps.amenities.catalog import PROPERTY_TYPES
from apps.amenities.models import Amenity, AmenityCategory
from apps.amenities.serializers import (
    AmenitySetSerializer,
    CatalogSerializer,
    PropertyAmenitySerializer,
)
from apps.properties.models import Property
from core.access import visible
from core.params import choice_param
from core.views import OrgScopedAPIView

TYPE_KEYS = [key for key, _ in PROPERTY_TYPES]


class AmenityCatalogView(APIView):
    """The amenity catalog, grouped by category. Public: the marketplace uses it for filters."""

    authentication_classes: list[Any] = []
    permission_classes = [AllowAny]

    @extend_schema(
        parameters=[
            OpenApiParameter("property_type", str, required=False, enum=TYPE_KEYS),
            OpenApiParameter("filterable", bool, required=False),
        ],
        responses=CatalogSerializer,
    )
    def get(self, request: Request) -> Response:
        property_type = choice_param(request, "property_type", TYPE_KEYS)
        amenities = Amenity.objects.filter(is_active=True).select_related("category")
        if request.query_params.get("filterable") == "true":
            amenities = amenities.filter(is_filterable=True)
        by_category: dict[Any, list[Amenity]] = {}
        for amenity in amenities:
            if property_type and not amenity.applies_to(property_type):
                continue
            by_category.setdefault(amenity.category_id, []).append(amenity)
        categories = [
            {"key": c.key, "name": c.name, "amenities": by_category[c.pk]}
            for c in AmenityCategory.objects.all()
            if c.pk in by_category
        ]
        data = {
            "property_types": [{"value": k, "label": v} for k, v in PROPERTY_TYPES],
            "categories": categories,
        }
        response = Response(CatalogSerializer(data).data)
        response["Cache-Control"] = "public, max-age=300"
        return response


class PropertyAmenitiesView(OrgScopedAPIView):
    """Read or replace one property's amenities."""

    permission_map = {"GET": "properties.view", "PUT": "properties.manage"}

    def get_property(self, request: Request, pk: str) -> Property:
        return get_object_or_404(
            visible(Property, request),
            pk=pk,
        )

    @extend_schema(responses=PropertyAmenitySerializer(many=True))
    def get(self, request: Request, pk: str) -> Response:
        prop = self.get_property(request, pk)
        rows = prop.amenity_assignments.select_related("amenity__category").prefetch_related(
            "rooms"
        )
        return Response(PropertyAmenitySerializer(rows, many=True).data)

    @extend_schema(request=AmenitySetSerializer, responses=PropertyAmenitySerializer(many=True))
    def put(self, request: Request, pk: str) -> Response:
        prop = self.get_property(request, pk)
        payload = AmenitySetSerializer(
            data=request.data, context={"request": request, "property": prop}
        )
        payload.is_valid(raise_exception=True)
        rows = services.replace_assignments(
            prop=prop,
            items=payload.validated_data["assignments"],
            actor=request.user,  # type: ignore[arg-type]
        )
        return Response(PropertyAmenitySerializer(rows, many=True).data)
