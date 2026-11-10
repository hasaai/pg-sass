"""Operator side of the marketplace: listings, photos, enquiries."""

from typing import Any

from django.db.models import Count, Prefetch, Q, QuerySet
from drf_spectacular.utils import OpenApiParameter, extend_schema, extend_schema_view
from rest_framework import mixins, status
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.request import Request
from rest_framework.response import Response

from apps.listings.models import Enquiry, Listing, ListingPhoto
from apps.listings.serializers import (
    EnquirySerializer,
    ListingPhotoSerializer,
    ListingSerializer,
    PhotoUpdateSerializer,
)
from apps.properties.models import Room
from core.params import choice_param, uuid_param
from core.views import OrgScopedModelViewSet, OrgScopedViewSet

MAX_PHOTOS = 15

ROOMS_WITH_BEDS = Prefetch(
    "property__rooms", queryset=Room.objects.prefetch_related("beds").order_by("number")
)


class ListingViewSet(OrgScopedModelViewSet):
    feature = "marketplace"
    serializer_class = ListingSerializer
    parser_classes = [JSONParser, MultiPartParser, FormParser]
    queryset = (
        Listing.objects.select_related("property")
        .prefetch_related(ROOMS_WITH_BEDS, "photos")
        .annotate(
            enquiries_new=Count("enquiries", filter=Q(enquiries__status="new"), distinct=True)
        )
    )
    permission_map = {
        "list": "listings.manage",
        "retrieve": "listings.manage",
        "create": "listings.manage",
        "partial_update": "listings.manage",
        "destroy": "listings.manage",
        "photos": "listings.manage",
    }

    @extend_schema(
        methods=["POST"],
        request={"multipart/form-data": ListingPhotoSerializer},
        responses={201: ListingPhotoSerializer},
    )
    @extend_schema(methods=["GET"], responses=ListingPhotoSerializer(many=True))
    @action(detail=True, methods=["get", "post"])
    def photos(self, request: Request, pk: str | None = None) -> Response:
        """List or upload photos (JPG, PNG or WebP up to 5 MB, at most 15 per listing)."""
        listing = self.get_object()
        if request.method == "GET":
            return Response(ListingPhotoSerializer(listing.photos.all(), many=True).data)
        if listing.photos.count() >= MAX_PHOTOS:
            raise ValidationError({"image": f"A listing can have at most {MAX_PHOTOS} photos."})
        serializer = ListingPhotoSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        photo = serializer.save(
            organization=listing.organization,
            created_by=request.user,
            listing=listing,
            position=serializer.validated_data.get("position", listing.photos.count()),
        )
        return Response(ListingPhotoSerializer(photo).data, status=status.HTTP_201_CREATED)


class ListingPhotoViewSet(mixins.UpdateModelMixin, mixins.DestroyModelMixin, OrgScopedViewSet):
    feature = "marketplace"
    serializer_class = PhotoUpdateSerializer
    queryset = ListingPhoto.objects.all()
    http_method_names = ["patch", "delete", "options"]
    permission_map = {
        "partial_update": "listings.manage",
        "destroy": "listings.manage",
    }

    def perform_destroy(self, instance: ListingPhoto) -> None:
        instance.image.delete(save=False)
        instance.delete()


@extend_schema_view(
    list=extend_schema(
        parameters=[
            OpenApiParameter("status", str, required=False, enum=Enquiry.Status.values),
            OpenApiParameter("listing", str, required=False),
        ]
    )
)
class EnquiryViewSet(
    mixins.ListModelMixin, mixins.RetrieveModelMixin, mixins.UpdateModelMixin, OrgScopedViewSet
):
    feature = "marketplace"
    serializer_class = EnquirySerializer
    queryset = Enquiry.objects.select_related("listing__property")
    http_method_names = ["get", "patch", "head", "options"]
    permission_map = {
        "list": "listings.manage",
        "retrieve": "listings.manage",
        "partial_update": "listings.manage",
    }

    def get_queryset(self) -> QuerySet[Any]:
        queryset = super().get_queryset()
        enquiry_status = choice_param(self.request, "status", Enquiry.Status.values)
        listing = uuid_param(self.request, "listing")
        if enquiry_status:
            queryset = queryset.filter(status=enquiry_status)
        if listing:
            queryset = queryset.filter(listing_id=listing)
        return queryset
