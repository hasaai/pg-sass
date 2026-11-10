"""Mobile codes, the SMS gateways the platform team switches on, and a log of sends."""

from __future__ import annotations

from django.conf import settings
from django.db import models

from core.models import UUIDModel


class SmsGateway(UUIDModel):
    """One SMS provider. Keys typed in the portal are stored encrypted in `credentials`
    (core.secret_box); a value in the environment (.env) is used when the portal has none."""

    class Code(models.TextChoices):
        CONSOLE = "console", "Test (Terminal)"
        APITXT = "apitxt", "APITxT"
        TWOFACTOR = "twofactor", "2Factor"
        FAST2SMS = "fast2sms", "Fast2SMS"

    code = models.CharField(max_length=20, choices=Code.choices, unique=True)
    position = models.PositiveSmallIntegerField(default=0, help_text="Tried in this order")
    is_enabled = models.BooleanField(default=False)
    last_ok_at = models.DateTimeField(null=True, blank=True)
    last_error_at = models.DateTimeField(null=True, blank=True)
    last_error = models.CharField(max_length=255, blank=True)
    credentials = models.TextField(blank=True, default="", help_text="Encrypted; never shown")

    class Meta:
        ordering = ["position", "code"]

    def __str__(self) -> str:
        return self.get_code_display()


class PhoneCode(UUIDModel):
    """A 6-digit code sent to a mobile. Only a keyed hash of the code is stored.

    `user` is empty for a sign-up or sign-in code: the account is found (or made) only
    after the code is typed correctly."""

    class Purpose(models.TextChoices):
        VERIFY = "verify", "Confirm a signed-in user's mobile"
        SIGNUP = "signup", "Sign up or sign in with the mobile"

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="phone_codes",
        null=True,
        blank=True,
    )
    purpose = models.CharField(max_length=10, choices=Purpose.choices, default=Purpose.VERIFY)
    phone = models.CharField(max_length=15)
    code_hash = models.CharField(max_length=64)
    expires_at = models.DateTimeField()
    tries_left = models.PositiveSmallIntegerField(default=5)
    used_at = models.DateTimeField(null=True, blank=True)
    cancelled = models.BooleanField(default=False)

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["phone", "created_at"])]


class SmsLog(UUIDModel):
    """Every send attempt, for the platform team. Never holds the code."""

    phone_masked = models.CharField(max_length=15)
    gateway = models.CharField(max_length=20, choices=SmsGateway.Code.choices)
    ok = models.BooleanField(default=False)
    reply_id = models.CharField(max_length=120, blank=True)
    error = models.CharField(max_length=255, blank=True)
    is_test = models.BooleanField(default=False)

    class Meta:
        ordering = ["-created_at"]
