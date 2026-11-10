"""Public marketplace: search, listing pages, enquiries, reports, PG requests.

Visitors need no account. A signed-in visitor (any user) also sees the owner's phone.
"""

from decimal import Decimal, InvalidOperation
from typing import Any

from django.conf import settings
from django.db.models import Count, Exists, OuterRef, Prefetch, Q, QuerySet
from django.shortcuts import get_object_or_404
from drf_spectacular.utils import OpenApiParameter, extend_schema, extend_schema_view
from rest_framework import status
from rest_framework.exceptions import ValidationError
from rest_framework.generics import ListAPIView, RetrieveAPIView
from rest_framework.permissions import AllowAny
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from apps.amenities.catalog import legacy_map as legacy_amenity_words
from apps.amenities.models import PropertyAmenity
from apps.listings.models import Enquiry, Listing, ListingReport, PgRequest
from apps.listings.serializers import (
    ListingReportSerializer,
    LocalitySerializer,
    PgRequestSerializer,
    PublicEnquirySerializer,
    PublicListingSerializer,
)
from apps.listings.views import ROOMS_WITH_BEDS
from apps.organizations.models import Organization
from apps.properties.models import Bed
from core.auth import OptionalJWTAuthentication
from core.params import choice_param, int_param

GENDERS = ["men", "women", "coed"]


def public_base() -> QuerySet[Listing]:
    queryset = Listing.objects.filter(
        is_published=True,
        property__is_active=True,
        organization__status=Organization.Status.ACTIVE,
    )
    if settings.LISTINGS_REQUIRE_VERIFICATION:
        queryset = queryset.filter(is_verified=True)
    return queryset


def public_listings() -> QuerySet[Listing]:
    return (
        public_base()
        .select_related("property", "organization")
        .prefetch_related(
            ROOMS_WITH_BEDS,
            "photos",
            "property__photos",
            Prefetch(
                "property__amenity_assignments",
                queryset=PropertyAmenity.objects.select_related("amenity__category"),
            ),
        )
    )


class PublicView(APIView):
    authentication_classes = [OptionalJWTAuthentication]
    permission_classes = [AllowAny]


def _decimal_param(request: Request, name: str) -> Decimal | None:
    raw = request.query_params.get(name)
    if not raw:
        return None
    try:
        return Decimal(raw)
    except InvalidOperation as exc:
        raise ValidationError({name: "Must be a number."}) from exc


@extend_schema_view(
    get=extend_schema(
        parameters=[
            OpenApiParameter("locality", str, required=False),
            OpenApiParameter("gender", str, required=False, enum=GENDERS),
            OpenApiParameter("sharing", int, required=False),
            OpenApiParameter("max_rent", int, required=False, description="Paise per month"),
            OpenApiParameter("available", bool, required=False),
            OpenApiParameter("food", bool, required=False),
            OpenApiParameter("amenities", str, required=False, description="Comma separated"),
            OpenApiParameter("q", str, required=False),
            OpenApiParameter("min_lat", float, required=False),
            OpenApiParameter("max_lat", float, required=False),
            OpenApiParameter("min_lng", float, required=False),
            OpenApiParameter("max_lng", float, required=False),
        ]
    )
)
class PublicListingListView(PublicView, ListAPIView):
    serializer_class = PublicListingSerializer

    def get_queryset(self) -> QuerySet[Any]:
        request = self.request
        params = request.query_params
        queryset = public_listings()
        locality = params.get("locality", "").strip()
        if locality:
            queryset = queryset.filter(property__locality__iexact=locality)
        gender = choice_param(request, "gender", GENDERS)
        if gender:
            queryset = queryset.filter(property__gender=gender)
        q = params.get("q", "").strip()
        if q:
            queryset = queryset.filter(
                Q(headline__icontains=q)
                | Q(property__name__icontains=q)
                | Q(property__locality__icontains=q)
                | Q(property__landmark__icontains=q)
            )
        if params.get("food") == "true":
            queryset = queryset.filter(food_included=True)
        legacy = legacy_amenity_words()
        for word in [a.strip().lower() for a in params.get("amenities", "").split(",")]:
            amenity = legacy.get(word, word)  # old links used words like "hot water"
            if amenity:
                # amenities is a JSON list of strings; match the quoted item.
                queryset = queryset.filter(property__amenities__icontains=f'"{amenity}"')
        bounds = [_decimal_param(request, n) for n in ("min_lat", "max_lat", "min_lng", "max_lng")]
        if any(b is not None for b in bounds):
            if any(b is None for b in bounds):
                raise ValidationError({"min_lat": "Send all four map bounds."})
            min_lat, max_lat, min_lng, max_lng = bounds
            queryset = queryset.filter(
                property__latitude__gte=min_lat,
                property__latitude__lte=max_lat,
                property__longitude__gte=min_lng,
                property__longitude__lte=max_lng,
            )
        sharing = int_param(request, "sharing")
        max_rent = int_param(request, "max_rent")
        available = params.get("available") == "true"
        if sharing or max_rent or available:
            beds = Bed.objects.filter(room__property=OuterRef("property")).exclude(
                status=Bed.Status.BLOCKED
            )
            if sharing:
                beds = beds.filter(room__sharing=sharing)
            if max_rent:
                beds = beds.filter(monthly_rent__lte=max_rent)
            if available:
                beds = beds.filter(status=Bed.Status.VACANT)
            queryset = queryset.filter(Exists(beds))
        return queryset


class PublicListingDetailView(PublicView, RetrieveAPIView):
    serializer_class = PublicListingSerializer
    lookup_field = "slug"

    def get_queryset(self) -> QuerySet[Any]:
        return public_listings()


class _ThrottledPublicForm(PublicView):
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "public_form"


class PublicEnquiryView(_ThrottledPublicForm):
    throttle_scope = "enquiry"

    @extend_schema(request=PublicEnquirySerializer, responses={201: None})
    def post(self, request: Request, slug: str) -> Response:
        listing = get_object_or_404(public_listings(), slug=slug)
        serializer = PublicEnquirySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)
        honeypot = data.pop("website", "")
        if not honeypot:  # silently drop bot submissions
            Enquiry.objects.create(organization=listing.organization, listing=listing, **data)
        return Response({"status": "received"}, status=status.HTTP_201_CREATED)


class PublicReportView(_ThrottledPublicForm):
    @extend_schema(request=ListingReportSerializer, responses={201: None})
    def post(self, request: Request, slug: str) -> Response:
        """Tell the platform team a listing does not match reality."""
        listing = get_object_or_404(public_listings(), slug=slug)
        serializer = ListingReportSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        ListingReport.objects.create(
            listing=listing,
            reporter=request.user if request.user.is_authenticated else None,
            **serializer.validated_data,
        )
        return Response({"status": "received"}, status=status.HTTP_201_CREATED)


class PublicPgRequestView(_ThrottledPublicForm):
    @extend_schema(request=PgRequestSerializer, responses={201: None})
    def post(self, request: Request) -> Response:
        """Ask for a PG that is not listed yet; the platform team contacts the owner."""
        serializer = PgRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)
        if not data.pop("website", ""):
            PgRequest.objects.create(
                requested_by=request.user if request.user.is_authenticated else None, **data
            )
        return Response({"status": "received"}, status=status.HTTP_201_CREATED)


class PublicLocalitiesView(PublicView):
    @extend_schema(responses=LocalitySerializer(many=True))
    def get(self, request: Request) -> Response:
        rows = (
            public_base()
            .values("property__locality")
            .annotate(listings=Count("id"))
            .order_by("property__locality")
        )
        return Response(
            [{"locality": r["property__locality"], "listings": r["listings"]} for r in rows]
        )
