import pytest
from rest_framework.test import APIClient

from apps.organizations.models import Role
from core.tests.support import Actor, make_actor


@pytest.fixture(autouse=True)
def _db(db: None) -> None:
    """Every test gets a database (wrapped in a transaction)."""


@pytest.fixture
def anon() -> APIClient:
    return APIClient()


@pytest.fixture
def owner() -> Actor:
    return make_actor(Role.OWNER)


@pytest.fixture
def manager(owner: Actor) -> Actor:
    return make_actor(Role.MANAGER, organization=owner.organization)


@pytest.fixture
def staff(owner: Actor) -> Actor:
    return make_actor(Role.STAFF, organization=owner.organization)


@pytest.fixture
def outsider() -> Actor:
    """Owner of a different organization."""
    return make_actor(Role.OWNER)
