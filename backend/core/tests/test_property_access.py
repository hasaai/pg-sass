"""Property access: a person limited to some properties sees and changes only those."""

import datetime as dt
from typing import Any

import pytest
from django.apps import apps
from django.urls import reverse

from apps.operations.models import Notice
from apps.organizations import services
from apps.organizations.models import Membership, Role
from core.access import (
    BUSINESS_WIDE,
    PERMISSION_CODES,
    PROPERTY_PATH,
    allowed_property_ids,
    role_permissions,
)
from core.models import AuditLog, OrgScopedModel
from core.tests.support import Actor, make_actor, make_property, make_room, make_stay, make_tenant

MEMBERS = reverse("v1:member-list")


def member_url(m: Membership) -> str:
    return reverse("v1:member-detail", args=[m.pk])


def ids(response: Any) -> set[str]:
    body = response.json()
    rows = body["results"] if isinstance(body, dict) else body
    return {row["id"] for row in rows}


@pytest.fixture
def two_pgs(owner: Actor) -> dict[str, Any]:
    """Two properties with one tenant each, and a manager limited to the first."""
    org = owner.organization
    a = make_property(org, name="Koramangala PG")
    b = make_property(org, name="HSR PG")
    bed_a = make_room(a, "101").beds.first()
    bed_b = make_room(b, "201").beds.first()
    stay_a = make_stay(owner, bed_a, make_tenant(org, "9876500001"), dt.date(2026, 1, 1))
    stay_b = make_stay(owner, bed_b, make_tenant(org, "9876500002"), dt.date(2026, 1, 1))
    manager = make_actor(Role.MANAGER, organization=org)
    manager.membership.properties.set([a])
    return {"a": a, "b": b, "bed_b": bed_b, "stay_a": stay_a, "stay_b": stay_b, "m": manager}


class TestEveryModelIsCovered:
    def test_each_business_record_has_a_property_rule(self) -> None:
        for model in apps.get_models():
            if not issubclass(model, OrgScopedModel):
                continue
            label = model._meta.label
            assert label in PROPERTY_PATH or label in BUSINESS_WIDE or label == "tenants.Tenant", (
                f"{label}: add it to PROPERTY_PATH or BUSINESS_WIDE in core/access.py"
            )


class TestLimitedPerson:
    def test_lists_show_only_their_property(self, two_pgs: dict[str, Any]) -> None:
        c = two_pgs["m"].client
        assert ids(c.get(reverse("v1:property-list"))) == {str(two_pgs["a"].pk)}
        assert ids(c.get(reverse("v1:stay-list"))) == {str(two_pgs["stay_a"].pk)}
        assert ids(c.get(reverse("v1:tenant-list"))) == {str(two_pgs["stay_a"].tenant_id)}

    def test_other_property_is_404(self, two_pgs: dict[str, Any]) -> None:
        c = two_pgs["m"].client
        b = two_pgs["b"]
        assert c.get(reverse("v1:property-detail", args=[b.pk])).status_code == 404
        assert c.get(reverse("v1:stay-detail", args=[two_pgs["stay_b"].pk])).status_code == 404
        free = c.get(reverse("v1:stay-free-places"), {"property": str(b.pk)})
        assert free.status_code == 404

    def test_cannot_use_a_bed_in_another_property(self, two_pgs: dict[str, Any]) -> None:
        tenant = make_tenant(two_pgs["a"].organization, "9876500003")
        response = two_pgs["m"].client.post(
            reverse("v1:stay-list"),
            {
                "tenant": str(tenant.pk),
                "bed": str(two_pgs["bed_b"].pk),
                "check_in": "2026-02-01",
                "deposit_amount": 0,
            },
            format="json",
        )
        assert response.status_code == 400
        assert "bed" in response.json()["error"]["fields"]

    def test_dashboard_counts_only_their_property(self, two_pgs: dict[str, Any]) -> None:
        body = two_pgs["m"].client.get(reverse("v1:report-dashboard")).json()
        assert body["tenants"]["current"] == 1
        assert body["beds"]["total"] == 2

    def test_cannot_add_a_property(self, two_pgs: dict[str, Any]) -> None:
        response = two_pgs["m"].client.post(
            reverse("v1:property-list"), {"name": "New PG"}, format="json"
        )
        assert response.status_code == 403
        assert "all properties" in response.json()["error"]["message"]

    def test_business_wide_notice_is_seen(self, owner: Actor, two_pgs: dict[str, Any]) -> None:
        org = owner.organization
        everyone = Notice.objects.create(organization=org, title="Water cut", body="Sunday")
        other = Notice.objects.create(organization=org, title="B", body="x", property=two_pgs["b"])
        seen = ids(two_pgs["m"].client.get(reverse("v1:notice-list")))
        assert str(everyone.pk) in seen
        assert str(other.pk) not in seen

    def test_owner_always_sees_everything(self, owner: Actor, two_pgs: dict[str, Any]) -> None:
        owner.membership.properties.set([two_pgs["a"]])
        assert allowed_property_ids(owner.membership) is None
        assert len(ids(owner.client.get(reverse("v1:property-list")))) == 2


class TestChangingAccess:
    def test_owner_sets_role_ticks_and_properties(
        self, owner: Actor, two_pgs: dict[str, Any]
    ) -> None:
        staff = make_actor(Role.STAFF, organization=owner.organization)
        ticks = sorted(role_permissions("staff") - {"complaints.manage"} | {"rent.view"})
        response = owner.client.patch(
            member_url(staff.membership),
            {"permissions": ticks, "property_ids": [str(two_pgs["b"].pk)]},
            format="json",
        )
        assert response.status_code == 200, response.json()
        body = response.json()
        assert body["permissions"] == ticks
        assert body["extra_permissions"] == ["rent.view"]
        assert body["removed_permissions"] == ["complaints.manage"]
        assert body["property_ids"] == [str(two_pgs["b"].pk)]
        assert body["role_label"] == "Caretaker"
        log = AuditLog.objects.get(action="member.access", object_id=str(staff.membership.pk))
        assert log.data["new"]["extra"] == ["rent.view"]
        # And it works: the payment list opens, for property B only.
        assert staff.client.get(reverse("v1:payment-list")).status_code == 200

    def test_role_change_keeps_own_ticks(self, owner: Actor) -> None:
        staff = make_actor(Role.STAFF, organization=owner.organization)
        staff.membership.extra_permissions = ["rent.view"]
        staff.membership.save()
        response = owner.client.patch(member_url(staff.membership), {"role": "accountant"})
        assert response.status_code == 200
        assert response.json()["extra_permissions"] == ["rent.view"]

    def test_unknown_tick_and_property(self, owner: Actor, outsider: Actor) -> None:
        staff = make_actor(Role.STAFF, organization=owner.organization)
        url = member_url(staff.membership)
        bad = owner.client.patch(url, {"permissions": ["made.up"]}, format="json")
        assert bad.json()["error"]["code"] == "unknown_permission"
        foreign = make_property(outsider.organization)
        bad = owner.client.patch(url, {"property_ids": [str(foreign.pk)]}, format="json")
        assert bad.json()["error"]["code"] == "unknown_property"

    def test_cannot_give_more_than_you_have(self, owner: Actor) -> None:
        org = owner.organization
        lead = make_actor(Role.MANAGER, organization=org)
        lead.membership.extra_permissions = ["team.manage"]
        lead.membership.save()
        staff = make_actor(Role.STAFF, organization=org)
        ok = lead.client.patch(
            member_url(staff.membership),
            {"permissions": sorted(role_permissions("staff") | {"rent.view"})},
            format="json",
        )
        assert ok.status_code == 200
        too_much = lead.client.patch(
            member_url(staff.membership), {"permissions": ["activity.view"]}, format="json"
        )
        assert too_much.status_code == 409
        assert "See the activity log" in too_much.json()["error"]["message"]
        assert lead.client.patch(member_url(staff.membership), {"role": "owner"}).status_code == 409
        assert lead.client.patch(member_url(owner.membership), {"role": "staff"}).status_code == 409

    def test_limited_person_can_only_share_their_properties(
        self, owner: Actor, two_pgs: dict[str, Any]
    ) -> None:
        m = two_pgs["m"]
        m.membership.extra_permissions = ["team.manage"]
        m.membership.save()
        staff = make_actor(Role.STAFF, organization=owner.organization)
        url = member_url(staff.membership)
        everywhere = m.client.patch(url, {"property_ids": []}, format="json")
        assert everywhere.status_code == 409
        other = m.client.patch(url, {"property_ids": [str(two_pgs["b"].pk)]}, format="json")
        assert other.status_code == 409
        own = m.client.patch(url, {"property_ids": [str(two_pgs["a"].pk)]}, format="json")
        assert own.status_code == 200

    def test_cannot_change_yourself(self, owner: Actor) -> None:
        response = owner.client.patch(member_url(owner.membership), {"permissions": []})
        assert response.status_code == 409

    def test_making_an_owner_clears_ticks_and_properties(
        self, owner: Actor, two_pgs: dict[str, Any]
    ) -> None:
        m = two_pgs["m"].membership
        services.update_access(membership=m, actor=owner.membership, role="owner")
        m.refresh_from_db()
        assert m.permissions == PERMISSION_CODES
        assert not m.properties.exists()

    def test_add_member_with_access(self, owner: Actor, two_pgs: dict[str, Any]) -> None:
        response = owner.client.post(
            MEMBERS,
            {
                "email": "new.warden@example.com",
                "full_name": "New Warden",
                "role": "staff",
                "temporary_password": "Warden-Pass-2026",
                "property_ids": [str(two_pgs["a"].pk)],
            },
            format="json",
        )
        assert response.status_code == 201, response.json()
        assert response.json()["property_ids"] == [str(two_pgs["a"].pk)]
        assert response.json()["permissions"] == sorted(role_permissions("staff"))

    def test_staff_cannot_change_access(self, staff: Actor, owner: Actor) -> None:
        response = staff.client.patch(member_url(owner.membership), {"role": "staff"})
        assert response.status_code == 403


class TestAccessChoices:
    def test_roles_and_ticks(self, manager: Actor) -> None:
        body = manager.client.get(reverse("v1:member-access-choices")).json()
        roles = {r["value"]: r for r in body["roles"]}
        assert roles["staff"]["label"] == "Caretaker"
        assert set(roles["owner"]["permissions"]) == PERMISSION_CODES
        assert {p["code"] for p in body["permissions"]} == PERMISSION_CODES

    def test_caretaker_cannot_open(self, staff: Actor) -> None:
        assert staff.client.get(reverse("v1:member-access-choices")).status_code == 403
