from __future__ import annotations

import datetime as dt

from django.utils import timezone
from rest_framework import serializers

from apps.finance.models import Employee, Expense
from apps.properties.models import Property
from core.fields import OrgScopedRelatedField
from core.validators import normalize_indian_mobile


def _not_future(value: dt.date) -> None:
    if value > timezone.localdate():
        raise serializers.ValidationError("This date is in the future.")


class EmployeeSerializer(serializers.ModelSerializer):
    property = OrgScopedRelatedField(
        queryset=Property.objects.all(), required=False, allow_null=True
    )
    property_name = serializers.CharField(source="property.name", read_only=True, default=None)

    class Meta:
        model = Employee
        fields = [
            "id",
            "full_name",
            "phone",
            "role_title",
            "property",
            "property_name",
            "monthly_salary",
            "pay_day",
            "joined_on",
            "is_active",
            "created_at",
        ]
        read_only_fields = ["id", "created_at"]

    def validate_phone(self, value: str) -> str:
        return normalize_indian_mobile(value) if value else value


class ExpenseSerializer(serializers.ModelSerializer):
    property = OrgScopedRelatedField(
        queryset=Property.objects.all(), required=False, allow_null=True
    )
    property_name = serializers.CharField(source="property.name", read_only=True, default=None)
    category_label = serializers.CharField(source="get_category_display", read_only=True)
    employee_name = serializers.CharField(source="employee.full_name", read_only=True, default=None)

    class Meta:
        model = Expense
        fields = [
            "id",
            "property",
            "property_name",
            "category",
            "category_label",
            "vendor",
            "description",
            "amount",
            "paid_on",
            "mode",
            "reference",
            "employee",
            "employee_name",
            "salary_month",
            "created_at",
        ]
        read_only_fields = ["id", "employee", "salary_month", "created_at"]
        extra_kwargs = {
            "amount": {"min_value": 1, "max_value": 100_000_000},
            "paid_on": {"validators": [_not_future]},
        }

    def validate_category(self, value: str) -> str:
        if value == Expense.Category.SALARY and (
            self.instance is None or not self.instance.employee
        ):
            raise serializers.ValidationError(
                "Record salaries from Staff → Pay salary so each month is counted once."
            )
        return value


class PaySalarySerializer(serializers.Serializer):
    month = serializers.RegexField(r"^\d{4}-(0[1-9]|1[0-2])$", help_text="YYYY-MM")
    amount = serializers.IntegerField(min_value=1, required=False, help_text="Paise")
    paid_on = serializers.DateField(validators=[_not_future])
    mode = serializers.ChoiceField(choices=Expense.Mode.choices, default=Expense.Mode.UPI)
    reference = serializers.CharField(max_length=100, required=False, allow_blank=True)

    def validate_month(self, value: str) -> dt.date:
        return dt.datetime.strptime(value, "%Y-%m").date()


class CategoryTotalSerializer(serializers.Serializer):
    category = serializers.CharField()
    label = serializers.CharField()  # type: ignore[assignment]  # API field, not Field.label
    total = serializers.IntegerField()


class SalaryDueSerializer(serializers.Serializer):
    employee_id = serializers.UUIDField()
    full_name = serializers.CharField()
    role_title = serializers.CharField()
    monthly_salary = serializers.IntegerField()
    pay_day = serializers.IntegerField()


class FinanceSummarySerializer(serializers.Serializer):
    period = serializers.CharField()
    income = serializers.IntegerField()
    income_by_mode = serializers.DictField(child=serializers.IntegerField())
    expenses = serializers.IntegerField()
    expenses_by_category = CategoryTotalSerializer(many=True)
    net = serializers.IntegerField()
    salaries_due = SalaryDueSerializer(many=True)
