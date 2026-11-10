"""Serializer fields that can only point at objects in the caller's organization."""

from __future__ import annotations

from typing import Any

from django.core.exceptions import ImproperlyConfigured
from django.db.models import QuerySet
from rest_framework import serializers


class OrgScopedRelatedField(serializers.PrimaryKeyRelatedField):
    """A foreign key input limited to the request's organization.

    An id from another organization is reported as "does not exist", exactly
    like an id that really does not exist.
    """

    def get_queryset(self) -> QuerySet[Any]:
        queryset = super().get_queryset()
        if queryset is None:
            raise ImproperlyConfigured("OrgScopedRelatedField needs a queryset.")
        request = self.context.get("request")
        organization = getattr(request, "organization", None)
        if organization is None:
            return queryset.none()
        from core.access import limit_to_properties

        queryset = queryset.filter(organization=organization)
        return limit_to_properties(queryset, getattr(request, "membership", None))
