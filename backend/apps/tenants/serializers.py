from __future__ import annotations

import datetime as dt
from typing import Any

from django.utils import timezone
from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from apps.properties.models import Bed, RentalUnit, Room
from apps.tenants import places
from apps.tenants.models import DepositTransaction, Stay, Tenant, deposit_held
from core.fields import OrgScopedRelatedField
from core.uploads import DOCUMENT_TYPES, validate_upload
from core.validators import normalize_indian_mobile


class StayBedSerializer(serializers.ModelSerializer):
    room_number = serializers.CharField(source="room.number", read_only=True)
    property_id = serializers.UUIDField(source="room.property_id", read_only=True)
    property_name = serializers.CharField(source="room.property.name", read_only=True)

    class Meta:
        model = Bed
        fields = ["id", "label", "room_number", "property_id", "property_name"]
        read_only_fields = fields


class StayPlaceSerializer(serializers.Serializer):
    """What the stay rents, with the words to show for it."""

    kind = serializers.ChoiceField(choices=places.PLACE_KINDS)
    kind_label = serializers.CharField()
    label = serializers.CharField()  # type: ignore[assignment]
    property_id = serializers.UUIDField()
    property_name = serializers.CharField()
    bed_id = serializers.UUIDField(allow_null=True)
    room_id = serializers.UUIDField(allow_null=True)
    unit_id = serializers.UUIDField(allow_null=True)


_KIND_LABELS = {"bed": "Bed", "room": "Whole room"}


def place_payload(stay: Stay) -> dict[str, Any]:
    from apps.properties.services import unit_letting_label

    kind = places.place_kind(stay)
    room = stay.bed.room if stay.bed is not None else stay.room
    return {
        "kind": kind,
        "kind_label": (
            unit_letting_label(stay.unit) if stay.unit is not None else _KIND_LABELS[kind]
        ),
        "label": places.place_label(stay),
        "property_id": stay.property_id,
        "property_name": stay.property.name,
        "bed_id": stay.bed_id,
        "room_id": room.pk if room is not None else None,
        "unit_id": stay.unit_id or (room.unit_id if room is not None else None),
    }


class PlaceMixin(serializers.Serializer):
    place = serializers.SerializerMethodField()
    status_label = serializers.CharField(source="get_status_display", read_only=True)

    @extend_schema_field(StayPlaceSerializer())
    def get_place(self, obj: Stay) -> dict[str, Any]:
        return place_payload(obj)


class CurrentStaySerializer(PlaceMixin, serializers.ModelSerializer):
    bed = StayBedSerializer(read_only=True, allow_null=True)

    class Meta:
        model = Stay
        fields = [
            "id",
            "status",
            "status_label",
            "check_in",
            "expected_checkout",
            "monthly_rent",
            "bed",
            "place",
        ]
        read_only_fields = fields


class TenantSerializer(serializers.ModelSerializer):
    current_stay = serializers.SerializerMethodField()
    consent = serializers.BooleanField(write_only=True, required=False)
    gender_label = serializers.CharField(source="get_gender_display", read_only=True)
    moved_out_on = serializers.SerializerMethodField()
    id_type_label = serializers.CharField(source="get_id_type_display", read_only=True)

    class Meta:
        model = Tenant
        fields = [
            "id",
            "full_name",
            "phone",
            "email",
            "gender",
            "gender_label",
            "occupation",
            "date_of_birth",
            "home_address",
            "id_type",
            "id_type_label",
            "id_last4",
            "emergency_contact_name",
            "emergency_contact_phone",
            "notes",
            "consent",
            "consent_given_at",
            "current_stay",
            "moved_out_on",
            "created_at",
        ]
        read_only_fields = ["id", "consent_given_at", "current_stay", "moved_out_on", "created_at"]

    @extend_schema_field(CurrentStaySerializer(allow_null=True))
    def get_current_stay(self, obj: Tenant) -> dict[str, Any] | None:
        open_stays = [s for s in obj.stays.all() if s.status != Stay.Status.CLOSED]
        return CurrentStaySerializer(open_stays[0]).data if open_stays else None

    @extend_schema_field(serializers.DateField(allow_null=True))
    def get_moved_out_on(self, obj: Tenant) -> dt.date | None:
        """The last checkout, when the tenant no longer stays here (else null)."""
        stays = list(obj.stays.all())
        if not stays or any(s.status != Stay.Status.CLOSED for s in stays):
            return None
        return max((s.check_out for s in stays if s.check_out), default=None)

    def validate_phone(self, value: str) -> str:
        phone = normalize_indian_mobile(value)
        request = self.context["request"]
        clash = Tenant.objects.filter(organization=request.organization, phone=phone)
        if self.instance is not None:
            clash = clash.exclude(pk=self.instance.pk)
        if clash.exists():
            raise serializers.ValidationError("A tenant with this phone number already exists.")
        return phone

    def validate_emergency_contact_phone(self, value: str) -> str:
        return normalize_indian_mobile(value) if value else value

    def validate_id_last4(self, value: str) -> str:
        if value and (len(value) != 4 or not value.isalnum()):
            raise serializers.ValidationError("Enter only the last 4 characters of the ID.")
        return value.upper()

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        consent = attrs.pop("consent", None)
        if self.instance is None and not consent:
            raise serializers.ValidationError(
                {"consent": "The tenant must agree to how their data is used."}
            )
        if consent and (self.instance is None or self.instance.consent_given_at is None):
            attrs["consent_given_at"] = timezone.now()
        return attrs


class DepositTransactionSerializer(serializers.ModelSerializer):
    class Meta:
        model = DepositTransaction
        fields = ["id", "kind", "amount", "date", "note", "created_at"]
        read_only_fields = fields


class TenantSummaryCountsSerializer(serializers.Serializer):
    all = serializers.IntegerField()
    active = serializers.IntegerField()
    notice = serializers.IntegerField()
    past = serializers.IntegerField()
    never = serializers.IntegerField()


class TenantSummarySerializer(serializers.ModelSerializer):
    class Meta:
        model = Tenant
        fields = ["id", "full_name", "phone"]
        read_only_fields = fields


class StaySerializer(PlaceMixin, serializers.ModelSerializer):
    tenant = TenantSummarySerializer(read_only=True)
    bed = StayBedSerializer(read_only=True, allow_null=True)
    deposit_held = serializers.SerializerMethodField()
    deposit_transactions = DepositTransactionSerializer(many=True, read_only=True)

    class Meta:
        model = Stay
        fields = [
            "id",
            "tenant",
            "bed",
            "place",
            "status",
            "status_label",
            "check_in",
            "notice_date",
            "expected_checkout",
            "check_out",
            "monthly_rent",
            "deposit_amount",
            "deposit_held",
            "deposit_transactions",
            "notice_period_days",
            "lock_in_months",
            "agreement_end",
            "has_agreement_file",
            "created_at",
        ]
        read_only_fields = fields

    has_agreement_file = serializers.SerializerMethodField()

    @extend_schema_field(serializers.BooleanField())
    def get_has_agreement_file(self, obj: Stay) -> bool:
        return bool(obj.agreement_file)

    @extend_schema_field(serializers.IntegerField())
    def get_deposit_held(self, obj: Stay) -> int:
        return deposit_held(obj)


def _not_future(value: dt.date) -> None:
    if value > timezone.localdate() + dt.timedelta(days=60):
        raise serializers.ValidationError("Date is too far in the future.")


class PlaceChoiceSerializer(serializers.Serializer):
    """Exactly one of bed, room (rented whole) or unit (flat / portion rented whole)."""

    bed = OrgScopedRelatedField(queryset=Bed.objects.all(), required=False, allow_null=True)
    room = OrgScopedRelatedField(queryset=Room.objects.all(), required=False, allow_null=True)
    unit = OrgScopedRelatedField(queryset=RentalUnit.objects.all(), required=False, allow_null=True)

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        chosen = [attrs.get(k) for k in ("bed", "room", "unit") if attrs.get(k) is not None]
        if len(chosen) != 1:
            raise serializers.ValidationError(
                {"place": "Choose one place: a bed, a whole room or a whole flat."}
            )
        attrs["place"] = chosen[0]
        return attrs


class CheckInSerializer(PlaceChoiceSerializer):
    tenant = OrgScopedRelatedField(queryset=Tenant.objects.all())
    check_in = serializers.DateField(validators=[_not_future])
    monthly_rent = serializers.IntegerField(min_value=0, required=False)
    deposit_amount = serializers.IntegerField(min_value=0, default=0)
    deposit_collected = serializers.IntegerField(min_value=0, default=0)
    notice_period_days = serializers.IntegerField(min_value=0, max_value=180, default=30)
    lock_in_months = serializers.IntegerField(min_value=0, max_value=36, default=0)
    agreement_end = serializers.DateField(required=False, allow_null=True)


class StayTermsSerializer(serializers.ModelSerializer):
    class Meta:
        model = Stay
        fields = ["notice_period_days", "lock_in_months", "agreement_end"]
        extra_kwargs = {
            "notice_period_days": {"max_value": 180},
            "lock_in_months": {"max_value": 36},
        }


class AgreementUploadSerializer(serializers.Serializer):
    file = serializers.FileField()

    def validate_file(self, value: Any) -> Any:
        validate_upload(value, DOCUMENT_TYPES)
        return value


class DepositCollectSerializer(serializers.Serializer):
    amount = serializers.IntegerField(min_value=1)
    date = serializers.DateField(validators=[_not_future])
    note = serializers.CharField(max_length=255, required=False, allow_blank=True)


class StayNoticeSerializer(serializers.Serializer):
    notice_date = serializers.DateField()
    expected_checkout = serializers.DateField()


class TransferSerializer(PlaceChoiceSerializer):
    monthly_rent = serializers.IntegerField(min_value=0, required=False)


class DeductionSerializer(serializers.Serializer):
    reason = serializers.CharField(max_length=255)
    amount = serializers.IntegerField(min_value=1)


class CheckoutSerializer(serializers.Serializer):
    check_out = serializers.DateField(validators=[_not_future])
    deductions = DeductionSerializer(many=True, required=False, default=list)


class FreePlaceSerializer(serializers.Serializer):
    kind = serializers.ChoiceField(choices=places.PLACE_KINDS)
    id = serializers.UUIDField()
    label = serializers.CharField()  # type: ignore[assignment]
    detail = serializers.CharField()
    monthly_rent = serializers.IntegerField()
    deposit = serializers.IntegerField(allow_null=True)
    reserved = serializers.BooleanField()
