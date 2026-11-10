from django.conf import settings
from django.db import models

from core.models import OrgScopedModel


class Complaint(OrgScopedModel):
    class Category(models.TextChoices):
        ELECTRICAL = "electrical", "Electrical"
        PLUMBING = "plumbing", "Plumbing"
        CLEANING = "cleaning", "Cleaning"
        WIFI = "wifi", "Wi-Fi"
        FOOD = "food", "Food"
        FURNITURE = "furniture", "Furniture"
        SECURITY = "security", "Security"
        OTHER = "other", "Other"

    class Priority(models.TextChoices):
        LOW = "low", "Low"
        MEDIUM = "medium", "Medium"
        HIGH = "high", "High"

    class Status(models.TextChoices):
        OPEN = "open", "Open"
        IN_PROGRESS = "in_progress", "In progress"
        RESOLVED = "resolved", "Resolved"
        CLOSED = "closed", "Closed"

    property = models.ForeignKey(
        "properties.Property", on_delete=models.PROTECT, related_name="complaints"
    )
    tenant = models.ForeignKey(
        "tenants.Tenant",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="complaints",
    )
    category = models.CharField(max_length=20, choices=Category.choices)
    title = models.CharField(max_length=150)
    description = models.TextField(blank=True)
    priority = models.CharField(max_length=10, choices=Priority.choices, default=Priority.MEDIUM)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.OPEN)
    assignee = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="+",
    )
    resolved_at = models.DateTimeField(null=True, blank=True)
    resolution_note = models.TextField(blank=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return self.title


class Notice(OrgScopedModel):
    property = models.ForeignKey(
        "properties.Property",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="notices",
        help_text="Empty = all properties",
    )
    title = models.CharField(max_length=150)
    body = models.TextField()
    is_pinned = models.BooleanField(default=False)

    class Meta:
        ordering = ["-is_pinned", "-created_at"]

    def __str__(self) -> str:
        return self.title
