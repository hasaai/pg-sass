import csv
from typing import Any

from django.db.models import QuerySet
from django.http import HttpResponse
from django.utils import timezone
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, extend_schema, extend_schema_view
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.request import Request
from rest_framework.response import Response

from apps.billing.models import Payment
from apps.billing.services import month_bounds
from apps.finance import services
from apps.finance.models import Employee, Expense
from apps.finance.serializers import (
    EmployeeSerializer,
    ExpenseSerializer,
    FinanceSummarySerializer,
    PaySalarySerializer,
)
from apps.tenants.places import PLACE_RELATED
from core.access import allowed_property_ids, visible
from core.pagination import ordered_by
from core.params import choice_param, month_param, uuid_param
from core.views import OrgScopedAPIView, OrgScopedModelViewSet


@extend_schema_view(
    list=extend_schema(
        parameters=[
            OpenApiParameter("period", str, required=False, description="YYYY-MM"),
            OpenApiParameter("property", str, required=False),
            OpenApiParameter("category", str, required=False, enum=Expense.Category.values),
        ]
    )
)
class ExpenseViewSet(OrgScopedModelViewSet):
    feature = "finance"
    serializer_class = ExpenseSerializer
    queryset = Expense.objects.select_related("property", "employee")
    pagination_class = ordered_by("-paid_on", "-created_at")
    view_permission = "expenses.view"
    manage_permission = "expenses.manage"

    def get_queryset(self) -> QuerySet[Any]:
        queryset = super().get_queryset()
        period = month_param(self.request)
        prop = uuid_param(self.request, "property")
        category = choice_param(self.request, "category", Expense.Category.values)
        if period:
            start, end, _ = month_bounds(period)
            queryset = queryset.filter(paid_on__range=(start, end))
        if prop:
            queryset = queryset.filter(property_id=prop)
        if category:
            queryset = queryset.filter(category=category)
        return queryset


class EmployeeViewSet(OrgScopedModelViewSet):
    feature = "staff"
    serializer_class = EmployeeSerializer
    queryset = Employee.objects.select_related("property")
    pagination_class = ordered_by("full_name", "id")
    view_permission = "salaries.manage"
    manage_permission = "salaries.manage"
    permission_map = {"pay": "salaries.manage"}

    @extend_schema(request=PaySalarySerializer, responses={201: ExpenseSerializer})
    @action(detail=True, methods=["post"])
    def pay(self, request: Request, pk: str | None = None) -> Response:
        """Record this month's salary payout (once per employee per month)."""
        employee = self.get_object()
        payload = PaySalarySerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        data = payload.validated_data
        expense = services.pay_salary(
            actor=request.user,  # type: ignore[arg-type]
            employee=employee,
            month=data["month"],
            amount=data.get("amount"),
            paid_on=data["paid_on"],
            mode=data["mode"],
            reference=data.get("reference", ""),
        )
        return Response(ExpenseSerializer(expense).data, status=status.HTTP_201_CREATED)


class FinanceSummaryView(OrgScopedAPIView):
    feature = "finance"
    permission_map = {"GET": "expenses.view"}

    @extend_schema(
        parameters=[
            OpenApiParameter("period", str, required=False, description="YYYY-MM"),
            OpenApiParameter("property", str, required=False),
        ],
        responses=FinanceSummarySerializer,
    )
    def get(self, request: Request) -> Response:
        period = month_param(request) or timezone.localdate().replace(day=1)
        return Response(
            services.finance_summary(
                organization=request.organization,  # type: ignore[attr-defined]
                period=period,
                property_id=uuid_param(request, "property"),
                property_ids=allowed_property_ids(request.membership),  # type: ignore[attr-defined]
            )
        )


def _rupees(paise: int) -> str:
    sign = "-" if paise < 0 else ""
    paise = abs(paise)
    return f"{sign}{paise // 100}.{paise % 100:02d}"


def _safe(value: str) -> str:
    return "'" + value if value[:1] in ("=", "+", "-", "@", "\t", "\r") else value


class MonthlyReportCsvView(OrgScopedAPIView):
    """Every rupee in and out for a month, one row each, for the accountant."""

    feature = "finance"

    permission_map = {"GET": "reports.download"}

    @extend_schema(
        parameters=[OpenApiParameter("period", str, required=False, description="YYYY-MM")],
        responses={(200, "text/csv"): OpenApiTypes.STR},
    )
    def get(self, request: Request) -> HttpResponse:
        from apps.subscriptions.entitlements import check_feature

        check_feature(request.organization, "reports_download")  # type: ignore[attr-defined]
        start, end, _ = month_bounds(month_param(request) or timezone.localdate().replace(day=1))
        response = HttpResponse(content_type="text/csv")
        response["Content-Disposition"] = f'attachment; filename="monthly-report-{start:%Y-%m}.csv"'
        writer = csv.writer(response)
        writer.writerow(
            [
                "Date",
                "Type",
                "Category",
                "Party",
                "Property",
                "Details",
                "Mode",
                "Reference",
                "In (INR)",
                "Out (INR)",
            ]
        )
        payments = (
            visible(Payment, request)
            .filter(received_on__range=(start, end))
            .select_related(
                "invoice__stay__tenant", *(f"invoice__stay__{p}" for p in PLACE_RELATED)
            )
        )
        rows: list[tuple[Any, ...]] = []
        for p in payments:
            stay = p.invoice.stay
            rows.append(
                (
                    p.received_on,
                    "Income",
                    "Rent",
                    stay.tenant.full_name,
                    stay.property.name,
                    f"{p.invoice.number} / {p.receipt_number}",
                    p.get_mode_display(),
                    p.reference,
                    p.amount,
                    0,
                )
            )
        for e in (
            visible(Expense, request).filter(paid_on__range=(start, end)).select_related("property")
        ):
            rows.append(
                (
                    e.paid_on,
                    "Expense",
                    e.get_category_display(),
                    e.vendor,
                    e.property.name if e.property else "All properties",
                    e.description,
                    e.get_mode_display(),
                    e.reference,
                    0,
                    e.amount,
                )
            )
        total_in = total_out = 0
        for row in sorted(rows, key=lambda r: r[0]):
            date, kind, cat, party, prop, details, mode, ref, money_in, money_out = row
            total_in += money_in
            total_out += money_out
            writer.writerow(
                [
                    date.isoformat(),
                    kind,
                    cat,
                    _safe(party),
                    _safe(prop),
                    _safe(details),
                    mode,
                    _safe(ref),
                    _rupees(money_in) if money_in else "",
                    _rupees(money_out) if money_out else "",
                ]
            )
        writer.writerow([])
        writer.writerow(
            ["", "Total", "", "", "", "", "", "", _rupees(total_in), _rupees(total_out)]
        )
        writer.writerow(
            ["", "Net (in - out)", "", "", "", "", "", "", _rupees(total_in - total_out), ""]
        )
        return response
