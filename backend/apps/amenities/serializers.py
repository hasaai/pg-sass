from __future__ import annotations

from typing import Any

from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from apps.amenities import services
from apps.amenities.models import Amenity, PropertyAmenity
from apps.properties.models import Room
from core.fields import OrgScopedRelatedField

# ---------- catalog ----------


class AttributeOptionField(serializers.ListField):
    child = serializers.CharField()


class AmenityAttributeSerializer(serializers.Serializer):
    key = serializers.CharField()
    label = serializers.CharField()  # type: ignore[assignment]  # API field, not Field.label
    type = serializers.ChoiceField(choices=["choice", "multi", "int", "bool"])
    options = serializers.ListField(child=AttributeOptionField(), required=False)
    min = serializers.IntegerField(required=False)
    max = serializers.IntegerField(required=False)
    unit = serializers.CharField(required=False)


class CatalogAmenitySerializer(serializers.ModelSerializer):
    attributes = AmenityAttributeSerializer(many=True, read_only=True)
    property_types = serializers.ListField(child=serializers.CharField(), read_only=True)
    aliases = serializers.ListField(child=serializers.CharField(), read_only=True)

    class Meta:
        model = Amenity
        fields = [
            "key",
            "name",
            "property_types",
            "supports_sharing",
            "supports_charge",
            "supports_quantity",
            "supports_rooms",
            "attributes",
            "aliases",
            "is_filterable",
        ]


class CatalogCategorySerializer(serializers.Serializer):
    key = serializers.CharField()
    name = serializers.CharField()
    amenities = CatalogAmenitySerializer(many=True)


class ChoiceSerializer(serializers.Serializer):
    value = serializers.CharField()
    label = serializers.CharField()  # type: ignore[assignment]  # API field, not Field.label


class CatalogSerializer(serializers.Serializer):
    property_types = ChoiceSerializer(many=True)
    categories = CatalogCategorySerializer(many=True)


# ---------- a property's amenities ----------


class PropertyAmenitySerializer(serializers.ModelSerializer):
    amenity = serializers.CharField(source="amenity.key")
    name = serializers.CharField(source="amenity.name")
    category = serializers.CharField(source="amenity.category.key")
    category_name = serializers.CharField(source="amenity.category.name")
    rooms = serializers.PrimaryKeyRelatedField(many=True, read_only=True)  # type: ignore[var-annotated]
    room_numbers = serializers.SerializerMethodField()
    charge_label = serializers.SerializerMethodField()
    detail_labels = serializers.SerializerMethodField()
    details = serializers.DictField(read_only=True)

    class Meta:
        model = PropertyAmenity
        fields = [
            "id",
            "amenity",
            "name",
            "category",
            "category_name",
            "status",
            "sharing",
            "charge",
            "charge_amount",
            "charge_period",
            "quantity",
            "level",
            "rooms",
            "room_numbers",
            "details",
            "note",
            "charge_label",
            "detail_labels",
        ]
        read_only_fields = fields

    def get_room_numbers(self, obj: PropertyAmenity) -> list[str]:
        return sorted(room.number for room in obj.rooms.all())

    def get_charge_label(self, obj: PropertyAmenity) -> str:
        return services.describe_charge(obj)

    def get_detail_labels(self, obj: PropertyAmenity) -> list[str]:
        return services.describe_details(obj)


class AmenityAssignmentSerializer(serializers.Serializer):
    """One amenity the owner picked, with its details."""

    amenity = serializers.SlugRelatedField(
        slug_field="key", queryset=Amenity.objects.filter(is_active=True)
    )
    status = serializers.ChoiceField(
        choices=PropertyAmenity.Status.choices, default=PropertyAmenity.Status.AVAILABLE
    )
    sharing = serializers.ChoiceField(
        choices=PropertyAmenity.Sharing.choices, allow_blank=True, required=False
    )
    charge = serializers.ChoiceField(
        choices=PropertyAmenity.Charge.choices, allow_blank=True, required=False
    )
    charge_amount = serializers.IntegerField(
        min_value=0, allow_null=True, required=False, help_text="Paise"
    )
    charge_period = serializers.ChoiceField(
        choices=PropertyAmenity.ChargePeriod.choices, allow_blank=True, required=False
    )
    quantity = serializers.IntegerField(
        min_value=1, max_value=1000, allow_null=True, required=False
    )
    level = serializers.ChoiceField(
        choices=PropertyAmenity.Level.choices, default=PropertyAmenity.Level.PROPERTY
    )
    rooms = OrgScopedRelatedField(queryset=Room.objects.all(), many=True, required=False)
    details = serializers.DictField(required=False, default=dict)
    note = serializers.CharField(max_length=200, allow_blank=True, required=False, default="")

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        errors = services.validate_assignment(self.context["property"], attrs["amenity"], attrs)
        if errors:
            raise serializers.ValidationError(errors)
        return attrs


class AmenitySetSerializer(serializers.Serializer):
    """The complete set of a property's amenities. Anything not listed is removed."""

    assignments = AmenityAssignmentSerializer(many=True)

    def validate_assignments(self, items: list[dict[str, Any]]) -> list[dict[str, Any]]:
        if len(items) > 150:
            raise serializers.ValidationError("Too many amenities.")
        seen: set[str] = set()
        for item in items:
            key = item["amenity"].key
            if key in seen:
                raise serializers.ValidationError(f"{item['amenity'].name} is listed twice.")
            seen.add(key)
        return items


class PublicAmenitySerializer(serializers.Serializer):
    """What a visitor sees: only available amenities, with how they are offered."""

    key = serializers.CharField(source="amenity.key")
    name = serializers.CharField(source="amenity.name")
    category = serializers.CharField(source="amenity.category.key")
    category_name = serializers.CharField(source="amenity.category.name")
    sharing = serializers.CharField()
    charge = serializers.CharField()
    charge_label = serializers.SerializerMethodField()
    detail_labels = serializers.SerializerMethodField()
    in_some_rooms = serializers.SerializerMethodField()

    def get_charge_label(self, obj: PropertyAmenity) -> str:
        return services.describe_charge(obj)

    def get_detail_labels(self, obj: PropertyAmenity) -> list[str]:
        return services.describe_details(obj)

    @extend_schema_field(serializers.BooleanField())
    def get_in_some_rooms(self, obj: PropertyAmenity) -> bool:
        return obj.level == PropertyAmenity.Level.ROOM
