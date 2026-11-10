"""Permission checks for organization-scoped endpoints (see core/access.py)."""

from __future__ import annotations

from typing import Any

from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import BasePermission
from rest_framework.request import Request

from core.access import has_permission
from core.tenancy import resolve_membership


class InsufficientRole(PermissionDenied):
    default_detail = "You do not have access to this. Ask the business owner."
    default_code = "insufficient_role"


class FeatureDisabled(PermissionDenied):
    default_detail = (
        "This feature is switched off for your business. Contact support to turn it on."
    )
    default_code = "feature_disabled"


class PhoneNotVerified(PermissionDenied):
    default_detail = "Confirm your mobile number to continue."
    default_code = "phone_not_verified"


class OrgRolePermission(BasePermission):
    """Resolve the organization, then check the caller's permission.

    The view declares ``permission_map``: action name (viewsets) or HTTP method (plain
    views) -> permission code from core/access.py; the key ``"*"`` is the fallback. An
    action with no entry and no fallback is denied, so a new action is closed until it
    names a permission.
    """

    def has_permission(self, request: Request, view: Any) -> bool:
        if getattr(view, (request.method or "").lower(), None) is None:
            return True  # no handler: let the view answer 405 Method Not Allowed
        membership = resolve_membership(request)
        if getattr(request.user, "phone_verified_at", None) is None:
            raise PhoneNotVerified()
        feature = getattr(view, "feature", None)
        if feature:
            from apps.subscriptions.entitlements import check_feature

            check_feature(membership.organization, feature)
        required = required_permission(view, request)
        if required is None or not has_permission(membership, required):
            raise InsufficientRole()
        return True


def get_permission_map(view: Any) -> dict[str, str]:
    getter = getattr(view, "get_permission_map", None)
    if callable(getter):
        return dict(getter())
    return dict(getattr(view, "permission_map", {}) or {})


def required_permission(view: Any, request: Request) -> str | None:
    rules = get_permission_map(view)
    key = getattr(view, "action", None) or request.method or ""
    if key in rules:
        return rules[key]
    method_key = (request.method or "").upper()
    if method_key in rules:
        return rules[method_key]
    return rules.get("*")
