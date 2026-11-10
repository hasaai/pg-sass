from django.db import models
from django.db.models import Q

from core.models import OrgScopedModel


class DocumentCounter(OrgScopedModel):
    """Gap-free running numbers per organization (invoice and receipt numbers)."""

    name = models.CharField(max_length=30)
    value = models.PositiveIntegerField(default=0)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["organization", "name"], name="uniq_counter"),
        ]


class Invoice(OrgScopedModel):
    class Status(models.TextChoices):
        ISSUED = "issued", "Issued"
        PARTIALLY_PAID = "partially_paid", "Partially paid"
        PAID = "paid", "Paid"
        VOID = "void", "Void"

    stay = models.ForeignKey("tenants.Stay", on_delete=models.PROTECT, related_name="invoices")
    number = models.CharField(max_length=30)
    period = models.DateField(help_text="First day of the billed month")
    issue_date = models.DateField()
    due_date = models.DateField()
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.ISSUED)
    total = models.PositiveIntegerField(default=0, help_text="Paise")
    paid = models.PositiveIntegerField(default=0, help_text="Paise")
    void_reason = models.CharField(max_length=255, blank=True)

    class Meta:
        ordering = ["-period", "number"]
        constraints = [
            models.UniqueConstraint(
                fields=["stay", "period"],
                condition=~Q(status="void"),
                name="one_invoice_per_stay_period",
            ),
            models.UniqueConstraint(fields=["organization", "number"], name="uniq_invoice_no"),
            models.CheckConstraint(condition=Q(paid__lte=models.F("total")), name="paid_lte_total"),
        ]

    @property
    def balance(self) -> int:
        return 0 if self.status == self.Status.VOID else self.total - self.paid

    def __str__(self) -> str:
        return self.number


class InvoiceLine(OrgScopedModel):
    class Kind(models.TextChoices):
        RENT = "rent", "Rent"
        ELECTRICITY = "electricity", "Electricity"
        FOOD = "food", "Food"
        LATE_FEE = "late_fee", "Late fee"
        OTHER = "other", "Other"

    invoice = models.ForeignKey(Invoice, on_delete=models.CASCADE, related_name="lines")
    kind = models.CharField(max_length=20, choices=Kind.choices)
    description = models.CharField(max_length=255)
    amount = models.PositiveIntegerField(help_text="Paise")

    class Meta:
        ordering = ["created_at"]
        constraints = [
            models.CheckConstraint(condition=Q(amount__gt=0), name="line_amount_positive"),
        ]


class Payment(OrgScopedModel):
    class Mode(models.TextChoices):
        UPI = "upi", "UPI"
        CASH = "cash", "Cash"
        BANK_TRANSFER = "bank_transfer", "Bank transfer"
        CARD = "card", "Card"
        CHEQUE = "cheque", "Cheque"

    invoice = models.ForeignKey(Invoice, on_delete=models.PROTECT, related_name="payments")
    receipt_number = models.CharField(max_length=30)
    amount = models.PositiveIntegerField(help_text="Paise")
    mode = models.CharField(max_length=20, choices=Mode.choices)
    reference = models.CharField(max_length=100, blank=True)
    received_on = models.DateField()
    # NULL (not "") when absent, so the partial unique index ignores keyless payments.
    idempotency_key = models.CharField(max_length=80, null=True, blank=True)  # noqa: DJ001

    class Meta:
        ordering = ["-received_on", "-created_at"]
        constraints = [
            models.CheckConstraint(condition=Q(amount__gt=0), name="payment_amount_positive"),
            models.UniqueConstraint(
                fields=["organization", "idempotency_key"],
                condition=Q(idempotency_key__isnull=False),
                name="uniq_payment_idempotency",
            ),
            models.UniqueConstraint(fields=["organization", "receipt_number"], name="uniq_receipt"),
        ]

    def __str__(self) -> str:
        return self.receipt_number


class RentReminder(OrgScopedModel):
    """A reminder sent (or opened in WhatsApp) for an unpaid invoice."""

    class Channel(models.TextChoices):
        WHATSAPP = "whatsapp", "WhatsApp"
        EMAIL = "email", "Email"
        SMS = "sms", "SMS"

    invoice = models.ForeignKey(Invoice, on_delete=models.CASCADE, related_name="reminders")
    channel = models.CharField(max_length=10, choices=Channel.choices)
    automatic = models.BooleanField(default=False)

    class Meta:
        ordering = ["-created_at"]
