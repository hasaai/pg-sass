from django.db import models
from django.db.models import Q

from core.models import OrgScopedModel
from core.uploads import agreement_path


class Tenant(OrgScopedModel):
    """A resident. Only the ID type and last 4 digits are stored (data minimisation)."""

    class IdType(models.TextChoices):
        AADHAAR = "aadhaar", "Aadhaar"
        PAN = "pan", "PAN"
        PASSPORT = "passport", "Passport"
        DRIVING_LICENCE = "driving_licence", "Driving licence"
        VOTER_ID = "voter_id", "Voter ID"
        OTHER = "other", "Other"

    class Gender(models.TextChoices):
        MALE = "male", "Male"
        FEMALE = "female", "Female"
        OTHER = "other", "Other"

    full_name = models.CharField(max_length=150)
    phone = models.CharField(max_length=15)
    email = models.EmailField(blank=True)
    gender = models.CharField(max_length=10, choices=Gender.choices, blank=True)
    occupation = models.CharField(max_length=100, blank=True, help_text="Job or college")
    date_of_birth = models.DateField(null=True, blank=True)
    home_address = models.TextField(blank=True, help_text="Permanent address")
    id_type = models.CharField(max_length=20, choices=IdType.choices, blank=True)
    id_last4 = models.CharField(max_length=4, blank=True)
    emergency_contact_name = models.CharField(max_length=150, blank=True)
    emergency_contact_phone = models.CharField(max_length=15, blank=True)
    notes = models.TextField(blank=True)
    consent_given_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["full_name"]
        constraints = [
            models.UniqueConstraint(fields=["organization", "phone"], name="uniq_tenant_phone"),
        ]

    def __str__(self) -> str:
        return self.full_name


OPEN_STAY_STATUSES = ("active", "notice")


class Stay(OrgScopedModel):
    """A tenant renting one place from check-in to checkout.

    The place is exactly one of: a bed, a whole room, or a whole flat / portion
    (`unit`). `property` is always set so lists and reports filter on one column.
    """

    class Status(models.TextChoices):
        ACTIVE = "active", "Active"
        NOTICE = "notice", "On notice"
        CLOSED = "closed", "Checked out"

    tenant = models.ForeignKey(Tenant, on_delete=models.PROTECT, related_name="stays")
    property = models.ForeignKey(
        "properties.Property", on_delete=models.PROTECT, related_name="stays"
    )
    bed = models.ForeignKey(
        "properties.Bed", on_delete=models.PROTECT, related_name="stays", null=True, blank=True
    )
    room = models.ForeignKey(
        "properties.Room",
        on_delete=models.PROTECT,
        related_name="whole_stays",
        null=True,
        blank=True,
    )
    unit = models.ForeignKey(
        "properties.RentalUnit",
        on_delete=models.PROTECT,
        related_name="whole_stays",
        null=True,
        blank=True,
    )
    check_in = models.DateField()
    notice_date = models.DateField(null=True, blank=True)
    expected_checkout = models.DateField(null=True, blank=True)
    check_out = models.DateField(null=True, blank=True)
    monthly_rent = models.PositiveIntegerField(help_text="Paise")
    deposit_amount = models.PositiveIntegerField(default=0, help_text="Paise agreed")
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.ACTIVE)
    # Agreement terms
    notice_period_days = models.PositiveSmallIntegerField(default=30)
    lock_in_months = models.PositiveSmallIntegerField(default=0)
    agreement_end = models.DateField(null=True, blank=True)
    agreement_file = models.FileField(upload_to=agreement_path, blank=True)

    class Meta:
        ordering = ["-check_in"]
        constraints = [
            models.UniqueConstraint(
                fields=["bed"],
                condition=Q(status__in=OPEN_STAY_STATUSES),
                name="one_open_stay_per_bed",
            ),
            models.UniqueConstraint(
                fields=["room"],
                condition=Q(status__in=OPEN_STAY_STATUSES),
                name="one_open_stay_per_room",
            ),
            models.UniqueConstraint(
                fields=["unit"],
                condition=Q(status__in=OPEN_STAY_STATUSES),
                name="one_open_stay_per_unit",
            ),
            models.CheckConstraint(
                condition=(
                    Q(bed__isnull=False, room__isnull=True, unit__isnull=True)
                    | Q(bed__isnull=True, room__isnull=False, unit__isnull=True)
                    | Q(bed__isnull=True, room__isnull=True, unit__isnull=False)
                ),
                name="stay_has_one_place",
            ),
            models.UniqueConstraint(
                fields=["tenant"],
                condition=Q(status__in=OPEN_STAY_STATUSES),
                name="one_open_stay_per_tenant",
            ),
            models.CheckConstraint(
                condition=Q(check_out__isnull=True) | Q(check_out__gte=models.F("check_in")),
                name="checkout_after_checkin",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.tenant} in {self.bed or self.room or self.unit}"


class DepositTransaction(OrgScopedModel):
    """Every movement of a security deposit. The balance is always derived."""

    class Kind(models.TextChoices):
        COLLECTED = "collected", "Collected"
        DEDUCTED = "deducted", "Deducted"
        REFUNDED = "refunded", "Refunded"

    stay = models.ForeignKey(Stay, on_delete=models.PROTECT, related_name="deposit_transactions")
    kind = models.CharField(max_length=10, choices=Kind.choices)
    amount = models.PositiveIntegerField(help_text="Paise")
    date = models.DateField()
    note = models.CharField(max_length=255, blank=True)

    class Meta:
        ordering = ["date", "created_at"]
        constraints = [
            models.CheckConstraint(condition=Q(amount__gt=0), name="deposit_amount_positive"),
        ]

    def __str__(self) -> str:
        return f"{self.kind} {self.amount}"


def deposit_held(stay: Stay) -> int:
    held = 0
    for txn in stay.deposit_transactions.all():
        held += txn.amount if txn.kind == DepositTransaction.Kind.COLLECTED else -txn.amount
    return held
