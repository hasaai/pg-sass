import pytest
from django.urls import reverse
from rest_framework.test import APIClient

from apps.organizations import services
from apps.organizations.models import Membership, Role
from core.tests.support import Actor, assert_isolated, make_actor

CURRENT = reverse("v1:organization-current")
MEMBERS = reverse("v1:member-list")


def member_url(membership: Membership) -> str:
    return reverse("v1:member-detail", args=[membership.pk])


class TestCurrentOrganization:
    @pytest.mark.parametrize("role", [Role.OWNER, Role.MANAGER, Role.STAFF])
    def test_any_member_can_read(self, role: str) -> None:
        actor = make_actor(role)
        response = actor.client.get(CURRENT)
        assert response.status_code == 200
        assert response.json()["id"] == str(actor.organization.id)

    def test_owner_can_rename(self, owner: Actor) -> None:
        response = owner.client.patch(CURRENT, {"name": "New Name", "contact_phone": "9800000000"})
        assert response.status_code == 200
        owner.organization.refresh_from_db()
        assert owner.organization.name == "New Name"

    def test_slug_and_status_are_read_only(self, owner: Actor) -> None:
        slug = owner.organization.slug
        owner.client.patch(CURRENT, {"slug": "hijack", "status": "suspended"})
        owner.organization.refresh_from_db()
        assert owner.organization.slug == slug
        assert owner.organization.status == "active"

    def test_blank_name_is_rejected(self, owner: Actor) -> None:
        response = owner.client.patch(CURRENT, {"name": ""})
        assert response.status_code == 400
        assert "name" in response.json()["error"]["fields"]

    @pytest.mark.parametrize("role", [Role.MANAGER, Role.STAFF])
    def test_non_owner_cannot_edit(self, role: str) -> None:
        actor = make_actor(role)
        response = actor.client.patch(CURRENT, {"name": "Nope"})
        assert response.status_code == 403
        assert response.json()["error"]["code"] == "insufficient_role"

    def test_requires_login(self, anon: APIClient) -> None:
        assert anon.get(CURRENT).status_code == 401


class TestMemberList:
    def test_owner_and_manager_can_list(self, owner: Actor, manager: Actor, staff: Actor) -> None:
        for actor in (owner, manager):
            response = actor.client.get(MEMBERS)
            assert response.status_code == 200
            ids = {row["id"] for row in response.json()["results"]}
            assert ids == {str(m.membership.pk) for m in (owner, manager, staff)}

    def test_staff_cannot_list(self, staff: Actor) -> None:
        response = staff.client.get(MEMBERS)
        assert response.status_code == 403
        assert response.json()["error"]["code"] == "insufficient_role"

    def test_list_never_includes_other_organizations(self, owner: Actor, outsider: Actor) -> None:
        ids = {row["id"] for row in owner.client.get(MEMBERS).json()["results"]}
        assert str(outsider.membership.pk) not in ids

    def test_page_size_is_capped(self, owner: Actor) -> None:
        for _ in range(3):
            make_actor(Role.STAFF, organization=owner.organization)
        response = owner.client.get(MEMBERS, {"page_size": 2})
        assert len(response.json()["results"]) == 2
        assert response.json()["next"]


class TestMemberIsolation:
    def test_other_organization_gets_404(self, staff: Actor, outsider: Actor) -> None:
        assert_isolated(outsider.client, member_url(staff.membership), payload={"role": "owner"})
        staff.membership.refresh_from_db()
        assert staff.membership.role == Role.STAFF
        assert staff.membership.is_active


class TestChangeRole:
    def test_owner_promotes_staff(self, owner: Actor, staff: Actor) -> None:
        response = owner.client.patch(member_url(staff.membership), {"role": "manager"})
        assert response.status_code == 200
        assert response.json()["role"] == "manager"

    def test_owner_can_demote_another_owner(self, owner: Actor) -> None:
        second = make_actor(Role.OWNER, organization=owner.organization)
        response = owner.client.patch(member_url(second.membership), {"role": "staff"})
        assert response.status_code == 200

    def test_manager_cannot_change_roles(self, manager: Actor, staff: Actor) -> None:
        response = manager.client.patch(member_url(staff.membership), {"role": "manager"})
        assert response.status_code == 403

    def test_cannot_change_own_role(self, owner: Actor) -> None:
        response = owner.client.patch(member_url(owner.membership), {"role": "staff"})
        assert response.status_code == 409
        assert response.json()["error"]["code"] == "own_membership"

    def test_invalid_role(self, owner: Actor, staff: Actor) -> None:
        response = owner.client.patch(member_url(staff.membership), {"role": "superadmin"})
        assert response.status_code == 400
        assert "role" in response.json()["error"]["fields"]

    def test_put_is_not_allowed(self, owner: Actor, staff: Actor) -> None:
        response = owner.client.put(member_url(staff.membership), {"role": "manager"})
        assert response.status_code == 405

    def test_last_owner_cannot_be_demoted(self, owner: Actor, manager: Actor) -> None:
        with pytest.raises(services.MembershipRuleViolation) as exc:
            services.change_role(
                membership=owner.membership, new_role=Role.STAFF, actor=manager.membership
            )
        assert exc.value.get_codes() == "last_owner"


class TestDeactivateMember:
    def test_owner_removes_staff(self, owner: Actor, staff: Actor) -> None:
        response = owner.client.delete(member_url(staff.membership))
        assert response.status_code == 204
        staff.membership.refresh_from_db()
        assert staff.membership.is_active is False
        # The removed member immediately loses access.
        assert staff.client.get(CURRENT).status_code == 403

    def test_cannot_remove_self(self, owner: Actor) -> None:
        response = owner.client.delete(member_url(owner.membership))
        assert response.status_code == 409

    def test_manager_cannot_remove(self, manager: Actor, staff: Actor) -> None:
        assert manager.client.delete(member_url(staff.membership)).status_code == 403

    def test_last_owner_cannot_be_removed(self, owner: Actor, manager: Actor) -> None:
        with pytest.raises(services.MembershipRuleViolation):
            services.deactivate_membership(membership=owner.membership, actor=manager.membership)


class TestAddMember:
    def test_owner_adds_new_person(self, owner: Actor) -> None:
        response = owner.client.post(
            MEMBERS,
            {
                "email": "Warden@Example.com",
                "full_name": "Raju",
                "role": "staff",
                "temporary_password": "Temp-Pass-2026",
            },
        )
        assert response.status_code == 201, response.json()
        assert response.json()["user"]["email"] == "warden@example.com"
        login = APIClient().post(
            reverse("v1:auth-login"), {"email": "warden@example.com", "password": "Temp-Pass-2026"}
        )
        assert login.status_code == 200

    def test_existing_user_added_without_password(self, owner: Actor, outsider: Actor) -> None:
        response = owner.client.post(
            MEMBERS, {"email": outsider.user.email, "full_name": "x", "role": "manager"}
        )
        assert response.status_code == 201

    def test_new_person_needs_strong_password(self, owner: Actor) -> None:
        missing = owner.client.post(
            MEMBERS, {"email": "a@example.com", "full_name": "A", "role": "staff"}
        )
        assert "temporary_password" in missing.json()["error"]["fields"]
        weak = owner.client.post(
            MEMBERS,
            {
                "email": "a@example.com",
                "full_name": "A",
                "role": "staff",
                "temporary_password": "123",
            },
        )
        assert "temporary_password" in weak.json()["error"]["fields"]

    def test_already_member_and_reactivation(self, owner: Actor, staff: Actor) -> None:
        dup = owner.client.post(
            MEMBERS, {"email": staff.user.email, "full_name": "x", "role": "staff"}
        )
        assert dup.json()["error"]["code"] == "already_member"
        owner.client.delete(member_url(staff.membership))
        again = owner.client.post(
            MEMBERS, {"email": staff.user.email, "full_name": "x", "role": "manager"}
        )
        assert again.status_code == 201
        staff.membership.refresh_from_db()
        assert (staff.membership.is_active, staff.membership.role) == (True, "manager")

    def test_manager_cannot_add(self, manager: Actor) -> None:
        response = manager.client.post(
            MEMBERS,
            {
                "email": "b@example.com",
                "full_name": "B",
                "role": "staff",
                "temporary_password": "Temp-Pass-2026",
            },
        )
        assert response.status_code == 403
