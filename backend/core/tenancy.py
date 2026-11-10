"""Work out which organization a request acts on.

The organization always comes from the authenticated user's active memberships,
never from a body field. A user in several organizations picks one with the
``X-Organization`` header; the server checks that header against their memberships.
"""

from __future__ import annotations

import uuid
from typing import TYPE_CHECKING

from rest_framework import status
from rest_framework.exceptions import APIException, NotAuthenticated
from rest_framework.request import Request

if TYPE_CHECKING:
    from apps.organizations.models import Membership

ORG_HEADER = "X-Organization"
_CACHE_ATTR = "_resolved_membership"


class OrganizationNotAccessible(APIException):
    status_code = status.HTTP_403_FORBIDDEN
    default_detail = "You do not have access to this organization."
    default_code = "organization_not_accessible"


class OrganizationRequired(APIException):
    status_code = status.HTTP_400_BAD_REQUEST
    default_detail = f"You belong to several organizations. Send the {ORG_HEADER} header."
    default_code = "organization_required"


def resolve_membership(request: Request) -> Membership:
    """Return the caller's active membership for this request, or raise."""
    cached: Membership | None = getattr(request, _CACHE_ATTR, None)
    if cached is not None:
        return cached

    from apps.organizations.models import Membership, Organization

    user = request.user
    if not user or not user.is_authenticated:
        raise NotAuthenticated()

    memberships = Membership.objects.filter(
        user=user,
        is_active=True,
        organization__status=Organization.Status.ACTIVE,
    ).select_related("organization")

    header = request.headers.get(ORG_HEADER)
    if header:
        try:
            org_id = uuid.UUID(header)
        except ValueError as exc:
            raise OrganizationNotAccessible() from exc
        membership = memberships.filter(organization_id=org_id).first()
        if membership is None:
            raise OrganizationNotAccessible()
    else:
        found = list(memberships[:2])
        if not found:
            raise OrganizationNotAccessible()
        if len(found) > 1:
            raise OrganizationRequired()
        membership = found[0]

    setattr(request, _CACHE_ATTR, membership)
    request.organization = membership.organization  # type: ignore[attr-defined]
    request.membership = membership  # type: ignore[attr-defined]
    return membership
