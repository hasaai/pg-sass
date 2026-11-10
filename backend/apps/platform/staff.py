"""Rules for the PG Manager team itself: who is on it, their role and ticks."""

from __future__ import annotations

from collections.abc import Collection
from typing import TYPE_CHECKING, Any

from django.db import transaction
from rest_framework import status
from rest_framework.exceptions import APIException, ValidationError

from apps.platform.access import (
    PLATFORM_CODES,
    PLATFORM_LABELS,
    platform_role_permissions,
    user_platform_permissions,
)
from apps.platform.models import PlatformEvent, PlatformRole, PlatformStaff

if TYPE_CHECKING:
    from apps.accounts.models import User

OWNER = PlatformRole.PLATFORM_OWNER.value


class StaffRuleViolation(APIException):
    status_code = status.HTTP_409_CONFLICT
    default_detail = "This change is not allowed."
    default_code = "staff_rule_violation"

    def __init__(self, detail: str, code: str) -> None:
        super().__init__(detail=detail, code=code)


def _snapshot(staff: PlatformStaff) -> dict[str, Any]:
    return {
        "role": staff.role,
        "extra": sorted(staff.extra_permissions or []),
        "removed": sorted(staff.removed_permissions or []),
    }


def _ensure_other_owner(staff: PlatformStaff) -> None:
    if staff.role != OWNER:
        return
    others = (
        PlatformStaff.objects.select_for_update()
        .filter(role=OWNER, user__is_active=True, user__is_staff=True)
        .exclude(pk=staff.pk)
    )
    if not others.exists():
        raise StaffRuleViolation(
            "The PG Manager team must keep at least one Platform owner.", code="last_owner"
        )


def _forget(user: User) -> None:
    user.__dict__.pop("_platform_permissions", None)


@transaction.atomic
def set_access(
    *,
    staff: PlatformStaff,
    actor: User,
    role: str | None = None,
    permissions: Collection[str] | None = None,
    event: str = "staff.access",
) -> PlatformStaff:
    """Change a team member's role and ticks (the full list), with the same rules as the
    business Team screen: not yourself, not more than you have, owners only by owners."""
    if staff.user_id == actor.pk and event == "staff.access":
        raise StaffRuleViolation("You cannot change your own access.", code="own_access")
    mine = user_platform_permissions(actor)
    actor_is_owner = PlatformStaff.objects.filter(user=actor, role=OWNER).exists()
    new_role = role or staff.role
    is_new = staff._state.adding
    if not is_new and staff.role == OWNER and new_role != OWNER:
        _ensure_other_owner(staff)
    if not actor_is_owner and (new_role == OWNER or staff.role == OWNER):
        raise StaffRuleViolation(
            "Only a Platform owner can make or change a Platform owner.", code="beyond_own_access"
        )
    old = None if is_new else _snapshot(staff)
    base = platform_role_permissions(new_role)
    if new_role == OWNER:
        extra, removed = [], []
    elif permissions is None:  # keep the person's own changes (also on a role change)
        extra = list(staff.extra_permissions or [])
        removed = list(staff.removed_permissions or [])
    else:
        unknown = set(permissions) - PLATFORM_CODES
        if unknown:
            raise StaffRuleViolation(
                f"Unknown access: {', '.join(sorted(unknown))}.", code="unknown_permission"
            )
        ticks = set(permissions)
        extra, removed = sorted(ticks - base), sorted(base - ticks)
    result = PLATFORM_CODES if new_role == OWNER else (base | set(extra)) - set(removed)
    beyond = set(result) - mine
    if beyond:
        labels = ", ".join(sorted(PLATFORM_LABELS[c] for c in beyond))
        raise StaffRuleViolation(
            f"You cannot give access you do not have yourself: {labels}.",
            code="beyond_own_access",
        )
    staff.role = new_role
    staff.extra_permissions = extra
    staff.removed_permissions = removed
    staff.save()
    _forget(staff.user)
    new = _snapshot(staff)
    if new != old:
        PlatformEvent.objects.create(
            actor=actor, action=event, target=staff.user, data={"old": old, "new": new}
        )
    return staff


@transaction.atomic
def add_staff(
    *,
    actor: User,
    email: str,
    full_name: str,
    role: str,
    permissions: Collection[str] | None = None,
    temporary_password: str | None = None,
) -> PlatformStaff:
    """Put a person on the team: an existing account, or a new one with a temporary password."""
    from django.contrib.auth.password_validation import validate_password
    from django.core.exceptions import ValidationError as DjangoValidationError

    from apps.accounts.models import User as UserModel
    from apps.accounts.models import normalize_email_address

    email_norm = normalize_email_address(email) or ""
    user = UserModel.objects.filter(email=email_norm).first()
    if user is None:
        if not temporary_password:
            raise ValidationError(
                {"temporary_password": "Set a temporary password for this new account."}
            )
        try:
            validate_password(
                temporary_password, user=UserModel(email=email_norm, full_name=full_name)
            )
        except DjangoValidationError as exc:
            raise ValidationError({"temporary_password": list(exc.messages)}) from exc
        user = UserModel.objects.create_user(
            email=email_norm, password=temporary_password, full_name=full_name
        )
    if user.is_staff and PlatformStaff.objects.filter(user=user).exists():
        raise StaffRuleViolation("This person is already on the team.", code="already_staff")
    if user.memberships.filter(is_active=True).exists():
        # Approved decision 5: platform staff cannot also work in a business.
        raise StaffRuleViolation(
            "This person works in a business. Use a separate email for the PG Manager team.",
            code="has_business",
        )
    user.is_staff = True
    user.is_active = True
    user.save(update_fields=["is_staff", "is_active"])
    staff = PlatformStaff.objects.filter(user=user).first() or PlatformStaff(user=user, role=role)
    return set_access(
        staff=staff,
        actor=actor,
        role=role,
        permissions=permissions if permissions is not None else platform_role_permissions(role),
        event="staff.add",
    )


@transaction.atomic
def remove_staff(*, staff: PlatformStaff, actor: User) -> None:
    """Take a person off the team. Their account stays (they can still sign in as a seeker)."""
    if staff.user_id == actor.pk:
        raise StaffRuleViolation("You cannot remove yourself.", code="own_access")
    if staff.role == OWNER and not PlatformStaff.objects.filter(user=actor, role=OWNER).exists():
        raise StaffRuleViolation(
            "Only a Platform owner can remove a Platform owner.", code="beyond_own_access"
        )
    _ensure_other_owner(staff)
    user = staff.user
    user.is_staff = False
    user.save(update_fields=["is_staff"])
    PlatformEvent.objects.create(
        actor=actor, action="staff.remove", target=user, data={"old": _snapshot(staff)}
    )
    staff.delete()
    _forget(user)
