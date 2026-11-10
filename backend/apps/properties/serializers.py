from __future__ import annotations

import string
from typing import Any, cast

from django.db import transaction
from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from apps.properties import services
from apps.properties.models import (
    Bed,
    Floor,
    Letting,
    Property,
    PropertyDocument,
    PropertyPhoto,
    RentalUnit,
    Room,
    RoomFeature,
    VerificationEvent,
)
from core.fields import OrgScopedRelatedField
from core.uploads import DOCUMENT_TYPES, IMAGE_TYPES, validate_upload
from core.validators import normalize_indian_mobile

MANUAL_BED_STATUSES = {Bed.Status.VACANT, Bed.Status.RESERVED, Bed.Status.BLOCKED}


class PropertyPhotoSerializer(serializers.ModelSerializer):
    image = serializers.ImageField(write_only=True)
    url = serializers.SerializerMethodField()

    class Meta:
        model = PropertyPhoto
        fields = ["id", "image", "url", "caption", "position", "width", "height", "created_at"]
        read_only_fields = ["id", "url", "width", "height", "created_at"]

    def get_url(self, obj: PropertyPhoto) -> str:
        return obj.image.url

    def validate_image(self, value: Any) -> Any:
        validate_upload(value, IMAGE_TYPES)
        return value


class PropertyPhotoUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = PropertyPhoto
        fields = ["caption", "position"]


class PropertySerializer(serializers.ModelSerializer):
    status_label = serializers.CharField(source="get_status_display", read_only=True)
    verification_status_label = serializers.CharField(
        source="get_verification_status_display", read_only=True
    )
    property_type_label = serializers.CharField(source="get_property_type_display", read_only=True)
    unit_word = serializers.SerializerMethodField()
    beds_total = serializers.IntegerField(read_only=True, default=0)
    beds_vacant = serializers.IntegerField(read_only=True, default=0)
    beds_occupied = serializers.IntegerField(read_only=True, default=0)
    floors_count = serializers.IntegerField(read_only=True, default=0)
    units_count = serializers.IntegerField(read_only=True, default=0)
    rooms_count = serializers.IntegerField(read_only=True, default=0)
    photos = PropertyPhotoSerializer(many=True, read_only=True)
    amenities = serializers.ListField(child=serializers.CharField(), read_only=True)
    logo_url = serializers.SerializerMethodField()

    class Meta:
        model = Property
        fields = [
            "id",
            "name",
            "reference",
            "contact_phone",
            "status",
            "status_label",
            "verification_status",
            "verification_status_label",
            "property_type",
            "property_type_label",
            "unit_word",
            "building_name",
            "description",
            "address_line",
            "locality",
            "landmark",
            "city",
            "state",
            "pincode",
            "gender",
            "total_floors",
            "built_up_area_sqft",
            "year_built",
            "amenities",
            "latitude",
            "longitude",
            "rent_due_day",
            "is_active",
            "beds_total",
            "beds_vacant",
            "beds_occupied",
            "floors_count",
            "units_count",
            "rooms_count",
            "photos",
            "logo_url",
            "created_at",
            "updated_at",
        ]
        # amenities: the available amenity keys, managed via /properties/{id}/amenities/.
        # status: changed only through the activate / deactivate / archive / restore actions.
        read_only_fields = [
            "id",
            "reference",
            "status",
            "verification_status",
            "is_active",
            "amenities",
            "created_at",
            "updated_at",
        ]

    def validate_contact_phone(self, value: str) -> str:
        return normalize_indian_mobile(value) if value.strip() else ""

    def get_logo_url(self, obj: Property) -> str | None:
        return obj.logo.url if obj.logo else None

    def get_unit_word(self, obj: Property) -> str:
        return services.unit_word(obj)

    def update(self, instance: Property, validated_data: dict[str, Any]) -> Property:
        from apps.amenities import services as amenities

        type_changed = (
            "property_type" in validated_data
            and validated_data["property_type"] != instance.property_type
        )
        prop = super().update(instance, validated_data)
        if type_changed:
            # e.g. a PG turned into an apartment: "Meals" no longer applies.
            amenities.drop_incompatible(prop)
        return prop

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        lat, lng = attrs.get("latitude"), attrs.get("longitude")
        if (lat is None) != (lng is None) and (self.instance is None or not self.partial):
            raise serializers.ValidationError({"latitude": "Give both latitude and longitude."})
        if lat is not None and not -90 <= lat <= 90:
            raise serializers.ValidationError({"latitude": "Must be between -90 and 90."})
        if lng is not None and not -180 <= lng <= 180:
            raise serializers.ValidationError({"longitude": "Must be between -180 and 180."})
        return attrs

    def validate_pincode(self, value: str) -> str:
        if value and (len(value) != 6 or not value.isdigit()):
            raise serializers.ValidationError("Enter a 6-digit pincode.")
        return value


class PropertyBulkSerializer(serializers.Serializer):
    action = serializers.ChoiceField(choices=services.ACTIONS)
    ids = serializers.ListField(child=serializers.UUIDField(), min_length=1, max_length=100)


class ProblemSerializer(serializers.Serializer):
    code = serializers.CharField()
    message = serializers.CharField()
    target_type = serializers.CharField()
    target_id = serializers.CharField()


class ReadinessSerializer(serializers.Serializer):
    ready = serializers.BooleanField()
    problems = ProblemSerializer(many=True)


def _check_immutable_property(
    serializer: serializers.ModelSerializer, attrs: dict[str, Any], what: str
) -> None:
    instance = serializer.instance
    if instance is not None and "property" in attrs and attrs["property"] != instance.property:
        raise serializers.ValidationError({"property": f"{what} cannot move to another property."})


class FloorSerializer(serializers.ModelSerializer):
    property = OrgScopedRelatedField(queryset=Property.objects.all())
    display_name = serializers.CharField(read_only=True)

    class Meta:
        model = Floor
        fields = ["id", "property", "number", "name", "display_name", "archived_at", "created_at"]
        read_only_fields = ["id", "archived_at", "created_at"]
        validators: list[Any] = []

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        _check_immutable_property(self, attrs, "A floor")
        prop = attrs.get("property", getattr(self.instance, "property", None))
        number = attrs.get("number", getattr(self.instance, "number", None))
        clash = Floor.objects.filter(property=prop, number=number)
        if self.instance is not None:
            clash = clash.exclude(pk=self.instance.pk)
        if clash.exists():
            raise serializers.ValidationError({"number": "This floor already exists."})
        return attrs


class RentalUnitSerializer(serializers.ModelSerializer):
    property = OrgScopedRelatedField(queryset=Property.objects.all())
    floor = OrgScopedRelatedField(queryset=Floor.objects.all(), allow_null=True, required=False)
    floor_number = serializers.IntegerField(
        write_only=True,
        required=False,
        allow_null=True,
        min_value=-5,
        max_value=200,
        help_text="Shortcut: the floor is created if the property does not have it yet.",
    )
    floor_name = serializers.SerializerMethodField()
    unit_type_label = serializers.CharField(source="get_unit_type_display", read_only=True)
    furnishing_label = serializers.CharField(source="get_furnishing_display", read_only=True)
    letting_label = serializers.SerializerMethodField()
    status_label = serializers.CharField(source="get_status_display", read_only=True)
    rooms_count = serializers.SerializerMethodField()

    class Meta:
        model = RentalUnit
        fields = [
            "id",
            "property",
            "floor",
            "floor_number",
            "floor_name",
            "code",
            "unit_type",
            "unit_type_label",
            "bedrooms",
            "bathrooms",
            "area_sqft",
            "furnishing",
            "furnishing_label",
            "letting",
            "letting_label",
            "monthly_rent",
            "deposit",
            "max_occupants",
            "status",
            "status_label",
            "rooms_count",
            "archived_at",
            "created_at",
        ]
        read_only_fields = ["id", "archived_at", "created_at"]
        validators: list[Any] = []

    def get_floor_name(self, obj: RentalUnit) -> str:
        return services.floor_name(obj)

    def get_letting_label(self, obj: RentalUnit) -> str:
        return services.unit_letting_label(obj)

    def get_rooms_count(self, obj: RentalUnit) -> int:
        return sum(1 for r in obj.rooms.all() if r.archived_at is None)

    def create(self, validated_data: dict[str, Any]) -> RentalUnit:
        resolve_floor(validated_data, validated_data.get("created_by"))
        return super().create(validated_data)

    def update(self, instance: RentalUnit, validated_data: dict[str, Any]) -> RentalUnit:
        resolve_floor(validated_data, getattr(self.context.get("request"), "user", None))
        return super().update(instance, validated_data)

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        _check_immutable_property(self, attrs, "A flat")
        prop = cast(Property, attrs.get("property", getattr(self.instance, "property", None)))
        services.check_same_property(prop, floor=attrs.get("floor"))
        if "floor_number" in attrs:
            number = attrs.pop("floor_number")
            attrs["floor"] = None if number is None else Floor(property=prop, number=number)
        code = attrs.get("code", getattr(self.instance, "code", None))
        clash = RentalUnit.objects.filter(property=prop, code=code)
        if self.instance is not None:
            clash = clash.exclude(pk=self.instance.pk)
        if clash.exists():
            raise serializers.ValidationError(
                {
                    "code": f"{services.unit_name(RentalUnit(property=prop, code=str(code)))} "
                    "already exists in this property."
                }
            )
        letting = attrs.get("letting", getattr(self.instance, "letting", Letting.WHOLE))
        if letting == Letting.BY_PARTS and attrs.get("monthly_rent"):
            raise serializers.ValidationError(
                {"monthly_rent": "Rented room by room: set the rent on each room instead."}
            )
        if self.instance is not None and "letting" in attrs:
            services.check_unit_letting_change(self.instance, attrs["letting"])
        return attrs


def resolve_floor(validated_data: dict[str, Any], actor: Any) -> None:
    """Create the floor given as `floor_number` if the property does not have it yet."""
    floor = validated_data.get("floor")
    if isinstance(floor, Floor) and floor._state.adding:
        validated_data["floor"], _ = Floor.objects.get_or_create(
            property=floor.property,
            number=floor.number,
            defaults={"organization": floor.property.organization, "created_by": actor},
        )


class BedSummarySerializer(serializers.ModelSerializer):
    status_label = serializers.CharField(source="get_status_display", read_only=True)

    class Meta:
        model = Bed
        fields = ["id", "label", "monthly_rent", "status", "status_label", "archived_at"]
        read_only_fields = fields


class RoomFeatureSerializer(serializers.Serializer):
    """One feature of a room: a catalog amenity, included in rent or charged extra."""

    amenity = serializers.SlugField(max_length=40)
    name = serializers.CharField(read_only=True)
    charge = serializers.ChoiceField(
        choices=RoomFeature.Charge.choices, default=RoomFeature.Charge.INCLUDED
    )
    charge_label = serializers.CharField(read_only=True)
    charge_amount = serializers.IntegerField(
        min_value=1, required=False, allow_null=True, help_text="Paise per tenant per month"
    )

    def to_representation(self, instance: Any) -> dict[str, Any]:
        if isinstance(instance, RoomFeature):
            return {
                "amenity": instance.amenity.key,
                "name": instance.amenity.name,
                "charge": instance.charge,
                "charge_label": instance.get_charge_display(),
                "charge_amount": instance.charge_amount,
            }
        return super().to_representation(instance)


class RoomFeatureChoiceSerializer(serializers.Serializer):
    key = serializers.CharField()
    name = serializers.CharField()
    category = serializers.CharField(source="category.name")


class RoomSerializer(serializers.ModelSerializer):
    property = OrgScopedRelatedField(queryset=Property.objects.all())
    property_name = serializers.CharField(source="property.name", read_only=True)
    unit = OrgScopedRelatedField(queryset=RentalUnit.objects.all(), allow_null=True, required=False)
    unit_code = serializers.CharField(source="unit.code", read_only=True, default=None)
    floor = OrgScopedRelatedField(queryset=Floor.objects.all(), allow_null=True, required=False)
    floor_number = serializers.IntegerField(
        write_only=True,
        required=False,
        allow_null=True,
        min_value=-5,
        max_value=200,
        help_text="Shortcut: the floor is created if the property does not have it yet.",
    )
    floor_name = serializers.SerializerMethodField()
    room_type_label = serializers.CharField(source="get_room_type_display", read_only=True)
    letting = serializers.ChoiceField(choices=Letting.choices, required=False)
    letting_label = serializers.SerializerMethodField()
    beds = serializers.SerializerMethodField()
    bed_count = serializers.IntegerField(write_only=True, required=False, min_value=1, max_value=12)
    bed_rent = serializers.IntegerField(write_only=True, required=False, min_value=0)
    features = RoomFeatureSerializer(many=True, required=False)
    extra_charges = serializers.SerializerMethodField()

    class Meta:
        model = Room
        fields = [
            "id",
            "property",
            "property_name",
            "unit",
            "unit_code",
            "floor",
            "floor_number",
            "floor_name",
            "floor_label",
            "number",
            "room_type",
            "room_type_label",
            "letting",
            "letting_label",
            "monthly_rent",
            "sharing",
            "is_ac",
            "has_attached_bath",
            "features",
            "extra_charges",
            "beds",
            "bed_count",
            "bed_rent",
            "archived_at",
            "created_at",
        ]
        read_only_fields = ["id", "floor_label", "archived_at", "created_at"]
        validators: list[Any] = []  # uniqueness is checked in validate() with a clear message

    def get_floor_name(self, obj: Room) -> str:
        return services.floor_name(obj)

    def get_letting_label(self, obj: Room) -> str:
        return services.room_letting_label(obj)

    @extend_schema_field(serializers.IntegerField())
    def get_extra_charges(self, obj: Room) -> int:
        """Paise per tenant per month added to the rent by extra-charge features."""
        return sum(f.charge_amount or 0 for f in obj.features.all() if f.charge == "extra")

    @extend_schema_field(BedSummarySerializer(many=True))
    def get_beds(self, obj: Room) -> list[dict[str, Any]]:
        beds = [b for b in obj.beds.all() if b.archived_at is None]
        return BedSummarySerializer(beds, many=True).data  # type: ignore[return-value]

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        _check_immutable_property(self, attrs, "A room")
        inst = self.instance
        prop = cast(Property, attrs.get("property", getattr(inst, "property", None)))
        unit = attrs["unit"] if "unit" in attrs else getattr(inst, "unit", None)
        services.check_same_property(prop, unit=unit, floor=attrs.get("floor"))
        if "floor_number" in attrs:
            number = attrs.pop("floor_number")
            attrs["floor"] = None if number is None else Floor(property=prop, number=number)
        if "floor" not in attrs and unit is not None and inst is None:
            attrs["floor"] = unit.floor

        default_letting = (
            Letting.WHOLE
            if unit is not None and unit.letting == Letting.WHOLE
            else Letting.BY_PARTS
        )
        letting = attrs.get("letting", getattr(inst, "letting", default_letting))
        attrs["letting"] = letting
        rent = attrs.get("monthly_rent", getattr(inst, "monthly_rent", None))
        services.check_room_letting(room_unit=unit, letting=letting, monthly_rent=rent)
        if inst is not None:
            services.check_room_letting_change(inst, letting)

        number = attrs.get("number", getattr(inst, "number", None))
        clash = Room.objects.filter(property=prop, unit=unit, number=number)
        if inst is not None:
            clash = clash.exclude(pk=inst.pk)
        if clash.exists():
            where = f" in {unit.code}" if unit is not None else ""
            raise serializers.ValidationError({"number": f"Room {number} already exists{where}."})
        if "room_type" not in attrs and inst is None:
            attrs["room_type"] = (
                Room.RoomType.PRIVATE if attrs.get("sharing") == 1 else Room.RoomType.SHARED
            )
        sharing = attrs.get("sharing", getattr(inst, "sharing", None))
        if inst is not None and "sharing" in attrs:
            services.check_sharing_change(inst, attrs["sharing"])
        bed_count = attrs.get("bed_count")
        if bed_count and sharing and bed_count > sharing:
            raise serializers.ValidationError(
                {"bed_count": f"A {sharing} sharing room can have at most {sharing} beds."}
            )
        if "features" in attrs:
            attrs["features"] = services.clean_room_features(attrs["features"])
        needs_bed_rent = (
            inst is None and letting == Letting.BY_PARTS and default_letting == Letting.BY_PARTS
        )
        if needs_bed_rent and "bed_rent" not in attrs:
            raise serializers.ValidationError({"bed_rent": "Monthly rent per bed is required."})
        return attrs

    @transaction.atomic
    def create(self, validated_data: dict[str, Any]) -> Room:
        bed_count = validated_data.pop("bed_count", None) or validated_data["sharing"]
        bed_rent = validated_data.pop("bed_rent", None)
        features = validated_data.pop("features", None)
        from apps.subscriptions.entitlements import check_can_add

        org = validated_data["organization"]
        check_can_add(org, "rooms")
        if bed_rent is not None:
            check_can_add(org, "beds", bed_count)
        resolve_floor(validated_data, validated_data.get("created_by"))
        room = Room.objects.create(**validated_data)
        if features:
            services.set_room_features(room, features, validated_data.get("created_by"))
        if services.can_hold_beds(room) is None and bed_rent is not None:
            Bed.objects.bulk_create(
                Bed(
                    organization=room.organization,
                    created_by=room.created_by,
                    room=room,
                    label=string.ascii_uppercase[i],
                    monthly_rent=bed_rent,
                )
                for i in range(bed_count)
            )
        return room

    @transaction.atomic
    def update(self, instance: Room, validated_data: dict[str, Any]) -> Room:
        validated_data.pop("bed_count", None)
        validated_data.pop("bed_rent", None)
        features = validated_data.pop("features", None)
        user = getattr(self.context.get("request"), "user", None)
        resolve_floor(validated_data, user)
        room = super().update(instance, validated_data)
        if features is not None:
            services.set_room_features(room, features, user)
        return room


class BedSerializer(serializers.ModelSerializer):
    room = OrgScopedRelatedField(queryset=Room.objects.select_related("property", "unit"))
    room_number = serializers.CharField(source="room.number", read_only=True)
    property_id = serializers.UUIDField(source="room.property_id", read_only=True)
    property_name = serializers.CharField(source="room.property.name", read_only=True)
    sharing = serializers.IntegerField(source="room.sharing", read_only=True)
    status_label = serializers.CharField(source="get_status_display", read_only=True)

    class Meta:
        model = Bed
        fields = [
            "id",
            "room",
            "room_number",
            "property_id",
            "property_name",
            "sharing",
            "label",
            "monthly_rent",
            "status",
            "status_label",
            "archived_at",
            "created_at",
        ]
        read_only_fields = ["id", "archived_at", "created_at"]
        validators: list[Any] = []

    def validate_status(self, value: str) -> str:
        if value not in MANUAL_BED_STATUSES:
            raise serializers.ValidationError(
                "Beds become occupied only through a tenant check-in."
            )
        if self.instance is not None and self.instance.status == Bed.Status.OCCUPIED:
            raise serializers.ValidationError("An occupied bed changes status at checkout.")
        return value

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        room = attrs.get("room", getattr(self.instance, "room", None))
        if self.instance is not None and "room" in attrs and attrs["room"] != self.instance.room:
            raise serializers.ValidationError({"room": "A bed cannot move room."})
        if self.instance is None and room is not None:
            problem = services.can_hold_beds(room)
            if problem:
                raise serializers.ValidationError({"room": problem})
            services.check_room_has_space(room)
            from apps.subscriptions.entitlements import check_can_add

            check_can_add(room.organization, "beds")
        label = attrs.get("label")
        if label and room is not None:
            clash = Bed.objects.filter(room=room, label=label)
            if self.instance is not None:
                clash = clash.exclude(pk=self.instance.pk)
            if clash.exists():
                raise serializers.ValidationError({"label": "This bed label already exists."})
        return attrs


class InventorySerializer(serializers.Serializer):
    """The whole structure of one property in one response (no request per room)."""

    floors = FloorSerializer(many=True)
    units = RentalUnitSerializer(many=True)
    rooms = RoomSerializer(many=True)


class LogoUploadSerializer(serializers.Serializer):
    image = serializers.ImageField(help_text="JPG, PNG or WebP up to 5 MB; square works best.")

    def validate_image(self, value: Any) -> Any:
        validate_upload(value, IMAGE_TYPES)
        return value


class LogoSerializer(serializers.Serializer):
    logo_url = serializers.CharField(allow_null=True)


class PropertyDocumentSerializer(serializers.ModelSerializer):
    kind_label = serializers.CharField(source="get_kind_display", read_only=True)
    display_title = serializers.SerializerMethodField()
    expiry = serializers.SerializerMethodField()
    expiry_label = serializers.SerializerMethodField()
    is_proof = serializers.SerializerMethodField()
    uploaded_by = serializers.CharField(source="created_by.full_name", read_only=True, default="")

    class Meta:
        model = PropertyDocument
        fields = [
            "id",
            "property",
            "kind",
            "kind_label",
            "title",
            "display_title",
            "file_name",
            "size_bytes",
            "content_type",
            "issued_on",
            "expires_on",
            "expiry",
            "expiry_label",
            "is_proof",
            "note",
            "uploaded_by",
            "created_at",
        ]
        read_only_fields = [
            "id",
            "property",
            "file_name",
            "size_bytes",
            "content_type",
            "created_at",
        ]

    def get_display_title(self, obj: PropertyDocument) -> str:
        return obj.title or obj.get_kind_display()

    def get_expiry(self, obj: PropertyDocument) -> str:
        return services.document_state(obj)[0]

    def get_expiry_label(self, obj: PropertyDocument) -> str:
        return services.document_state(obj)[1]

    def get_is_proof(self, obj: PropertyDocument) -> bool:
        from apps.properties.models import PROOF_KINDS

        return obj.kind in PROOF_KINDS

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        issued = attrs.get("issued_on", getattr(self.instance, "issued_on", None))
        expires = attrs.get("expires_on", getattr(self.instance, "expires_on", None))
        if issued and expires and expires < issued:
            raise serializers.ValidationError(
                {"expires_on": "The expiry date must be after the issue date."}
            )
        return attrs


class PropertyDocumentUploadSerializer(PropertyDocumentSerializer):
    file = serializers.FileField(write_only=True, help_text="PDF, JPG, PNG or WebP up to 5 MB")

    class Meta(PropertyDocumentSerializer.Meta):
        fields = [*PropertyDocumentSerializer.Meta.fields, "file"]

    def validate_file(self, value: Any) -> Any:
        self._content_type = validate_upload(value, DOCUMENT_TYPES)
        return value


class VerificationEventSerializer(serializers.ModelSerializer):
    status_label = serializers.CharField(source="get_status_display", read_only=True)
    by = serializers.SerializerMethodField()

    class Meta:
        model = VerificationEvent
        fields = ["id", "status", "status_label", "note", "by_platform", "by", "created_at"]
        read_only_fields = fields

    def get_by(self, obj: VerificationEvent) -> str:
        if obj.by_platform:
            return "PG Manager team"
        return obj.created_by.full_name if obj.created_by else ""


class SubmitVerificationSerializer(serializers.Serializer):
    note = serializers.CharField(max_length=1000, required=False, allow_blank=True, default="")


class RoomImportUploadSerializer(serializers.Serializer):
    file = serializers.FileField()
    commit = serializers.BooleanField(
        default=False, help_text="false = only check the file; true = add the rooms"
    )


class RoomImportRowSerializer(serializers.Serializer):
    row = serializers.IntegerField(help_text="Line in the file (the header is line 1)")
    room = serializers.CharField()
    flat = serializers.CharField()
    floor = serializers.IntegerField(allow_null=True)
    sharing = serializers.IntegerField(allow_null=True)
    rent_per_bed = serializers.IntegerField(allow_null=True)
    whole_room_rent = serializers.IntegerField(allow_null=True)
    problems = serializers.ListField(child=serializers.CharField())


class RoomImportResultSerializer(serializers.Serializer):
    rows = RoomImportRowSerializer(many=True)
    valid = serializers.IntegerField()
    invalid = serializers.IntegerField()
    beds = serializers.IntegerField()
    created = serializers.IntegerField()
