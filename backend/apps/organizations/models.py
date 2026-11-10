from django.conf import settings
from django.db import models

from core.models import OrgScopedModel, UUIDModel
from core.uploads import organization_logo_path


class Organization(UUIDModel):
    """One PG or co-living operator business. Every business row belongs to one."""

    class Status(models.TextChoices):
        ACTIVE = "active", "Active"
        SUSPENDED = "suspended", "Suspended"

    name = models.CharField(max_length=150)
    slug = models.SlugField(max_length=80, unique=True)
    contact_phone = models.CharField(max_length=20, blank=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.ACTIVE)
    logo = models.ImageField(upload_to=organization_logo_path, blank=True)
    # Keys from core.features.FEATURES switched off by the platform team.
    disabled_features = models.JSONField(default=list, blank=True)
    suspended_reason = models.CharField(max_length=255, blank=True)

    class Meta:
        ordering = ["name"]

    def __str__(self) -> str:
        return self.name


class Role(models.TextChoices):
    """What each role may do is in core/access.py (ROLE_PERMISSIONS)."""

    OWNER = "owner", "Owner"
    MANAGER = "manager", "Manager"
    ACCOUNTANT = "accountant", "Accountant"
    STAFF = "staff", "Caretaker"


ALL_ROLES = frozenset(Role.values)
OWNER_ONLY = frozenset({Role.OWNER.value})
OWNER_AND_MANAGER = frozenset({Role.OWNER.value, Role.MANAGER.value})


class Membership(OrgScopedModel):
    """A user's role inside one organization."""

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="memberships"
    )
    role = models.CharField(max_length=20, choices=Role.choices)
    is_active = models.BooleanField(default=True)
    # This person's own changes to their role's permissions (codes from core/access.py).
    extra_permissions = models.JSONField(default=list, blank=True)
    removed_permissions = models.JSONField(default=list, blank=True)
    # The properties this person works in; empty means all of them (core/access.py).
    properties = models.ManyToManyField("properties.Property", blank=True, related_name="+")

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["organization", "user"], name="uniq_membership_org_user"
            ),
        ]
        indexes = [models.Index(fields=["user", "is_active"])]

    def __str__(self) -> str:
        return f"{self.user_id} in {self.organization_id} as {self.role}"

    @property
    def permissions(self) -> frozenset[str]:
        from core.access import effective_permissions

        return effective_permissions(self)
