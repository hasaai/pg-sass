"""Who may call each organization-scoped endpoint, computed from the views' permission maps.

Used by test_access.py to compare against role_access.json, the reviewed contract.
"""

from __future__ import annotations

from collections.abc import Iterator
from typing import Any

from django.urls import URLPattern, URLResolver, get_resolver
from rest_framework.test import APIRequestFactory

from core.access import role_permissions
from core.permissions import OrgRolePermission, required_permission

ROLES = ("owner", "manager", "accountant", "staff")


def _walk(patterns: list[Any], prefix: str = "") -> Iterator[tuple[str, URLPattern]]:
    for p in patterns:
        if isinstance(p, URLResolver):
            yield from _walk(p.url_patterns, prefix + str(p.pattern))
        elif isinstance(p, URLPattern):
            yield prefix + str(p.pattern), p


def endpoints() -> dict[str, dict[str, Any]]:
    """{"<url name> <METHOD>": {"view", "action", "permission"}} for every org endpoint."""
    rf = APIRequestFactory()
    found: dict[str, dict[str, Any]] = {}
    for route, pattern in _walk(get_resolver().url_patterns):
        cls = getattr(pattern.callback, "cls", None)
        if cls is None or OrgRolePermission not in getattr(cls, "permission_classes", []):
            continue
        actions = getattr(pattern.callback, "actions", None)
        pairs = (
            list(actions.items())
            if actions
            else [(m, None) for m in ("get", "post", "put", "patch", "delete") if hasattr(cls, m)]
        )
        for method, action in pairs:
            if method in ("head", "options"):
                continue  # HEAD follows GET; OPTIONS describes the endpoint
            view = cls()
            view.action = action
            perm = required_permission(view, getattr(rf, method)("/"))
            found[f"{pattern.name or route} {method.upper()}"] = {
                "view": cls.__name__,
                "action": action,
                "permission": perm,
            }
    return found


def roles_allowed(permission: str | None) -> list[str]:
    if permission is None:
        return []
    return [r for r in ROLES if permission in role_permissions(r)]


def current_contract() -> dict[str, list[str]]:
    return {key: roles_allowed(e["permission"]) for key, e in sorted(endpoints().items())}


PLATFORM_ROLES = ("platform_owner", "finance_admin", "support_agent", "verification_reviewer")


def platform_endpoints() -> dict[str, Any]:
    """{"<url name> <METHOD>": permission} for every PG Manager team endpoint."""
    from apps.platform.permissions import IsPlatformAdmin, required_platform_permission

    rf = APIRequestFactory()
    found: dict[str, Any] = {}
    for route, pattern in _walk(get_resolver().url_patterns):
        cls = getattr(pattern.callback, "cls", None)
        if cls is None or IsPlatformAdmin not in getattr(cls, "permission_classes", []):
            continue
        actions = getattr(pattern.callback, "actions", None)
        pairs = (
            list(actions.items())
            if actions
            else [(m, None) for m in ("get", "post", "put", "patch", "delete") if hasattr(cls, m)]
        )
        for method, action in pairs:
            if method in ("head", "options"):
                continue
            view = cls()
            view.action = action
            if not hasattr(view, action or method):
                continue
            found[f"{pattern.name or route} {method.upper()}"] = required_platform_permission(
                view, getattr(rf, method)("/")
            )
    return found


def platform_contract() -> dict[str, list[str]]:
    from apps.platform.access import platform_role_permissions

    out: dict[str, list[str]] = {}
    for key, perm in sorted(platform_endpoints().items()):
        codes = (perm,) if isinstance(perm, str) else (perm or ())
        out[key] = [
            r for r in PLATFORM_ROLES if any(c in platform_role_permissions(r) for c in codes)
        ]
    return out
