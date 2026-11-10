"""Business rules for organizations and memberships.

Views stay thin: they validate input, call one of these functions and serialize
the result. Keeping rules here lets us test them without HTTP.
"""

from __future__ import annotations

from collections.abc import Collection
from typing import TYPE_CHECKING, Any

from django.db import transaction
from django.utils.text import slugify
from rest_framework import status
from rest_framework.exceptions import APIException

from apps.organizations.models import Membership, Organization, Role
from core import audit
from core.access import (
    PERMISSION_CODES,
    PERMISSION_LABELS,
    allowed_property_ids,
    effective_permissions,
    forget_property_cache,
    role_permissions,
)

if TYPE_CHECKING:
    from apps.accounts.models import User


class MembershipRuleViolation(APIException):
    status_code = status.HTTP_409_CONFLICT
    default_detail = "This change is not allowed."
    default_code = "membership_rule_violation"

    def __init__(self, detail: str, code: str) -> None:
        super().__init__(detail=detail, code=code)


def _unique_slug(name: str) -> str:
    base = slugify(name)[:60] or "org"
    slug = base
    suffix = 2
    while Organization.objects.filter(slug=slug).exists():
        slug = f"{base}-{suffix}"
        suffix += 1
    return slug


@transaction.atomic
def create_organization_with_owner(
    *, owner: User, name: str, contact_phone: str = ""
) -> Membership:
    organization = Organization.objects.create(
        name=name.strip(), slug=_unique_slug(name), contact_phone=contact_phone
    )
    return Membership.objects.create(
        organization=organization, user=owner, role=Role.OWNER, created_by=owner
    )


def _ensure_other_owner_remains(membership: Membership) -> None:
    if membership.role != Role.OWNER:
        return
    other_owners = (
        Membership.objects.select_for_update()
        .filter(organization=membership.organization, role=Role.OWNER, is_active=True)
        .exclude(pk=membership.pk)
    )
    if not other_owners.exists():
        raise MembershipRuleViolation(
            "An organization must keep at least one active owner.", code="last_owner"
        )


@transaction.atomic
def add_member(
    *,
    organization: Organization,
    actor: User,
    email: str,
    full_name: str,
    role: str,
    temporary_password: str | None = None,
) -> Membership:
    """Add an existing user, or create one with a temporary password."""
    from django.contrib.auth.password_validation import validate_password
    from django.core.exceptions import ValidationError as DjangoValidationError
    from rest_framework.exceptions import ValidationError

    from apps.accounts.models import User as UserModel
    from apps.accounts.models import normalize_email_address

    email_norm = normalize_email_address(email) or ""
    user = UserModel.objects.filter(email=email_norm).first()
    if user is None:
        if not temporary_password:
            raise ValidationError(
                {"temporary_password": "Set a temporary password for this new account."}
            )
        candidate = UserModel(email=email_norm, full_name=full_name)
        try:
            validate_password(temporary_password, user=candidate)
        except DjangoValidationError as exc:
            raise ValidationError({"temporary_password": list(exc.messages)}) from exc
        user = UserModel.objects.create_user(
            email=email_norm, password=temporary_password, full_name=full_name
        )
    membership = Membership.objects.filter(organization=organization, user=user).first()
    if membership is not None and membership.is_active:
        raise MembershipRuleViolation("This person is already a member.", code="already_member")
    from apps.subscriptions.entitlements import check_can_add

    check_can_add(organization, "team")
    if membership is None:
        membership = Membership.objects.create(
            organization=organization, user=user, role=role, created_by=actor
        )
    else:
        membership.role = role
        membership.is_active = True
        membership.save(update_fields=["role", "is_active", "updated_at"])
    audit.record(
        organization=organization, actor=actor, action="member.add", obj=membership, role=role
    )
    return membership


@transaction.atomic
def change_role(*, membership: Membership, new_role: str, actor: Membership) -> Membership:
    return update_access(membership=membership, actor=actor, role=new_role)


def _check_within_actor(
    *, actor: Membership, role: str, permissions: frozenset[str], property_ids: set[Any]
) -> None:
    """Nobody can give more than they have themselves."""
    if actor.role != Role.OWNER:
        if role == Role.OWNER:
            raise MembershipRuleViolation(
                "Only an owner can make someone an owner.", code="beyond_own_access"
            )
        beyond = permissions - effective_permissions(actor)
        if beyond:
            labels = ", ".join(sorted(PERMISSION_LABELS[c] for c in beyond))
            raise MembershipRuleViolation(
                f"You cannot give access you do not have yourself: {labels}.",
                code="beyond_own_access",
            )
    mine = allowed_property_ids(actor)
    if mine is not None and (not property_ids or not property_ids <= mine):
        raise MembershipRuleViolation(
            "You can only give access to the properties you work in yourself.",
            code="beyond_own_access",
        )


@transaction.atomic
def update_access(
    *,
    membership: Membership,
    actor: Membership,
    role: str | None = None,
    permissions: Collection[str] | None = None,
    property_ids: Collection[Any] | None = None,
) -> Membership:
    """Change a person's role, their ticks and the properties they work in.

    ``permissions`` is the full list of ticks; it is saved as the differences from the
    role so a later role change keeps the person's own changes. ``property_ids`` empty
    means all properties. An owner always has everything in every property.
    """
    from apps.properties.models import Property

    if membership.pk == actor.pk:
        raise MembershipRuleViolation("You cannot change your own access.", code="own_membership")
    new_role = role or membership.role
    if membership.role == Role.OWNER and new_role != Role.OWNER:
        _ensure_other_owner_remains(membership)
    if membership.role == Role.OWNER and actor.role != Role.OWNER:
        raise MembershipRuleViolation(
            "Only an owner can change another owner.", code="beyond_own_access"
        )

    old = access_snapshot(membership)
    if permissions is None:
        ticks = set(effective_permissions(membership)) if role is None else None
    else:
        unknown = set(permissions) - PERMISSION_CODES
        if unknown:
            raise MembershipRuleViolation(
                f"Unknown access: {', '.join(sorted(unknown))}.", code="unknown_permission"
            )
        ticks = set(permissions)
    if property_ids is None:
        props = set(membership.properties.values_list("pk", flat=True))
    else:
        props = set(
            Property.objects.for_org(membership.organization)
            .filter(pk__in=list(property_ids))
            .values_list("pk", flat=True)
        )
        if len(props) != len(set(property_ids)):
            raise MembershipRuleViolation(
                "One of the properties was not found.", code="unknown_property"
            )

    base = role_permissions(new_role)
    if new_role == Role.OWNER:
        extra, removed, props = [], [], set()
    elif ticks is None:  # role changed, keep the person's own changes
        extra = list(membership.extra_permissions or [])
        removed = list(membership.removed_permissions or [])
    else:
        extra = sorted(ticks - base)
        removed = sorted(base - ticks)
    result = PERMISSION_CODES if new_role == Role.OWNER else (base | set(extra)) - set(removed)
    _check_within_actor(
        actor=actor, role=new_role, permissions=frozenset(result), property_ids=props
    )

    membership.role = new_role
    membership.extra_permissions = extra
    membership.removed_permissions = removed
    membership.save(
        update_fields=["role", "extra_permissions", "removed_permissions", "updated_at"]
    )
    membership.properties.set(props)
    forget_property_cache(membership)
    new = access_snapshot(membership)
    if new != old:
        audit.record(
            organization=membership.organization,
            actor=actor.user,
            action="member.access",
            obj=membership,
            old=old,
            new=new,
        )
    return membership


def access_snapshot(membership: Membership) -> dict[str, Any]:
    return {
        "role": membership.role,
        "extra": sorted(membership.extra_permissions or []),
        "removed": sorted(membership.removed_permissions or []),
        "properties": sorted(str(p) for p in membership.properties.values_list("pk", flat=True)),
    }


@transaction.atomic
def deactivate_membership(*, membership: Membership, actor: Membership) -> None:
    if membership.pk == actor.pk:
        raise MembershipRuleViolation("You cannot remove yourself.", code="own_membership")
    _ensure_other_owner_remains(membership)
    membership.is_active = False
    membership.save(update_fields=["is_active", "updated_at"])
    audit.record(
        organization=membership.organization,
        actor=actor.user,
        action="member.remove",
        obj=membership,
    )
