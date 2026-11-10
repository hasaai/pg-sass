"""Permissions: the access contract for every endpoint, and per-person extra/removed ticks."""

import json
from pathlib import Path

import pytest
from django.urls import reverse

from apps.organizations.models import Role
from core.access import PERMISSION_CODES, ROLE_PERMISSIONS, effective_permissions
from core.tests.access_contract import current_contract, endpoints
from core.tests.support import Actor, make_actor

CONTRACT = Path(__file__).with_name("role_access.json")


class TestContract:
    def test_every_endpoint_matches_the_reviewed_contract(self) -> None:
        """role_access.json is the reviewed answer to "who may call what".

        If this fails you changed someone's access. If that was intended, review the
        differences printed below and regenerate the file:
            python -c "import json,django,os; os.environ.setdefault('DJANGO_SETTINGS_MODULE',
            'config.settings.test'); django.setup(); from core.tests.access_contract import
            current_contract; json.dump(current_contract(), open('core/tests/role_access.json',
            'w'), indent=1, sort_keys=True)"
        """
        expected = json.loads(CONTRACT.read_text())
        now = current_contract()
        changes = {
            key: {"was": expected.get(key, "new endpoint"), "now": now.get(key, "removed")}
            for key in sorted(set(expected) | set(now))
            if expected.get(key) != now.get(key)
        }
        assert changes == {}

    def test_every_endpoint_names_a_known_permission(self) -> None:
        for key, e in endpoints().items():
            if e["permission"] is None:
                # Only PUT (whole-object replace) is left without a permission; the views
                # do not offer it, so it is refused.
                assert key.endswith(" PUT"), f"{key} names no permission"
            else:
                assert e["permission"] in PERMISSION_CODES, f"{key}: {e['permission']}"

    def test_roles_only_use_known_permissions(self) -> None:
        for role, perms in ROLE_PERMISSIONS.items():
            assert perms <= PERMISSION_CODES, role
        assert set(ROLE_PERMISSIONS) == set(Role.values)

    def test_staff_never_touch_money_or_team(self) -> None:
        staff = ROLE_PERMISSIONS["staff"]
        assert not staff & {"rent.view", "rent.collect", "expenses.view", "team.view"}


class TestPersonTicks:
    def test_owner_always_has_everything(self, owner: Actor) -> None:
        owner.membership.removed_permissions = ["rent.view"]
        assert effective_permissions(owner.membership) == PERMISSION_CODES

    def test_extra_and_removed(self, owner: Actor) -> None:
        staff = make_actor(Role.STAFF, organization=owner.organization).membership
        staff.extra_permissions = ["rent.view", "made.up"]
        staff.removed_permissions = ["complaints.manage"]
        perms = effective_permissions(staff)
        assert "rent.view" in perms
        assert "made.up" not in perms
        assert "complaints.manage" not in perms


PAYMENTS = reverse("v1:payment-list")
TENANTS = reverse("v1:tenant-list")
EXPENSES = reverse("v1:expense-list")


class TestOverHttp:
    def test_accountant_sees_money_but_cannot_add_tenants(self, owner: Actor) -> None:
        accountant = make_actor(Role.ACCOUNTANT, organization=owner.organization)
        assert accountant.client.get(PAYMENTS).status_code == 200
        assert accountant.client.get(EXPENSES).status_code == 200
        response = accountant.client.post(TENANTS, {"full_name": "A", "phone": "9876500001"})
        assert response.status_code == 403
        assert response.json()["error"]["code"] == "insufficient_role"

    def test_extra_tick_opens_one_thing(self, owner: Actor) -> None:
        staff = make_actor(Role.STAFF, organization=owner.organization)
        assert staff.client.get(PAYMENTS).status_code == 403
        staff.membership.extra_permissions = ["rent.view"]
        staff.membership.save()
        assert staff.client.get(PAYMENTS).status_code == 200
        assert staff.client.post(PAYMENTS, {}).status_code == 403  # rent.collect not given

    def test_removed_tick_closes_one_thing(self, manager: Actor) -> None:
        assert manager.client.get(EXPENSES).status_code == 200
        manager.membership.removed_permissions = ["expenses.view"]
        manager.membership.save()
        assert manager.client.get(EXPENSES).status_code == 403
        assert manager.client.get(TENANTS).status_code == 200

    @pytest.mark.parametrize(("role", "sees_money"), [(Role.ACCOUNTANT, True), (Role.STAFF, False)])
    def test_dashboard_money_follows_rent_view(
        self, owner: Actor, role: str, sees_money: bool
    ) -> None:
        member = make_actor(role, organization=owner.organization)
        body = member.client.get(reverse("v1:report-dashboard")).json()
        assert (body["money"] is not None) is sees_money

    def test_me_lists_permissions(self, owner: Actor) -> None:
        staff = make_actor(Role.STAFF, organization=owner.organization)
        [membership] = staff.client.get(reverse("v1:auth-me")).json()["memberships"]
        assert membership["role_label"] == "Caretaker"
        assert membership["permissions"] == sorted(ROLE_PERMISSIONS["staff"])
