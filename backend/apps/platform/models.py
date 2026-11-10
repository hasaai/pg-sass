from django.conf import settings
from django.db import models

from core.models import UUIDModel


class PlatformRole(models.TextChoices):
    """What each role may do is in apps/platform/access.py."""

    PLATFORM_OWNER = "platform_owner", "Platform owner"
    FINANCE_ADMIN = "finance_admin", "Finance admin"
    SUPPORT_AGENT = "support_agent", "Support agent"
    VERIFICATION_REVIEWER = "verification_reviewer", "Verification reviewer"


class PlatformStaff(UUIDModel):
    """A person on the PG Manager team (the user also has ``is_staff``)."""

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="platform_staff"
    )
    role = models.CharField(max_length=30, choices=PlatformRole.choices)
    extra_permissions = models.JSONField(default=list, blank=True)
    removed_permissions = models.JSONField(default=list, blank=True)

    class Meta:
        verbose_name_plural = "platform staff"

    def __str__(self) -> str:
        return f"{self.user_id} as {self.role}"

    @property
    def permissions(self) -> frozenset[str]:
        from apps.platform.access import staff_permissions

        return staff_permissions(self)


class PlatformEvent(UUIDModel):
    """Changes to the platform team itself (who is on it, roles, ticks). Append-only."""

    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name="+"
    )
    action = models.CharField(max_length=60)
    target = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name="+"
    )
    data = models.JSONField(default=dict, blank=True)

    class Meta:
        ordering = ["-created_at"]
