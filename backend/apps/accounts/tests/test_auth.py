from typing import Any
from unittest import mock

import pytest
from django.conf import settings
from django.urls import reverse
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.organizations.models import Membership, Role
from core.tests.support import TEST_PASSWORD, Actor, UserFactory

REGISTER = reverse("v1:auth-register")
LOGIN = reverse("v1:auth-login")
REFRESH = reverse("v1:auth-refresh")
LOGOUT = reverse("v1:auth-logout")
ME = reverse("v1:auth-me")
COOKIE = settings.REFRESH_COOKIE_NAME


def register_payload(**overrides: Any) -> dict[str, Any]:
    return {
        "full_name": "Asha Rao",
        "email": "Asha@Example.com",
        "password": "Str0ng-Passphrase!",
        "phone": "98450 12345",
        "organization_name": "Asha Comforts PG",
        **overrides,
    }


class TestRegister:
    def test_creates_user_organization_and_owner(self, anon: APIClient) -> None:
        response = anon.post(REGISTER, register_payload())
        assert response.status_code == 201
        body = response.json()
        assert body["access"]
        assert body["user"]["email"] == "asha@example.com"
        [membership] = body["user"]["memberships"]
        assert membership["role"] == Role.OWNER
        assert membership["organization"]["slug"] == "asha-comforts-pg"

        cookie = response.cookies[COOKIE]
        assert cookie["httponly"]
        assert cookie["path"] == "/api/v1/auth/"
        assert cookie["samesite"] == "Strict"

    def test_same_org_name_gets_unique_slug(self, anon: APIClient) -> None:
        anon.post(REGISTER, register_payload())
        other = register_payload(email="other@example.com", phone="9845012346")
        response = anon.post(REGISTER, other)
        assert response.json()["user"]["memberships"][0]["organization"]["slug"] == (
            "asha-comforts-pg-2"
        )

    def test_duplicate_email_is_case_insensitive(self, anon: APIClient) -> None:
        UserFactory(email="asha@example.com")
        response = anon.post(REGISTER, register_payload(email="ASHA@example.com"))
        assert response.status_code == 400
        assert "email" in response.json()["error"]["fields"]

    @pytest.mark.parametrize("password", ["short", "1234567890123", "password1234"])
    def test_weak_password_is_rejected(self, anon: APIClient, password: str) -> None:
        response = anon.post(REGISTER, register_payload(password=password))
        assert response.status_code == 400
        assert "password" in response.json()["error"]["fields"]
        assert not User.objects.exists()

    def test_missing_fields(self, anon: APIClient) -> None:
        response = anon.post(REGISTER, {})
        fields = response.json()["error"]["fields"]
        assert response.status_code == 400
        assert {"full_name", "email", "password", "organization_name"} <= set(fields)

    def test_client_cannot_choose_role_or_organization(self, anon: APIClient) -> None:
        response = anon.post(REGISTER, register_payload(role="manager", organization="x"))
        assert response.status_code == 201
        assert Membership.objects.get().role == Role.OWNER


class TestLogin:
    def test_success_sets_refresh_cookie(self, anon: APIClient, owner: Actor) -> None:
        response = anon.post(LOGIN, {"email": owner.user.email, "password": TEST_PASSWORD})
        assert response.status_code == 200
        assert response.json()["access"]
        assert response.cookies[COOKIE].value

    def test_email_is_case_insensitive(self, anon: APIClient, owner: Actor) -> None:
        response = anon.post(
            LOGIN, {"email": str(owner.user.email).upper(), "password": TEST_PASSWORD}
        )
        assert response.status_code == 200

    def test_wrong_password(self, anon: APIClient, owner: Actor) -> None:
        response = anon.post(LOGIN, {"email": owner.user.email, "password": "wrong-pass"})
        assert response.status_code == 401
        assert response.json()["error"]["code"] == "invalid_credentials"
        assert COOKIE not in response.cookies

    def test_unknown_email_gives_same_error(self, anon: APIClient) -> None:
        response = anon.post(LOGIN, {"email": "nobody@example.com", "password": "x" * 12})
        assert response.status_code == 401
        assert response.json()["error"]["code"] == "invalid_credentials"

    def test_inactive_user_cannot_log_in(self, anon: APIClient, owner: Actor) -> None:
        User.objects.filter(pk=owner.user.pk).update(is_active=False)
        response = anon.post(LOGIN, {"email": owner.user.email, "password": TEST_PASSWORD})
        assert response.status_code == 401


def _login(client: APIClient, user: User) -> None:
    response = client.post(LOGIN, {"email": user.email, "password": TEST_PASSWORD})
    assert response.status_code == 200


class TestRefreshAndLogout:
    def test_refresh_rotates_cookie(self, anon: APIClient, owner: Actor) -> None:
        _login(anon, owner.user)
        first = anon.cookies[COOKIE].value
        response = anon.post(REFRESH)
        assert response.status_code == 200
        assert response.json()["access"]
        assert anon.cookies[COOKIE].value != first

    def test_old_refresh_token_cannot_be_reused(self, anon: APIClient, owner: Actor) -> None:
        _login(anon, owner.user)
        stolen = anon.cookies[COOKIE].value
        assert anon.post(REFRESH).status_code == 200

        attacker = APIClient()
        attacker.cookies[COOKIE] = stolen
        response = attacker.post(REFRESH)
        assert response.status_code == 401
        assert response.json()["error"]["code"] == "invalid_refresh"

    def test_refresh_without_cookie(self, anon: APIClient) -> None:
        response = anon.post(REFRESH)
        assert response.status_code == 401
        assert response.json()["error"]["code"] == "invalid_refresh"

    def test_refresh_with_garbage_cookie(self, anon: APIClient) -> None:
        anon.cookies[COOKIE] = "garbage"
        assert anon.post(REFRESH).status_code == 401

    def test_refresh_for_deactivated_user(self, anon: APIClient, owner: Actor) -> None:
        _login(anon, owner.user)
        User.objects.filter(pk=owner.user.pk).update(is_active=False)
        assert anon.post(REFRESH).status_code == 401

    def test_logout_revokes_refresh_token(self, anon: APIClient, owner: Actor) -> None:
        _login(anon, owner.user)
        token = anon.cookies[COOKIE].value
        response = anon.post(LOGOUT)
        assert response.status_code == 204
        assert response.cookies[COOKIE].value == ""

        replay = APIClient()
        replay.cookies[COOKIE] = token
        assert replay.post(REFRESH).status_code == 401

    def test_logout_without_cookie_is_harmless(self, anon: APIClient) -> None:
        assert anon.post(LOGOUT).status_code == 204


class TestMe:
    def test_requires_login(self, anon: APIClient) -> None:
        assert anon.get(ME).status_code == 401

    def test_lists_only_active_memberships(self, owner: Actor, outsider: Actor) -> None:
        response = owner.client.get(ME)
        assert response.status_code == 200
        body = response.json()
        assert body["email"] == owner.user.email
        assert [m["organization"]["id"] for m in body["memberships"]] == [
            str(owner.organization.id)
        ]

        owner.membership.is_active = False
        owner.membership.save()
        assert owner.client.get(ME).json()["memberships"] == []

    def test_rejects_invalid_token(self, anon: APIClient) -> None:
        anon.credentials(HTTP_AUTHORIZATION="Bearer not-a-token")
        assert anon.get(ME).status_code == 401


class TestRateLimit:
    def test_login_is_throttled(self, anon: APIClient) -> None:
        from django.core.cache import cache
        from rest_framework.throttling import ScopedRateThrottle

        cache.clear()
        with mock.patch.dict(ScopedRateThrottle.THROTTLE_RATES, {"auth": "3/min"}):
            codes = [
                anon.post(LOGIN, {"email": "a@example.com", "password": "x" * 12}).status_code
                for _ in range(4)
            ]
            response = anon.post(LOGIN, {"email": "a@example.com", "password": "x" * 12})
        assert codes[:3] == [401, 401, 401]
        assert response.status_code == 429
        assert response.json()["error"]["code"] == "throttled"
