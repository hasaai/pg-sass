"""Shared test helpers: factories and the cross-organization isolation check.

Every new organization-scoped endpoint must call ``assert_isolated`` in its
tests (see CLAUDE.md, "Testing rules").
"""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass
from typing import Any, cast

import factory
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from apps.accounts.models import User
from apps.organizations.models import Membership, Organization, Role

TEST_PASSWORD = "Correct-Horse-42"


class UserFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = User

    email = factory.Sequence(lambda n: f"user{n}@example.com")
    full_name = factory.Faker("name")
    password = factory.django.Password(TEST_PASSWORD)
    phone_verified_at = factory.LazyFunction(timezone.now)


def make_platform_user(role: str = "platform_owner", **fields: Any) -> User:
    """A person on the PG Manager team with this platform role."""
    from apps.platform.models import PlatformStaff

    user = make_user(is_staff=True, **fields)
    PlatformStaff.objects.create(user=user, role=role)
    return user


def make_user(**fields: Any) -> User:
    return cast(User, UserFactory(**fields))


class OrganizationFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = Organization

    name = factory.Sequence(lambda n: f"Sunrise PG {n}")
    slug = factory.Sequence(lambda n: f"sunrise-pg-{n}")


class MembershipFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = Membership

    organization = factory.SubFactory(OrganizationFactory)
    user = factory.SubFactory(UserFactory)
    role = Role.STAFF


@dataclass
class Actor:
    """A signed-in user acting inside one organization."""

    user: User
    membership: Membership
    client: APIClient

    @property
    def organization(self) -> Organization:
        return self.membership.organization


def authed_client(user: User, organization: Organization | None = None) -> APIClient:
    client = APIClient()
    token = RefreshToken.for_user(user).access_token
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    if organization is not None:
        client.credentials(
            HTTP_AUTHORIZATION=f"Bearer {token}", HTTP_X_ORGANIZATION=str(organization.id)
        )
    return client


def make_membership(**fields: Any) -> Membership:
    return cast(Membership, MembershipFactory(**fields))


def make_actor(role: str = Role.OWNER, organization: Organization | None = None) -> Actor:
    membership = make_membership(role=role, organization=organization or OrganizationFactory())
    return Actor(user=membership.user, membership=membership, client=authed_client(membership.user))


def assert_isolated(
    outsider: APIClient,
    detail_url: str,
    methods: Iterable[str] = ("get", "patch", "delete"),
    payload: dict[str, Any] | None = None,
) -> None:
    """A user from another organization gets 404 for every method on this object.

    404 (not 403) so the response never reveals that the object exists.
    """
    for method in methods:
        call = getattr(outsider, method)
        response = (
            call(detail_url, payload or {}) if method in {"patch", "put"} else call(detail_url)
        )
        assert response.status_code == 404, (
            f"{method.upper()} {detail_url} by another organization returned "
            f"{response.status_code}, expected 404"
        )
        assert response.json()["error"]["code"] == "not_found"


# ---------- domain builders (used by app tests) ----------


def make_property(organization: Organization, **fields: Any) -> Any:
    from apps.properties.models import Property

    defaults = {
        "name": "Green Nest PG",
        "address_line": "12, 5th Cross",
        "locality": "HSR Layout",
        "landmark": "Near BDA Complex",
        "gender": "men",
        "amenities": ["wifi", "food"],
    }
    return Property.objects.create(organization=organization, **{**defaults, **fields})


def make_room(prop: Any, number: str = "101", sharing: int = 2, rent: int = 900000) -> Any:
    from apps.properties.models import Bed, Room

    room = Room.objects.create(
        organization=prop.organization, property=prop, number=number, sharing=sharing
    )
    for i in range(sharing):
        Bed.objects.create(
            organization=prop.organization, room=room, label="ABCDEFGH"[i], monthly_rent=rent
        )
    return room


def make_tenant(organization: Organization, phone: str = "9876543210", **fields: Any) -> Any:
    from apps.tenants.models import Tenant

    return Tenant.objects.create(
        organization=organization,
        full_name=fields.pop("full_name", "Ravi Kumar"),
        phone=phone,
        **fields,
    )


def make_stay(actor: Actor, bed: Any, tenant: Any, check_in: Any, **kwargs: Any) -> Any:
    from apps.tenants import services

    return services.check_in(
        actor=actor.user, tenant=tenant, place=bed, check_in_date=check_in, **kwargs
    )


# ---------- uploads ----------


def png_file(name: str = "room.png", size: tuple[int, int] = (64, 48)) -> Any:
    import io

    from django.core.files.uploadedfile import SimpleUploadedFile
    from PIL import Image

    buffer = io.BytesIO()
    Image.new("RGB", size, (15, 118, 110)).save(buffer, format="PNG")
    return SimpleUploadedFile(name, buffer.getvalue(), content_type="image/png")


def pdf_file(name: str = "agreement.pdf") -> Any:
    from django.core.files.uploadedfile import SimpleUploadedFile

    return SimpleUploadedFile(name, b"%PDF-1.4\n%fake but signed\n%%EOF\n", "application/pdf")


def make_listing(actor: Actor, verified: bool = True, **fields: Any) -> Any:
    from apps.listings.models import Listing

    prop = fields.pop("property", None) or make_property(actor.organization)
    if not prop.rooms.exists():
        make_room(prop, number="101", sharing=2, rent=900000)
    return Listing.objects.create(
        organization=actor.organization,
        property=prop,
        slug=fields.pop("slug", f"{prop.name}-{prop.pk.hex[:6]}".lower().replace(" ", "-")),
        headline=fields.pop("headline", f"{prop.name} for you"),
        is_published=fields.pop("is_published", True),
        is_verified=verified,
        contact_phone=fields.pop("contact_phone", "9845000000"),
        **fields,
    )
