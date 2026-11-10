from __future__ import annotations

import datetime as dt
from collections.abc import Collection
from typing import TYPE_CHECKING, Any

from django.db import transaction
from django.db.models import Q, Sum
from rest_framework import status
from rest_framework.exceptions import APIException

from apps.billing.models import Payment
from apps.billing.services import month_bounds
from apps.finance.models import Employee, Expense
from core import audit

if TYPE_CHECKING:
    from apps.accounts.models import User
    from apps.organizations.models import Organization


class SalaryAlreadyPaid(APIException):
    status_code = status.HTTP_409_CONFLICT
    default_detail = "This month's salary is already recorded."
    default_code = "salary_already_paid"


@transaction.atomic
def pay_salary(
    *,
    actor: User,
    employee: Employee,
    month: dt.date,
    amount: int | None,
    paid_on: dt.date,
    mode: str,
    reference: str = "",
) -> Expense:
    month = month.replace(day=1)
    Employee.objects.select_for_update().get(pk=employee.pk)
    if Expense.objects.filter(employee=employee, salary_month=month).exists():
        raise SalaryAlreadyPaid()
    expense = Expense.objects.create(
        organization=employee.organization,
        created_by=actor,
        property=employee.property,
        category=Expense.Category.SALARY,
        vendor=employee.full_name,
        description=f"Salary for {month:%B %Y} ({employee.role_title})",
        amount=employee.monthly_salary if amount is None else amount,
        paid_on=paid_on,
        mode=mode,
        reference=reference,
        employee=employee,
        salary_month=month,
    )
    audit.record(
        organization=employee.organization,
        actor=actor,
        action="salary.pay",
        obj=expense,
        employee=employee.pk,
        amount=expense.amount,
    )
    return expense


def finance_summary(
    *,
    organization: Organization,
    period: dt.date,
    property_id: Any = None,
    property_ids: Collection[Any] | None = None,
) -> dict[str, Any]:
    """Income (rent received) minus expenses for one calendar month.

    ``property_ids`` limits everything to those properties (a person with property access).
    """
    start, end, _ = month_bounds(period)
    payments = Payment.objects.for_org(organization).filter(received_on__range=(start, end))
    expenses = Expense.objects.for_org(organization).filter(paid_on__range=(start, end))
    employees = Employee.objects.for_org(organization).filter(is_active=True)
    if property_ids is not None:
        payments = payments.filter(invoice__stay__property_id__in=property_ids)
        expenses = expenses.filter(property_id__in=property_ids)
        employees = employees.filter(property_id__in=property_ids)
    if property_id:
        payments = payments.filter(invoice__stay__property_id=property_id)
        expenses = expenses.filter(property_id=property_id)
        employees = employees.filter(Q(property_id=property_id) | Q(property__isnull=True))
    income = payments.aggregate(s=Sum("amount"))["s"] or 0
    by_mode = {
        row["mode"]: row["total"]
        for row in payments.values("mode").annotate(total=Sum("amount")).order_by()
    }
    labels = dict(Expense.Category.choices)
    by_category = [
        {"category": row["category"], "label": labels[row["category"]], "total": row["total"]}
        for row in expenses.values("category").annotate(total=Sum("amount")).order_by("-total")
    ]
    spent = sum(row["total"] for row in by_category)
    paid_ids = set(
        Expense.objects.for_org(organization)
        .filter(salary_month=start, employee__isnull=False)
        .values_list("employee_id", flat=True)
    )
    salaries_due = [
        {
            "employee_id": str(e.id),
            "full_name": e.full_name,
            "role_title": e.role_title,
            "monthly_salary": e.monthly_salary,
            "pay_day": e.pay_day,
        }
        for e in employees.order_by("pay_day", "full_name")
        if e.id not in paid_ids
    ]
    return {
        "period": f"{start:%Y-%m}",
        "income": income,
        "income_by_mode": by_mode,
        "expenses": spent,
        "expenses_by_category": by_category,
        "net": income - spent,
        "salaries_due": salaries_due,
    }
