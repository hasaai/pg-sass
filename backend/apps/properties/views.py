from typing import Any, cast

from django.db.models import Count, IntegerField, Model, OuterRef, Q, QuerySet, Subquery
from django.db.models.functions import Coalesce
from django.http import FileResponse, HttpResponse
from drf_spectacular.utils import OpenApiParameter, extend_schema, extend_schema_view
from rest_framework import mixins, status
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.serializers import BaseSerializer

from apps.accounts.models import User
from apps.properties import room_import, services
from apps.properties.models import (
    Bed,
    Floor,
    Property,
    PropertyDocument,
    PropertyPhoto,
    RentalUnit,
    Room,
)
from apps.properties.serializers import (
    BedSerializer,
    FloorSerializer,
    InventorySerializer,
    LogoSerializer,
    LogoUploadSerializer,
    PropertyBulkSerializer,
    PropertyDocumentSerializer,
    PropertyDocumentUploadSerializer,
    PropertyPhotoSerializer,
    PropertyPhotoUpdateSerializer,
    PropertySerializer,
    ReadinessSerializer,
    RentalUnitSerializer,
    RoomFeatureChoiceSerializer,
    RoomImportResultSerializer,
    RoomImportUploadSerializer,
    RoomSerializer,
    SubmitVerificationSerializer,
    VerificationEventSerializer,
)
from core.access import sees_all_properties
from core.pagination import NumberedPagination, ordered_by
from core.params import choice_param, uuid_param
from core.permissions import InsufficientRole
from core.views import OrgScopedModelViewSet, OrgScopedViewSet

MAX_PROPERTY_PHOTOS = 20
PROPERTY_ORDERING = {
    "name": ("name", "id"),
    "-name": ("-name", "id"),
    "locality": ("locality", "name", "id"),
    "-locality": ("-locality", "name", "id"),
    "created_at": ("created_at", "id"),
    "-created_at": ("-created_at", "id"),
    "updated_at": ("updated_at", "id"),
    "-updated_at": ("-updated_at", "id"),
}


def _count(model: type[Model], path: str, **filters: Any) -> Coalesce:
    """Per-property count as a subquery, so several counts never multiply each other."""
    sub = (
        model.objects.filter(**{path: OuterRef("pk")}, **filters)  # type: ignore[attr-defined]
        .order_by()
        .values(path)
        .annotate(n=Count("pk"))
        .values("n")
    )
    return Coalesce(Subquery(sub, output_field=IntegerField()), 0)


def _actor(request: Request) -> User:
    return cast(User, request.user)


def _include_archived(request: Request) -> bool:
    return request.query_params.get("include_archived") == "true"


INCLUDE_ARCHIVED = OpenApiParameter(
    "include_archived", bool, required=False, description="Also list removed (archived) records."
)


class ArchiveActionsMixin:
    """POST …/{id}/archive/ and …/{id}/restore/ for inventory records."""

    permission_map = {"archive": "properties.manage", "restore": "properties.manage"}

    @extend_schema(request=None, responses={204: None})
    @action(detail=True, methods=["post"])
    def archive(self, request: Request, pk: str | None = None) -> Response:
        """Hide it (and everything inside it). Kept for old tenancies and invoices."""
        services.archive(self.get_object(), _actor(request))  # type: ignore[attr-defined]
        return Response(status=status.HTTP_204_NO_CONTENT)

    @extend_schema(request=None, responses={204: None})
    @action(detail=True, methods=["post"])
    def restore(self, request: Request, pk: str | None = None) -> Response:
        """Bring it back. Things inside it stay removed until restored one by one."""
        services.restore(self.get_object(), _actor(request))  # type: ignore[attr-defined]
        return Response(status=status.HTTP_204_NO_CONTENT)


@extend_schema_view(
    list=extend_schema(
        parameters=[
            OpenApiParameter("q", str, required=False, description="Name, building, address"),
            OpenApiParameter(
                "status",
                str,
                required=False,
                enum=[*Property.Status.values, "all"],
                description="Default: everything except removed properties.",
            ),
            OpenApiParameter(
                "verification_status", str, required=False, enum=Property.Verification.values
            ),
            OpenApiParameter("property_type", str, required=False),
            OpenApiParameter("locality", str, required=False),
            OpenApiParameter("is_active", bool, required=False),
            OpenApiParameter("ordering", str, required=False, enum=list(PROPERTY_ORDERING)),
        ]
    )
)
class PropertyViewSet(OrgScopedModelViewSet):
    serializer_class = PropertySerializer
    pagination_class = NumberedPagination
    parser_classes = [JSONParser, MultiPartParser, FormParser]
    live_beds = {"archived_at__isnull": True, "room__archived_at__isnull": True}
    queryset = Property.objects.annotate(
        beds_total=_count(Bed, "room__property", **live_beds),
        beds_vacant=_count(Bed, "room__property", status=Bed.Status.VACANT, **live_beds),
        beds_occupied=_count(Bed, "room__property", status=Bed.Status.OCCUPIED, **live_beds),
        floors_count=_count(Floor, "property", archived_at__isnull=True),
        units_count=_count(RentalUnit, "property", archived_at__isnull=True),
        rooms_count=_count(Room, "property", archived_at__isnull=True),
    ).prefetch_related("photos")

    view_permission = "properties.view"
    manage_permission = "properties.manage"
    permission_map = {
        **{a: "properties.manage" for a in (*services.ACTIONS, "bulk", "photos", "logo")},
        "rooms_import": "properties.manage",
        "rooms_import_template": "properties.manage",
        "documents": "properties.documents",
        "submit_verification": "properties.documents",
        "readiness": "properties.view",
        "inventory": "properties.view",
        "verification": "properties.view",
    }

    def get_queryset(self) -> QuerySet[Any]:
        queryset = super().get_queryset()
        if self.action != "list":
            return queryset
        params = self.request.query_params
        wanted = choice_param(self.request, "status", [*Property.Status.values, "all"])
        if wanted is None:
            queryset = queryset.exclude(status=Property.Status.ARCHIVED)
        elif wanted != "all":
            queryset = queryset.filter(status=wanted)
        verification = choice_param(
            self.request, "verification_status", Property.Verification.values
        )
        if verification:
            queryset = queryset.filter(verification_status=verification)
        if params.get("property_type"):
            queryset = queryset.filter(property_type=params["property_type"])
        if params.get("locality"):
            queryset = queryset.filter(locality__iexact=params["locality"])
        if params.get("is_active") in {"true", "false"}:
            queryset = queryset.filter(is_active=params["is_active"] == "true")
        q = params.get("q", "").strip()
        if q:
            queryset = queryset.filter(
                Q(name__icontains=q)
                | Q(building_name__icontains=q)
                | Q(address_line__icontains=q)
                | Q(locality__icontains=q)
            )
        ordering = choice_param(self.request, "ordering", list(PROPERTY_ORDERING)) or "name"
        return queryset.order_by(*PROPERTY_ORDERING[ordering])

    def create(self, request: Request, *args: Any, **kwargs: Any) -> Response:
        if not sees_all_properties(request.membership):  # type: ignore[attr-defined]
            raise InsufficientRole("Only people who work in all properties can add a new property.")
        return super().create(request, *args, **kwargs)

    def perform_create(self, serializer: BaseSerializer[Any]) -> None:
        services.create_property(
            serializer=serializer,
            organization=self.request.organization,  # type: ignore[attr-defined]
            actor=self.request.user,  # type: ignore[arg-type]
        )

    @extend_schema(responses=ReadinessSerializer)
    @action(detail=True, methods=["get"])
    def readiness(self, request: Request, pk: str | None = None) -> Response:
        """What still has to be done before the property can be opened."""
        return Response(services.readiness_payload(self.get_object()))

    @extend_schema(parameters=[INCLUDE_ARCHIVED], responses=InventorySerializer)
    @action(detail=True, methods=["get"])
    def inventory(self, request: Request, pk: str | None = None) -> Response:
        """Floors, flats/portions, rooms and beds of one property in a single response."""
        prop = self.get_object()
        live = {} if _include_archived(request) else {"archived_at__isnull": True}
        data = {
            "floors": prop.floors.filter(**live).order_by("number"),
            "units": prop.units.filter(**live)
            .select_related("floor", "property")
            .prefetch_related("rooms")
            .order_by("code"),
            "rooms": prop.rooms.filter(**live)
            .select_related("floor", "unit", "property")
            .prefetch_related("beds", "features__amenity")
            .order_by("number"),
        }
        return Response(InventorySerializer(data, context={"request": request}).data)

    def _status_action(self, request: Request, name: str) -> Response:
        prop = services.change_status(prop=self.get_object(), action=name, actor=request.user)  # type: ignore[arg-type]
        return Response(self.get_serializer(self.get_queryset().get(pk=prop.pk)).data)

    @extend_schema(request=None, responses=PropertySerializer)
    @action(detail=True, methods=["post"])
    def activate(self, request: Request, pk: str | None = None) -> Response:
        """Open the property. Refused with the reasons while anything is unfinished."""
        return self._status_action(request, "activate")

    @extend_schema(request=None, responses=PropertySerializer)
    @action(detail=True, methods=["post"])
    def deactivate(self, request: Request, pk: str | None = None) -> Response:
        """Close the property for now. Current tenants are not affected."""
        return self._status_action(request, "deactivate")

    @extend_schema(request=None, responses=PropertySerializer)
    @action(detail=True, methods=["post"])
    def archive(self, request: Request, pk: str | None = None) -> Response:
        """Remove from the list (can be restored). Not allowed while tenants live here."""
        return self._status_action(request, "archive")

    @extend_schema(request=None, responses=PropertySerializer)
    @action(detail=True, methods=["post"])
    def restore(self, request: Request, pk: str | None = None) -> Response:
        """Bring a removed property back as closed."""
        return self._status_action(request, "restore")

    @extend_schema(
        request=PropertyBulkSerializer,
        responses={200: PropertyBulkSerializer},
    )
    @action(detail=False, methods=["post"])
    def bulk(self, request: Request) -> Response:
        """Open, close, remove or restore many properties. All or nothing.

        If any property cannot change, nothing changes and `fields.items` lists each
        property with the reason.
        """
        serializer = PropertyBulkSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        ids = set(serializer.validated_data["ids"])
        props = list(super().get_queryset().filter(pk__in=ids))
        if len(props) != len(ids):
            raise ValidationError({"ids": ["Some properties were not found."]})
        services.bulk_change_status(
            props=props, action=serializer.validated_data["action"], actor=_actor(request)
        )
        return Response(serializer.validated_data)

    @extend_schema(
        methods=["POST"],
        request={"multipart/form-data": LogoUploadSerializer},
        responses=LogoSerializer,
    )
    @extend_schema(methods=["DELETE"], request=None, responses=LogoSerializer)
    @action(detail=True, methods=["post", "delete"])
    def logo(self, request: Request, pk: str | None = None) -> Response:
        """Upload (JPG, PNG or WebP up to 5 MB) or remove the property's own logo."""
        prop = self.get_object()
        if request.method == "POST":
            from apps.subscriptions.entitlements import check_feature

            check_feature(prop.organization, "logo")
        if prop.logo:
            prop.logo.delete(save=False)
        if request.method == "POST":
            payload = LogoUploadSerializer(data=request.data)
            payload.is_valid(raise_exception=True)
            prop.logo = payload.validated_data["image"]
        prop.save(update_fields=["logo", "updated_at"])
        return Response({"logo_url": prop.logo.url if prop.logo else None})

    @extend_schema(responses={(200, "text/csv"): bytes})
    @action(detail=False, methods=["get"], url_path="rooms-import-template")
    def rooms_import_template(self, request: Request) -> HttpResponse:
        """The CSV template: room columns plus one column per room amenity."""
        response = HttpResponse(room_import.template_csv(), content_type="text/csv")
        response["Content-Disposition"] = 'attachment; filename="rooms-template.csv"'
        return response

    @extend_schema(
        request={"multipart/form-data": RoomImportUploadSerializer},
        responses=RoomImportResultSerializer,
    )
    @action(
        detail=True,
        methods=["post"],
        url_path="rooms-import",
        parser_classes=[MultiPartParser, FormParser],
    )
    def rooms_import(self, request: Request, pk: str | None = None) -> Response:
        """Check a CSV of rooms (commit=false) or add them all (commit=true, all or nothing)."""
        prop = self.get_object()
        from apps.subscriptions.entitlements import check_feature

        check_feature(prop.organization, "csv_import")
        upload = RoomImportUploadSerializer(data=request.data)
        upload.is_valid(raise_exception=True)
        records = room_import.read_csv(upload.validated_data["file"])
        rows = room_import.check_rows(prop, request, records)
        invalid = sum(1 for r in rows if r.errors)
        created = 0
        if upload.validated_data["commit"]:
            if invalid:
                raise ValidationError(
                    {"file": f"{invalid} rows have problems. Fix them and upload again."}
                )
            created = room_import.create_rooms(prop, request, rows)
        data = {
            "rows": [
                {
                    "row": r.row,
                    "room": r.room,
                    "flat": r.flat,
                    "floor": r.floor,
                    "sharing": r.sharing,
                    "rent_per_bed": r.rent_per_bed,
                    "whole_room_rent": r.whole_room_rent,
                    "problems": r.errors,
                }
                for r in rows
            ],
            "valid": len(rows) - invalid,
            "invalid": invalid,
            "beds": sum(
                (r.sharing or 0)
                for r in rows
                if not r.errors and r.payload.get("bed_rent") is not None
            ),
            "created": created,
        }
        return Response(RoomImportResultSerializer(data).data)

    @extend_schema(
        methods=["GET"],
        responses=PropertyDocumentSerializer(many=True),
    )
    @extend_schema(
        methods=["POST"],
        request={"multipart/form-data": PropertyDocumentUploadSerializer},
        responses={201: PropertyDocumentSerializer},
    )
    @action(detail=True, methods=["get", "post"])
    def documents(self, request: Request, pk: str | None = None) -> Response:
        """Private documents: list them, or upload one (PDF, JPG, PNG or WebP up to 5 MB).

        Only owners and managers can see or download them.
        """
        prop = self.get_object()
        if request.method == "GET":
            docs = prop.documents.select_related("created_by").all()
            return Response(PropertyDocumentSerializer(docs, many=True).data)
        payload = PropertyDocumentUploadSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        data = dict(payload.validated_data)
        upload = data.pop("file")
        doc = services.add_document(
            prop=prop,
            actor=_actor(request),
            upload=upload,
            content_type=payload._content_type,
            **data,
        )
        return Response(PropertyDocumentSerializer(doc).data, status=status.HTTP_201_CREATED)

    @extend_schema(responses=VerificationEventSerializer(many=True))
    @action(detail=True, methods=["get"])
    def verification(self, request: Request, pk: str | None = None) -> Response:
        """Verification history: when it was sent for checking and what was decided."""
        prop = self.get_object()
        events = prop.verification_events.select_related("created_by")
        return Response(VerificationEventSerializer(events, many=True).data)

    @extend_schema(request=SubmitVerificationSerializer, responses=PropertySerializer)
    @action(detail=True, methods=["post"], url_path="submit-verification")
    def submit_verification(self, request: Request, pk: str | None = None) -> Response:
        """Send the property and its proof documents to the PG Manager team for checking."""
        payload = SubmitVerificationSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        prop = self.get_object()
        services.submit_for_verification(
            prop=prop, actor=_actor(request), note=payload.validated_data["note"]
        )
        return Response(self.get_serializer(self.get_queryset().get(pk=prop.pk)).data)

    @extend_schema(
        request={"multipart/form-data": PropertyPhotoSerializer},
        responses={201: PropertyPhotoSerializer},
    )
    @action(detail=True, methods=["post"])
    def photos(self, request: Request, pk: str | None = None) -> Response:
        """Upload a photo (JPG, PNG or WebP up to 5 MB, at most 20 per property).

        Photos are listed in the property itself (`photos`) and also shown on its listing.
        """
        prop = self.get_object()
        if prop.photos.count() >= MAX_PROPERTY_PHOTOS:
            raise ValidationError(
                {"image": f"A property can have at most {MAX_PROPERTY_PHOTOS} photos."}
            )
        serializer = PropertyPhotoSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        photo = serializer.save(
            organization=prop.organization,
            created_by=request.user,
            property=prop,
            position=serializer.validated_data.get("position", prop.photos.count()),
        )
        return Response(PropertyPhotoSerializer(photo).data, status=status.HTTP_201_CREATED)


class InventoryViewSet(ArchiveActionsMixin, OrgScopedModelViewSet):
    """Shared filters: ?property=, ?include_archived=true."""

    view_permission = "properties.view"
    manage_permission = "properties.manage"

    def get_queryset(self) -> QuerySet[Any]:
        queryset = super().get_queryset()
        if self.action == "list" and not _include_archived(self.request):
            queryset = queryset.filter(archived_at__isnull=True)
        return queryset


@extend_schema_view(
    list=extend_schema(
        parameters=[OpenApiParameter("property", str, required=False), INCLUDE_ARCHIVED]
    )
)
class FloorViewSet(InventoryViewSet):
    serializer_class = FloorSerializer
    pagination_class = ordered_by("number", "id")
    queryset = Floor.objects.select_related("property")

    def get_queryset(self) -> QuerySet[Any]:
        queryset = super().get_queryset()
        prop = uuid_param(self.request, "property")
        return queryset.filter(property_id=prop) if prop else queryset


@extend_schema_view(
    list=extend_schema(
        parameters=[
            OpenApiParameter("property", str, required=False),
            OpenApiParameter("floor", str, required=False),
            OpenApiParameter("q", str, required=False),
            INCLUDE_ARCHIVED,
        ]
    )
)
class RentalUnitViewSet(InventoryViewSet):
    serializer_class = RentalUnitSerializer
    pagination_class = ordered_by("code", "id")
    queryset = RentalUnit.objects.select_related("property", "floor").prefetch_related("rooms")

    def get_queryset(self) -> QuerySet[Any]:
        queryset = super().get_queryset()
        prop = uuid_param(self.request, "property")
        floor = uuid_param(self.request, "floor")
        q = self.request.query_params.get("q", "").strip()
        if prop:
            queryset = queryset.filter(property_id=prop)
        if floor:
            queryset = queryset.filter(floor_id=floor)
        if q:
            queryset = queryset.filter(code__icontains=q)
        return queryset


@extend_schema_view(
    list=extend_schema(
        parameters=[
            OpenApiParameter("property", str, required=False),
            OpenApiParameter("unit", str, required=False),
            OpenApiParameter("floor", str, required=False),
            INCLUDE_ARCHIVED,
        ]
    )
)
class RoomViewSet(InventoryViewSet):
    serializer_class = RoomSerializer
    pagination_class = ordered_by("number", "id")
    queryset = Room.objects.select_related("property", "unit", "floor").prefetch_related(
        "beds", "features__amenity"
    )

    permission_map = {**InventoryViewSet.permission_map, "feature_choices": "properties.view"}

    @extend_schema(responses=RoomFeatureChoiceSerializer(many=True))
    @action(detail=False, methods=["get"], url_path="feature-choices")
    def feature_choices(self, request: Request) -> Response:
        """What a room can have (balcony, geyser ...), from the amenity catalog."""
        return Response(
            RoomFeatureChoiceSerializer(services.room_feature_choices(), many=True).data
        )

    def get_queryset(self) -> QuerySet[Any]:
        queryset = super().get_queryset()
        for name, field in (
            ("property", "property_id"),
            ("unit", "unit_id"),
            ("floor", "floor_id"),
        ):
            value = uuid_param(self.request, name)
            if value:
                queryset = queryset.filter(**{field: value})
        return queryset


@extend_schema_view(
    list=extend_schema(
        parameters=[
            OpenApiParameter("property", str, required=False),
            OpenApiParameter("room", str, required=False),
            OpenApiParameter("status", str, required=False, enum=Bed.Status.values),
            INCLUDE_ARCHIVED,
        ]
    )
)
class BedViewSet(InventoryViewSet):
    serializer_class = BedSerializer
    pagination_class = ordered_by("created_at", "id")
    queryset = Bed.objects.select_related("room__property", "room__unit")

    def get_queryset(self) -> QuerySet[Any]:
        queryset = super().get_queryset()
        prop = uuid_param(self.request, "property")
        room = uuid_param(self.request, "room")
        bed_status = choice_param(self.request, "status", Bed.Status.values)
        if prop:
            queryset = queryset.filter(room__property_id=prop)
        if room:
            queryset = queryset.filter(room_id=room)
        if bed_status:
            queryset = queryset.filter(status=bed_status)
        return queryset


class PropertyPhotoViewSet(mixins.UpdateModelMixin, mixins.DestroyModelMixin, OrgScopedViewSet):
    serializer_class = PropertyPhotoUpdateSerializer
    queryset = PropertyPhoto.objects.all()
    http_method_names = ["patch", "delete", "options"]
    permission_map = {"partial_update": "properties.manage", "destroy": "properties.manage"}

    def perform_destroy(self, instance: PropertyPhoto) -> None:
        instance.image.delete(save=False)
        instance.delete()


class PropertyDocumentViewSet(mixins.UpdateModelMixin, mixins.DestroyModelMixin, OrgScopedViewSet):
    """Edit details of, remove, or download one private property document."""

    serializer_class = PropertyDocumentSerializer
    queryset = PropertyDocument.objects.select_related("property", "created_by")
    http_method_names = ["get", "patch", "delete", "options"]
    permission_map = {
        "partial_update": "properties.documents",
        "destroy": "properties.documents",
        "download": "properties.documents",
    }

    def perform_destroy(self, instance: PropertyDocument) -> None:
        services.delete_document(doc=instance, actor=_actor(self.request))

    @extend_schema(responses={(200, "application/octet-stream"): bytes})
    @action(detail=True, methods=["get"])
    def download(self, request: Request, pk: str | None = None) -> FileResponse:
        doc = self.get_object()
        services.log_document_download(doc=doc, actor=_actor(request), by_platform=False)
        return document_response(doc)


def document_response(doc: PropertyDocument) -> FileResponse:
    return FileResponse(doc.file.open("rb"), as_attachment=True, filename=doc.file_name)
