"""Membership plans (platform-wide), each business's subscription, and plan payments."""

from __future__ import annotations

from django.db import models

from core.models import OrgScopedModel, UUIDModel


class Plan(UUIDModel):
    """A membership plan the platform team sells (Free, Basic, Pro, Business …)."""

    key = models.SlugField(max_length=40, unique=True)
    name = models.CharField(max_length=60)
    description = models.CharField(max_length=255, blank=True)
    price_month = models.PositiveIntegerField(default=0, help_text="Paise per month")
    price_year = models.PositiveIntegerField(default=0, help_text="Paise per year")
    # {"properties": 1, "beds": 25, ...}; a missing key or null = no limit.
    limits = models.JSONField(default=dict, blank=True)
    # Feature keys that are ON in this plan (apps.subscriptions.catalog.FEATURES).
    features = models.JSONField(default=list, blank=True)
    # {"ekyc_checks": 50}; missing = 0.
    allowances = models.JSONField(default=dict, blank=True)
    trial_days = models.PositiveSmallIntegerField(
        default=0, help_text="Days a new business gets this plan free (0 = no trial)"
    )
    is_public = models.BooleanField(default=True, help_text="Owners can choose and pay for it")
    is_active = models.BooleanField(default=True)
    position = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ["position", "price_month"]

    def __str__(self) -> str:
        return self.name


class Subscription(OrgScopedModel):
    """The plan one business is on. Exactly one per business."""

    class Status(models.TextChoices):
        TRIAL = "trial", "Free trial"
        ACTIVE = "active", "Active"
        EXPIRED = "expired", "Expired"

    plan = models.ForeignKey(Plan, on_delete=models.PROTECT, related_name="subscriptions")
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.ACTIVE)
    starts_on = models.DateField()
    ends_on = models.DateField(null=True, blank=True, help_text="Empty = does not end")
    # Custom numbers for this one business, e.g. {"beds": 60}.
    limit_overrides = models.JSONField(default=dict, blank=True)
    note = models.CharField(max_length=255, blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["organization"], name="one_subscription_per_business")
        ]

    def __str__(self) -> str:
        return f"{self.organization_id} on {self.plan_id}"


class SubscriptionEvent(OrgScopedModel):
    """History of plan changes for one business."""

    class Kind(models.TextChoices):
        TRIAL = "trial", "Trial started"
        ASSIGNED = "assigned", "Plan set by the platform team"
        PAID = "paid", "Paid online"
        EXPIRED = "expired", "Plan ended"

    kind = models.CharField(max_length=10, choices=Kind.choices)
    from_plan = models.ForeignKey(
        Plan, on_delete=models.PROTECT, related_name="+", null=True, blank=True
    )
    to_plan = models.ForeignKey(Plan, on_delete=models.PROTECT, related_name="+")
    ends_on = models.DateField(null=True, blank=True)
    note = models.CharField(max_length=255, blank=True)

    class Meta:
        ordering = ["-created_at"]


class PaymentGateway(UUIDModel):
    """A payment gateway the platform can collect plan payments with. Keys live only in
    environment variables; this row only says whether it is offered."""

    class Code(models.TextChoices):
        RAZORPAY = "razorpay", "Razorpay"
        CASHFREE = "cashfree", "Cashfree"
        PAYTM = "paytm", "Paytm"

    code = models.CharField(max_length=20, choices=Code.choices, unique=True)
    is_enabled = models.BooleanField(default=False)
    is_default = models.BooleanField(default=False)
    position = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ["position", "code"]

    def __str__(self) -> str:
        return self.get_code_display()


class PlanPayment(OrgScopedModel):
    """One attempt to pay for a plan through a gateway."""

    class Period(models.TextChoices):
        MONTH = "month", "1 month"
        YEAR = "year", "1 year"

    class Status(models.TextChoices):
        CREATED = "created", "Not paid yet"
        PAID = "paid", "Paid"
        FAILED = "failed", "Failed"

    plan = models.ForeignKey(Plan, on_delete=models.PROTECT, related_name="payments")
    period = models.CharField(max_length=5, choices=Period.choices)
    amount = models.PositiveIntegerField(help_text="Paise")
    gateway = models.CharField(max_length=20, choices=PaymentGateway.Code.choices)
    test_mode = models.BooleanField(default=True)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.CREATED)
    gateway_order_id = models.CharField(max_length=100, db_index=True)
    gateway_payment_id = models.CharField(max_length=100, blank=True)
    paid_at = models.DateTimeField(null=True, blank=True)
    failure_reason = models.CharField(max_length=255, blank=True)

    class Meta:
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["gateway", "gateway_order_id"], name="uniq_gateway_order"
            )
        ]
