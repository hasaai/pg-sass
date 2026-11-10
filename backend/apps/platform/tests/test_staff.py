"""PG Manager team roles: who may call each platform endpoint, and the Staff screen rules."""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from django.core.management import call_command
from django.urls import reverse
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.platform.access import PLATFORM_CODES, platform_role_permissions
from apps.platform.models import PlatformEvent, PlatformRole, PlatformStaff
from core.tests.access_contract import platform_contract
from core.tests.support import Actor, authed_client, make_platform_user, make_user

CONTRACT = Path(__file__).with_name("platform_access.json")
STAFF = reverse("v1:platform-staff-list")


def staff_of(user: User) -> PlatformStaff:
    return PlatformStaff.objects.get(user=user)


def staff_url(user: User) -> str:
    return reverse("v1:platform-staff-detail", args=[staff_of(user).pk])


def client_for(role: str) -> tuple[User, APIClient]:
    user = make_platform_user(role)
    return user, authed_client(user)


class TestContract:
    def test_every_platform_endpoint_matches_the_reviewed_contract(self) -> None:
        """platform_access.json is the reviewed answer to "which team role may call what".
        If this fails you changed someone's access; review and regenerate the file with
        core.tests.access_contract.platform_contract()."""
        expected = json.loads(CONTRACT.read_text())
        now = platform_contract()
        changes = {
            k: {"was": expected.get(k, "new"), "now": now.get(k, "removed")}
            for k in sorted(set(expected) | set(now))
            if expected.get(k) != now.get(k)
        }
        assert changes == {}

    def test_roles_only_use_known_permissions(self) -> None:
        for role in PlatformRole.values:
            assert platform_role_permissions(role) <= PLATFORM_CODES
        assert platform_role_permissions("platform_owner") == PLATFORM_CODES


class TestRolesOverHttp:
    @pytest.mark.parametrize(
        ("role", "name", "allowed"),
        [
            ("finance_admin", "v1:platform-payment-list", True),
            ("finance_admin", "v1:platform-user-list", False),
            ("support_agent", "v1:platform-user-list", True),
            ("support_agent", "v1:platform-payment-list", False),
            ("verification_reviewer", "v1:platform-property-list", True),
            ("verification_reviewer", "v1:platform-sms-gateway-list", False),
            ("support_agent", "v1:platform-staff-list", False),
        ],
    )
    def test_each_role_opens_only_its_pages(self, role: str, name: str, allowed: bool) -> None:
        _, client = client_for(role)
        response = client.get(reverse(name))
        if allowed:
            assert response.status_code == 200
        else:
            assert response.status_code == 403
            assert response.json()["error"]["code"] == "insufficient_role"

    def test_is_staff_without_a_team_role_gets_nothing(self) -> None:
        client = authed_client(make_user(is_staff=True))
        response = client.get(reverse("v1:platform-overview"))
        assert response.json()["error"]["code"] == "not_platform_admin"

    def test_extra_tick_opens_one_more_page(self) -> None:
        user, client = client_for("support_agent")
        assert client.get(reverse("v1:platform-payment-list")).status_code == 403
        row = staff_of(user)
        row.extra_permissions = ["p.payments.view"]
        row.save()
        assert client.get(reverse("v1:platform-payment-list")).status_code == 200

    def test_me_shows_role_and_permissions(self) -> None:
        _, client = client_for("finance_admin")
        me = client.get(reverse("v1:auth-me")).json()
        assert me["is_platform_admin"] is True
        assert me["platform_role_label"] == "Finance admin"
        assert "p.payments.view" in me["platform_permissions"]
        assert "p.users.view" not in me["platform_permissions"]


class TestStaffScreen:
    def test_owner_adds_a_support_agent(self) -> None:
        _, client = client_for("platform_owner")
        response = client.post(
            STAFF,
            {
                "email": "new.support@example.com",
                "full_name": "New Support",
                "role": "support_agent",
                "temporary_password": "Support-Pass-2026",
            },
            format="json",
        )
        assert response.status_code == 201, response.json()
        body = response.json()
        assert body["role_label"] == "Support agent"
        assert body["permissions"] == sorted(platform_role_permissions("support_agent"))
        assert User.objects.get(email="new.support@example.com").is_staff
        assert PlatformEvent.objects.filter(action="staff.add").exists()

    def test_business_people_cannot_join_the_team(self, owner: Actor) -> None:
        _, client = client_for("platform_owner")
        response = client.post(
            STAFF,
            {"email": owner.user.email, "full_name": "Owner", "role": "support_agent"},
            format="json",
        )
        assert response.status_code == 409
        assert response.json()["error"]["code"] == "has_business"

    def test_change_ticks_and_role(self) -> None:
        _, client = client_for("platform_owner")
        agent = make_platform_user("support_agent")
        ticks = sorted(platform_role_permissions("support_agent") - {"p.users.help"})
        response = client.patch(staff_url(agent), {"permissions": ticks}, format="json")
        assert response.status_code == 200
        assert response.json()["removed_permissions"] == ["p.users.help"]
        response = client.patch(staff_url(agent), {"role": "finance_admin"}, format="json")
        assert response.json()["role"] == "finance_admin"
        assert response.json()["removed_permissions"] == ["p.users.help"]

    def test_unknown_tick(self) -> None:
        _, client = client_for("platform_owner")
        agent = make_platform_user("support_agent")
        response = client.patch(staff_url(agent), {"permissions": ["p.made.up"]}, format="json")
        assert response.json()["error"]["code"] == "unknown_permission"

    def test_cannot_change_yourself_or_give_more_than_you_have(self) -> None:
        lead, client = client_for("support_agent")
        row = staff_of(lead)
        row.extra_permissions = ["p.staff.manage"]
        row.save()
        assert client.patch(staff_url(lead), {"role": "support_agent"}).status_code == 409
        agent = make_platform_user("verification_reviewer")
        too_much = client.patch(staff_url(agent), {"role": "finance_admin"}, format="json")
        assert too_much.status_code == 409
        assert "Plan payments list" in too_much.json()["error"]["message"]
        owner = make_platform_user("platform_owner")
        assert client.patch(staff_url(owner), {"role": "support_agent"}).status_code == 409
        assert client.delete(staff_url(owner)).status_code == 409

    def test_last_platform_owner_stays(self) -> None:
        only_owner = make_platform_user("platform_owner")
        other = make_platform_user("platform_owner")
        client = authed_client(other)
        assert client.delete(staff_url(only_owner)).status_code == 204
        assert not User.objects.get(pk=only_owner.pk).is_staff
        assert PlatformStaff.objects.filter(role="platform_owner").count() == 1
        # `other` is now the last owner and cannot remove or demote themselves either.
        assert client.patch(staff_url(other), {"role": "support_agent"}).status_code == 409

    def test_access_choices_and_history(self) -> None:
        _, client = client_for("platform_owner")
        body = client.get(reverse("v1:platform-staff-access-choices")).json()
        assert {r["value"] for r in body["roles"]} == set(PlatformRole.values)
        assert {p["code"] for p in body["permissions"]} == PLATFORM_CODES
        assert client.get(reverse("v1:platform-staff-history")).status_code == 200


def test_admin_command_makes_a_platform_owner() -> None:
    call_command("create_platform_admin", email="boss@example.com", password="Strong-Pass-2026!")
    assert staff_of(User.objects.get(email="boss@example.com")).role == "platform_owner"
    call_command(
        "create_platform_admin",
        email="boss@example.com",
        password="Strong-Pass-2026!",
        role="finance_admin",
    )
    assert staff_of(User.objects.get(email="boss@example.com")).role == "finance_admin"
