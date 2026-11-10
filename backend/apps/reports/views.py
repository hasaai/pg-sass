"""Dashboard numbers and exports. Read-only; everything is scoped to one organization."""

from __future__ import annotations

import csv
import datetime as dt
from typing import Any

from django.db.models import Count, F, Q, Sum
from django.http import HttpResponse
from django.utils import timezone
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import mixins, serializers
from rest_framework.request import Request
from rest_framework.response import Response

from apps.billing.models import Invoice, Payment
from apps.billing.services import month_bounds
from apps.listings.models import Enquiry
from apps.operations.models import Complaint
from apps.properties.models import Bed
from apps.tenants import places
from apps.tenants.models import Stay
from apps.tenants.places import PLACE_RELATED
from core.access import has_permission, visible
from core.models import AuditLog
from core.params import month_param, uuid_param
from core.views import OrgScopedAPIView, OrgScopedViewSet


def _period(request: Request) -> dt.date:
    return month_param(request) or timezone.localdate().replace(day=1)


class DashboardView(OrgScopedAPIView):
    permission_map = {
        "GET": "dashboard.view",
    }

    @extend_schema(
        parameters=[
            OpenApiParameter("period", str, required=False, description="YYYY-MM"),
            OpenApiParameter("property", str, required=False),
        ],
        responses=OpenApiTypes.OBJECT,
    )
    def get(self, request: Request) -> Response:
        prop = uuid_param(request, "property")
        start, end, _ = month_bounds(_period(request))
        today = timezone.localdate()

        beds = visible(Bed, request)
        stays = visible(Stay, request)
        complaints = visible(Complaint, request)
        enquiries = visible(Enquiry, request)
        invoices = visible(Invoice, request).exclude(status=Invoice.Status.VOID)
        payments = visible(Payment, request)
        if prop:
            beds = beds.filter(room__property_id=prop)
            stays = stays.filter(property_id=prop)
            complaints = complaints.filter(property_id=prop)
            enquiries = enquiries.filter(listing__property_id=prop)
            invoices = invoices.filter(stay__property_id=prop)
            payments = payments.filter(invoice__stay__property_id=prop)

        bed_counts = {s: 0 for s in Bed.Status.values}
        for row in beds.values("status").annotate(n=Count("id")):
            bed_counts[row["status"]] = row["n"]
        usable = sum(bed_counts.values()) - bed_counts[Bed.Status.BLOCKED]
        occupancy = round(100 * bed_counts[Bed.Status.OCCUPIED] / usable, 1) if usable else 0.0

        upcoming = (
            stays.filter(status=Stay.Status.NOTICE, expected_checkout__lte=today + dt.timedelta(30))
            .select_related("tenant", *PLACE_RELATED)
            .order_by("expected_checkout")[:5]
        )
        data: dict[str, Any] = {
            "period": f"{start:%Y-%m}",
            "beds": {**bed_counts, "total": sum(bed_counts.values())},
            "occupancy_rate": occupancy,
            "tenants": {
                "current": stays.filter(status__in=["active", "notice"]).count(),
                "on_notice": stays.filter(status=Stay.Status.NOTICE).count(),
                "checked_in_this_period": stays.filter(check_in__range=(start, end)).count(),
            },
            "upcoming_checkouts": [
                {
                    "stay_id": str(s.id),
                    "tenant_name": s.tenant.full_name,
                    "property_name": s.property.name,
                    "room_number": places.room_number(s),
                    "bed_label": places.bed_label(s),
                    "place_label": places.place_label(s),
                    "expected_checkout": s.expected_checkout,
                }
                for s in upcoming
            ],
            "complaints": {
                "open": complaints.filter(status__in=["open", "in_progress"]).count(),
                "high_priority_open": complaints.filter(
                    status__in=["open", "in_progress"], priority="high"
                ).count(),
            },
            "money": None,
        }
        if has_permission(request.membership, "rent.view"):  # type: ignore[attr-defined]
            outstanding = invoices.filter(paid__lt=F("total"))
            overdue = outstanding.filter(due_date__lt=today)
            sums = outstanding.aggregate(
                balance=Sum(F("total") - F("paid")),
                overdue=Sum(F("total") - F("paid"), filter=Q(due_date__lt=today)),
            )
            data["money"] = {
                "invoiced": invoices.filter(period=start).aggregate(s=Sum("total"))["s"] or 0,
                "collected": payments.filter(received_on__range=(start, end)).aggregate(
                    s=Sum("amount")
                )["s"]
                or 0,
                "outstanding": sums["balance"] or 0,
                "overdue": sums["overdue"] or 0,
                "overdue_invoices": overdue.count(),
            }
            data["enquiries"] = {"new": enquiries.filter(status=Enquiry.Status.NEW).count()}
        return Response(data)


def _rupees(paise: int) -> str:
    return f"{paise // 100}.{paise % 100:02d}"


class CollectionsCsvView(OrgScopedAPIView):
    feature = "reports_download"
    permission_map = {
        "GET": "reports.download",
    }

    @extend_schema(
        parameters=[OpenApiParameter("period", str, required=False, description="YYYY-MM")],
        responses={(200, "text/csv"): OpenApiTypes.STR},
    )
    def get(self, request: Request) -> HttpResponse:
        start, end, _ = month_bounds(_period(request))
        payments = (
            visible(Payment, request)
            .filter(received_on__range=(start, end))
            .select_related(
                "invoice__stay__tenant", *(f"invoice__stay__{p}" for p in PLACE_RELATED)
            )
            .order_by("received_on", "receipt_number")
        )
        response = HttpResponse(content_type="text/csv")
        response["Content-Disposition"] = f'attachment; filename="collections-{start:%Y-%m}.csv"'
        writer = csv.writer(response)
        writer.writerow(
            [
                "Receipt",
                "Date",
                "Tenant",
                "Phone",
                "Property",
                "Room",
                "Bed",
                "Invoice",
                "Mode",
                "Reference",
                "Amount (INR)",
            ]
        )
        for p in payments:
            stay = p.invoice.stay
            writer.writerow(
                [
                    p.receipt_number,
                    p.received_on.isoformat(),
                    _safe(stay.tenant.full_name),
                    stay.tenant.phone,
                    _safe(stay.property.name),
                    places.room_number(stay),
                    places.bed_label(stay),
                    p.invoice.number,
                    p.get_mode_display(),
                    _safe(p.reference),
                    _rupees(p.amount),
                ]
            )
        return response


def _safe(value: str) -> str:
    """Stop spreadsheet formula injection from user-entered text."""
    return "'" + value if value[:1] in ("=", "+", "-", "@", "\t", "\r") else value


class AuditLogSerializer(serializers.ModelSerializer):
    actor = serializers.CharField(source="created_by.full_name", default=None, read_only=True)

    class Meta:
        model = AuditLog
        fields = ["id", "action", "object_type", "object_id", "data", "actor", "created_at"]
        read_only_fields = fields


class AuditLogViewSet(mixins.ListModelMixin, OrgScopedViewSet):
    serializer_class = AuditLogSerializer
    queryset = AuditLog.objects.select_related("created_by")
    permission_map = {
        "list": "activity.view",
    }
