"""Write audit entries from service functions."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from django.db import models

from core.models import AuditLog

if TYPE_CHECKING:
    from apps.accounts.models import User
    from apps.organizations.models import Organization


def record(
    *,
    organization: Organization,
    actor: User | None,
    action: str,
    obj: models.Model,
    **data: Any,
) -> AuditLog:
    return AuditLog.objects.create(
        organization=organization,
        created_by=actor,
        action=action,
        object_type=obj._meta.label_lower,
        object_id=str(obj.pk),
        data={k: _plain(v) for k, v in data.items()},
    )


def _plain(value: Any) -> Any:
    if isinstance(value, str | int | float | bool) or value is None:
        return value
    if isinstance(value, list | tuple | set | frozenset):
        return [_plain(v) for v in value]
    if isinstance(value, dict):
        return {str(k): _plain(v) for k, v in value.items()}
    return str(value)
