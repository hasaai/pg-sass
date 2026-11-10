"""Money going out: expenses, vendor payouts and staff salaries."""

from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.db.models import Q

from core.models import OrgScopedModel


class Employee(OrgScopedModel):
    """Staff on the payroll (cook, cleaner, warden...). They do not need an app login."""

    full_name = models.CharField(max_length=150)
    phone = models.CharField(max_length=15, blank=True)
    role_title = models.CharField(max_length=60, help_text="e.g. Cook, Housekeeping, Warden")
    property = models.ForeignKey(
        "properties.Property",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="employees",
    )
    monthly_salary = models.PositiveIntegerField(help_text="Paise")
    pay_day = models.PositiveSmallIntegerField(
        default=1, validators=[MinValueValidator(1), MaxValueValidator(28)]
    )
    joined_on = models.DateField(null=True, blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["full_name"]

    def __str__(self) -> str:
        return f"{self.full_name} ({self.role_title})"


class Expense(OrgScopedModel):
    class Category(models.TextChoices):
        SALARY = "salary", "Staff salary"
        ELECTRICITY = "electricity", "Electricity"
        WATER = "water", "Water"
        GROCERIES = "groceries", "Groceries and food"
        MAINTENANCE = "maintenance", "Repairs and maintenance"
        HOUSEKEEPING = "housekeeping", "Housekeeping supplies"
        INTERNET = "internet", "Internet"
        RENT = "rent", "Building rent / lease"
        TAX = "tax", "Taxes and fees"
        MARKETING = "marketing", "Marketing"
        OTHER = "other", "Other"

    class Mode(models.TextChoices):
        UPI = "upi", "UPI"
        CASH = "cash", "Cash"
        BANK_TRANSFER = "bank_transfer", "Bank transfer"
        CARD = "card", "Card"
        CHEQUE = "cheque", "Cheque"

    property = models.ForeignKey(
        "properties.Property",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="expenses",
        help_text="Empty = shared across properties",
    )
    category = models.CharField(max_length=20, choices=Category.choices)
    vendor = models.CharField(max_length=150, blank=True)
    description = models.CharField(max_length=255, blank=True)
    amount = models.PositiveIntegerField(help_text="Paise")
    paid_on = models.DateField()
    mode = models.CharField(max_length=20, choices=Mode.choices, default=Mode.UPI)
    reference = models.CharField(max_length=100, blank=True)
    employee = models.ForeignKey(
        Employee, on_delete=models.PROTECT, null=True, blank=True, related_name="salary_payments"
    )
    salary_month = models.DateField(null=True, blank=True, help_text="First day of the month paid")

    class Meta:
        ordering = ["-paid_on", "-created_at"]
        constraints = [
            models.CheckConstraint(condition=Q(amount__gt=0), name="expense_amount_positive"),
            models.UniqueConstraint(
                fields=["employee", "salary_month"],
                condition=Q(employee__isnull=False),
                name="one_salary_per_employee_month",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.get_category_display()} {self.amount}"
