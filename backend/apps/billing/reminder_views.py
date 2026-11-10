from typing import Any, cast

from django.utils import timezone
from drf_spectacular.utils import extend_schema
from rest_framework import serializers, status
from rest_framework.request import Request
from rest_framework.response import Response

from apps.accounts.models import User
from apps.billing import reminders
from apps.billing.models import Invoice, RentReminder
from apps.tenants import places
from core.fields import OrgScopedRelatedField
from core.views import OrgScopedAPIView


class DueReminderSerializer(serializers.Serializer):
    invoice_id = serializers.UUIDField()
    invoice_number = serializers.CharField()
    period = serializers.DateField()
    due_date = serializers.DateField()
    balance = serializers.IntegerField()
    days_overdue = serializers.IntegerField()
    tenant_id = serializers.UUIDField()
    tenant_name = serializers.CharField()
    tenant_phone = serializers.CharField()
    tenant_email = serializers.CharField()
    property_name = serializers.CharField()
    room_number = serializers.CharField()
    bed_label = serializers.CharField()
    place_label = serializers.CharField()
    message = serializers.CharField()
    whatsapp_url = serializers.CharField()
    last_reminded_at = serializers.DateTimeField(allow_null=True)


class LogReminderSerializer(serializers.Serializer):
    invoice = OrgScopedRelatedField(queryset=Invoice.objects.all())
    channel = serializers.ChoiceField(
        choices=[RentReminder.Channel.WHATSAPP, RentReminder.Channel.SMS]
    )


class EmailRemindersSerializer(serializers.Serializer):
    invoices = OrgScopedRelatedField(queryset=Invoice.objects.all(), many=True)


class EmailResultSerializer(serializers.Serializer):
    sent = serializers.IntegerField()
    skipped_recent = serializers.IntegerField()
    no_email = serializers.IntegerField()
    failed = serializers.IntegerField()


class DueRemindersView(OrgScopedAPIView):
    feature = "reminders"
    permission_map = {"GET": "rent.collect"}

    @extend_schema(responses=DueReminderSerializer(many=True))
    def get(self, request: Request) -> Response:
        today = timezone.localdate()
        rows: list[dict[str, Any]] = []
        for inv in reminders.due_invoices(request.organization):  # type: ignore[attr-defined]
            stay = inv.stay
            rows.append(
                {
                    "invoice_id": inv.id,
                    "invoice_number": inv.number,
                    "period": inv.period,
                    "due_date": inv.due_date,
                    "balance": inv.balance,
                    "days_overdue": max(0, (today - inv.due_date).days),
                    "tenant_id": stay.tenant_id,
                    "tenant_name": stay.tenant.full_name,
                    "tenant_phone": stay.tenant.phone,
                    "tenant_email": stay.tenant.email,
                    "property_name": stay.property.name,
                    "room_number": places.room_number(stay),
                    "bed_label": places.bed_label(stay),
                    "place_label": places.place_label(stay),
                    "message": reminders.message_for(inv),
                    "whatsapp_url": reminders.whatsapp_url(inv),
                    "last_reminded_at": inv.last_reminded_at,  # type: ignore[attr-defined]
                }
            )
        return Response(DueReminderSerializer(rows, many=True).data)


class LogReminderView(OrgScopedAPIView):
    """Record that a WhatsApp/SMS reminder was sent from the operator's own phone."""

    feature = "reminders"

    permission_map = {"POST": "rent.collect"}

    @extend_schema(request=LogReminderSerializer, responses={201: None})
    def post(self, request: Request) -> Response:
        payload = LogReminderSerializer(data=request.data, context={"request": request})
        payload.is_valid(raise_exception=True)
        reminders.log(
            payload.validated_data["invoice"],
            payload.validated_data["channel"],
            cast(User, request.user),
        )
        return Response({"status": "logged"}, status=status.HTTP_201_CREATED)


class EmailRemindersView(OrgScopedAPIView):
    feature = "reminders"
    permission_map = {"POST": "rent.collect"}

    @extend_schema(request=EmailRemindersSerializer, responses=EmailResultSerializer)
    def post(self, request: Request) -> Response:
        payload = EmailRemindersSerializer(data=request.data, context={"request": request})
        payload.is_valid(raise_exception=True)
        results = {"sent": 0, "skipped_recent": 0, "no_email": 0, "failed": 0}
        for invoice in payload.validated_data["invoices"]:
            if invoice.balance <= 0:
                continue
            results[reminders.send_email(invoice, request.user)] += 1  # type: ignore[arg-type]
        return Response(results)
