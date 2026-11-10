from typing import Any, cast

from django.db.models import QuerySet
from django.shortcuts import get_object_or_404
from drf_spectacular.utils import OpenApiParameter, extend_schema, extend_schema_view
from rest_framework import mixins, status
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView
from rest_framework.viewsets import GenericViewSet

from apps.accounts.models import User
from apps.applications import services
from apps.applications.models import Application, WishlistItem
from apps.applications.serializers import (
    ApplicationSerializer,
    ApplyRequestSerializer,
    ApproveSerializer,
    DeclineSerializer,
    WishlistAddSerializer,
)
from apps.listings.public import public_listings
from apps.listings.serializers import PublicListingSerializer
from apps.tenants.places import PLACE_RELATED
from core.params import choice_param, uuid_param
from core.views import OrgScopedViewSet

_RELATED = (
    "listing__property",
    "organization",
    *(f"stay__{p}" for p in PLACE_RELATED),
    "applicant",
)


class MyApplicationViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    GenericViewSet,
):
    """The signed-in seeker's own applications. Nobody else's are ever visible here."""

    serializer_class = ApplicationSerializer
    permission_classes = [IsAuthenticated]
    http_method_names = ["get", "post", "head", "options"]

    def get_throttles(self) -> list[Any]:
        if self.action == "create":
            self.throttle_scope = "public_form"
            return [ScopedRateThrottle()]
        return super().get_throttles()

    def get_queryset(self) -> QuerySet[Any]:
        if getattr(self, "swagger_fake_view", False):  # schema generation, no real user
            return Application.objects.none()
        return Application.objects.filter(applicant=self.request.user).select_related(*_RELATED)

    @extend_schema(request=ApplyRequestSerializer, responses={201: ApplicationSerializer})
    def create(self, request: Request) -> Response:
        payload = ApplyRequestSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        data = dict(payload.validated_data)
        listing = get_object_or_404(public_listings(), slug=data.pop("listing"))
        data.pop("consent")
        application = services.apply(applicant=cast(User, request.user), listing=listing, data=data)
        fresh = self.get_queryset().get(pk=application.pk)
        return Response(ApplicationSerializer(fresh).data, status=status.HTTP_201_CREATED)

    @extend_schema(request=None, responses=ApplicationSerializer)
    @action(detail=True, methods=["post"])
    def withdraw(self, request: Request, pk: str | None = None) -> Response:
        services.withdraw(application=self.get_object())
        return Response(ApplicationSerializer(self.get_queryset().get(pk=pk)).data)


class MyWishlistView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(responses=PublicListingSerializer(many=True))
    def get(self, request: Request) -> Response:
        slugs = WishlistItem.objects.filter(user=cast(User, request.user)).values("listing_id")
        listings = public_listings().filter(pk__in=slugs)
        return Response(
            PublicListingSerializer(listings, many=True, context={"request": request}).data
        )

    @extend_schema(request=WishlistAddSerializer, responses={201: None})
    def post(self, request: Request) -> Response:
        payload = WishlistAddSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        listing = get_object_or_404(public_listings(), slug=payload.validated_data["listing"])
        WishlistItem.objects.get_or_create(user=cast(User, request.user), listing=listing)
        return Response({"status": "saved"}, status=status.HTTP_201_CREATED)


class MyWishlistItemView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(responses={204: None})
    def delete(self, request: Request, slug: str) -> Response:
        WishlistItem.objects.filter(user=cast(User, request.user), listing__slug=slug).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


@extend_schema_view(
    list=extend_schema(
        parameters=[
            OpenApiParameter("status", str, required=False, enum=Application.Status.values),
            OpenApiParameter("listing", str, required=False),
        ]
    )
)
class ApplicationViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, OrgScopedViewSet):
    """Operator inbox: approve an applicant into a bed, or decline with a reason."""

    feature = "marketplace"

    serializer_class = ApplicationSerializer
    queryset = Application.objects.select_related(*_RELATED)
    http_method_names = ["get", "post", "head", "options"]
    permission_map = {
        "list": "listings.manage",
        "retrieve": "listings.manage",
        "approve": "listings.manage",
        "decline": "listings.manage",
    }

    def get_queryset(self) -> QuerySet[Any]:
        queryset = super().get_queryset()
        app_status = choice_param(self.request, "status", Application.Status.values)
        listing = uuid_param(self.request, "listing")
        if app_status:
            queryset = queryset.filter(status=app_status)
        if listing:
            queryset = queryset.filter(listing_id=listing)
        return queryset

    def _respond(self, application: Application) -> Response:
        return Response(ApplicationSerializer(self.get_queryset().get(pk=application.pk)).data)

    @extend_schema(request=ApproveSerializer, responses=ApplicationSerializer)
    @action(detail=True, methods=["post"])
    def approve(self, request: Request, pk: str | None = None) -> Response:
        """Create (or reuse) the tenant and check them into the chosen bed."""
        application = self.get_object()
        payload = ApproveSerializer(data=request.data, context=self.get_serializer_context())
        payload.is_valid(raise_exception=True)
        data = payload.validated_data
        services.approve(
            actor=request.user,  # type: ignore[arg-type]
            application=application,
            bed=data["bed"],
            check_in_date=data["check_in"],
            monthly_rent=data.get("monthly_rent"),
            deposit_amount=data["deposit_amount"],
            deposit_collected=data["deposit_collected"],
        )
        return self._respond(application)

    @extend_schema(request=DeclineSerializer, responses=ApplicationSerializer)
    @action(detail=True, methods=["post"])
    def decline(self, request: Request, pk: str | None = None) -> Response:
        application = self.get_object()
        payload = DeclineSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        services.decline(
            actor=request.user,  # type: ignore[arg-type]
            application=application,
            reason=payload.validated_data["reason"],
        )
        return self._respond(application)
