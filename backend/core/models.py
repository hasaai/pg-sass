"""Base models shared by every business-domain app.

Rule: every model that holds an organization's data inherits from
``OrgScopedModel``. A test (core/tests/test_model_rules.py) fails the build if a
concrete model in ``apps.*`` skips it without being listed as global.
"""

from __future__ import annotations

import uuid
from typing import TYPE_CHECKING, Any

from django.conf import settings
from django.db import models

if TYPE_CHECKING:
    from apps.organizations.models import Organization


class UUIDModel(models.Model):
    """UUID primary key (not guessable from URLs) plus timestamps."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


class OrgScopedQuerySet(models.QuerySet[Any]):
    def for_org(self, organization: Organization) -> OrgScopedQuerySet:
        return self.filter(organization=organization)


class OrgScopedManager(models.Manager[Any]):
    def get_queryset(self) -> OrgScopedQuerySet:
        return OrgScopedQuerySet(self.model, using=self._db)

    def for_org(self, organization: Organization) -> OrgScopedQuerySet:
        return self.get_queryset().for_org(organization)


class OrgScopedModel(UUIDModel):
    """A row that belongs to exactly one organization."""

    organization = models.ForeignKey(
        "organizations.Organization",
        on_delete=models.PROTECT,
        related_name="+",
        db_index=True,
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="+",
    )

    objects = OrgScopedManager()

    class Meta:
        abstract = True


class AuditLog(OrgScopedModel):
    """Append-only record of sensitive changes: money, checkouts, roles."""

    action = models.CharField(max_length=60)
    object_type = models.CharField(max_length=60)
    object_id = models.CharField(max_length=64)
    data = models.JSONField(default=dict, blank=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["organization", "object_type", "object_id"])]

    def __str__(self) -> str:
        return f"{self.action} {self.object_type}:{self.object_id}"
