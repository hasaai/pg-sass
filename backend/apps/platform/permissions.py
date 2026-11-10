from __future__ import annotations

from typing import Any

from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import BasePermission
from rest_framework.request import Request

from apps.platform.access import user_platform_permissions


class NotPlatformAdmin(PermissionDenied):
    default_detail = "Only the PG Manager platform team can open this."
    default_code = "not_platform_admin"


class PlatformRoleTooNarrow(PermissionDenied):
    default_detail = "Your role on the PG Manager team does not include this. Ask a Platform owner."
    default_code = "insufficient_role"


def required_platform_permission(view: Any, request: Request) -> str | tuple[str, ...] | None:
    rules: dict[str, Any] = dict(getattr(view, "platform_permission_map", {}) or {})
    for key in (getattr(view, "action", None), (request.method or "").upper(), "*"):
        if key and key in rules:
            return rules[key]
    return None


class IsPlatformAdmin(BasePermission):
    """The PG Manager team only, and only with the permission the view names.

    Views declare ``platform_permission_map``: action (viewsets) or HTTP method -> a code
    from apps/platform/access.py, or a tuple meaning "any of these"; ``"*"`` is the
    fallback. An action with no entry is refused. These endpoints span every business, so
    they never read the X-Organization header and never use org scoping.
    """

    def has_permission(self, request: Request, view: Any) -> bool:
        if getattr(view, (request.method or "").lower(), None) is None:
            return True  # no handler: let the view answer 405
        granted = user_platform_permissions(request.user)
        if not granted:
            raise NotPlatformAdmin()
        required = required_platform_permission(view, request)
        codes = (required,) if isinstance(required, str) else (required or ())
        if not any(code in granted for code in codes):
            raise PlatformRoleTooNarrow()
        return True
