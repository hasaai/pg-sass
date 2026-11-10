"""Membership plans: trial, limits, features, overrides and the platform admin side."""

import datetime as dt
from typing import Any

import pytest
from django.urls import reverse
from django.utils import timezone

from apps.organizations.models import Role
from apps.subscriptions import services
from apps.subscriptions.models import Plan, Subscription
from core.tests.support import (
    Actor,
    make_actor,
    make_platform_user,
    make_property,
    make_room,
    make_stay,
    make_tenant,
)

PROPS = reverse("v1:property-list")
ROOMS = reverse("v1:room-list")
MY_PLAN = reverse("v1:my-plan")


def put_on(actor: Actor, key: str, **over: Any) -> Subscription:
    admin = make_platform_user()
    return services.assign_plan(
        org=actor.organization,
        plan=Plan.objects.get(key=key),
        actor=admin,
        ends_on=over.pop("ends_on", None),
        limit_overrides=over.pop("limit_overrides", None),
    )


def platform_admin() -> Any:
    from rest_framework.test import APIClient

    client = APIClient()
    client.force_authenticate(make_platform_user())
    return client


class TestTrialAndExpiry:
    def test_new_business_starts_on_a_pro_trial(self, owner: Actor) -> None:
        body = owner.client.get(MY_PLAN).json()
        assert (body["plan_key"], body["status"], body["days_left"]) == ("pro", "trial", 14)
        assert body["status_label"] == "Free trial"
        assert {u["key"]: u["limit"] for u in body["usage"]}["beds"] == 300

    def test_ended_trial_falls_back_to_free(self, owner: Actor) -> None:
        Subscription.objects.filter(organization=owner.organization).update(
            ends_on=timezone.localdate() - dt.timedelta(days=1)
        )
        body = owner.client.get(MY_PLAN).json()
        assert (body["plan_key"], body["status"]) == ("free", "expired")
        me = owner.client.get(reverse("v1:auth-me")).json()
        org = me["memberships"][0]["organization"]
        assert "finance" in org["disabled_features"]
        assert org["plan_name"] == "Free"


class TestLimits:
    def test_free_plan_allows_one_property(self, owner: Actor) -> None:
        put_on(owner, "free")
        make_property(owner.organization)
        response = owner.client.post(
            PROPS, {"name": "Second", "address_line": "1", "locality": "HSR", "property_type": "pg"}
        )
        assert response.status_code == 403
        assert response.json()["error"]["code"] == "plan_limit"
        assert response.json()["error"]["message"] == (
            "Your Free plan allows 1 property and you have 1. Upgrade your plan to add more."
        )

    def test_beds_limit_counts_the_beds_a_new_room_brings(self, owner: Actor) -> None:
        put_on(owner, "free")
        prop = make_property(owner.organization)
        for n in range(8):
            make_room(prop, number=f"1{n}", sharing=3)  # 24 beds
        response = owner.client.post(
            ROOMS,
            {"property": str(prop.pk), "number": "200", "sharing": 2, "bed_rent": 500000},
            format="json",
        )
        assert response.status_code == 403
        assert "you can add 1 more, not 2" in response.json()["error"]["message"]

    def test_custom_limit_for_one_business(self, owner: Actor) -> None:
        put_on(owner, "free", limit_overrides={"properties": 3})
        make_property(owner.organization)
        response = owner.client.post(
            PROPS, {"name": "Second", "address_line": "1", "locality": "HSR", "property_type": "pg"}
        )
        assert response.status_code == 201, response.json()

    def test_tenants_limit_on_check_in(self, owner: Actor) -> None:
        put_on(owner, "free", limit_overrides={"tenants": 1})
        prop = make_property(owner.organization)
        room = make_room(prop, sharing=2)
        beds = list(room.beds.all())
        make_stay(
            owner,
            beds[0],
            make_tenant(owner.organization, phone="9000000001"),
            dt.date(2026, 10, 1),
        )
        tenant = make_tenant(owner.organization, phone="9000000002")
        response = owner.client.post(
            reverse("v1:stay-list"),
            {"tenant": str(tenant.pk), "bed": str(beds[1].pk), "check_in": "2026-10-02"},
        )
        assert response.status_code == 403
        assert "1 tenant staying" in response.json()["error"]["message"]

    def test_team_limit(self, owner: Actor) -> None:
        put_on(owner, "free")
        response = owner.client.post(
            reverse("v1:member-list"),
            {
                "email": "new@example.com",
                "full_name": "New",
                "role": "staff",
                "temporary_password": "Strong-Pass-2026!",
            },
        )
        assert response.status_code == 403
        assert response.json()["error"]["code"] == "plan_limit"

    def test_downgrade_keeps_everything_working(self, owner: Actor) -> None:
        prop = make_property(owner.organization)
        make_property(owner.organization, name="Second")
        room = make_room(prop)
        put_on(owner, "free")
        assert owner.client.get(PROPS).status_code == 200
        assert owner.client.get(reverse("v1:room-detail", args=[room.pk])).status_code == 200
        patch = owner.client.patch(
            reverse("v1:room-detail", args=[room.pk]), {"is_ac": True}, format="json"
        )
        assert patch.status_code == 200
        usage = {u["key"]: u for u in owner.client.get(MY_PLAN).json()["usage"]}
        assert (usage["properties"]["used"], usage["properties"]["limit"]) == (2, 1)

    def test_restoring_a_property_counts_its_rooms(self, owner: Actor) -> None:
        put_on(owner, "free", limit_overrides={"properties": 5, "rooms": 2})
        old = make_property(owner.organization, name="Old")
        make_room(old, number="1")
        make_room(old, number="2")
        owner.client.post(reverse("v1:property-archive", args=[old.pk]))
        make_room(make_property(owner.organization, name="New"), number="3")
        response = owner.client.post(reverse("v1:property-restore", args=[old.pk]))
        assert response.status_code == 403
        assert "rooms" in response.json()["error"]["message"]


class TestFeatures:
    def test_module_not_in_plan_is_refused_with_the_plan_name(self, owner: Actor) -> None:
        put_on(owner, "free")
        response = owner.client.get(reverse("v1:expense-list"))
        assert response.status_code == 403
        assert response.json()["error"]["code"] == "feature_disabled"
        assert "not part of your Free plan" in response.json()["error"]["message"]

    def test_csv_upload_needs_the_feature(self, owner: Actor) -> None:
        from django.core.files.uploadedfile import SimpleUploadedFile

        put_on(owner, "free")
        prop = make_property(owner.organization)
        file = SimpleUploadedFile("r.csv", b"room,sharing,rent_per_bed\n1,1,1000\n")
        response = owner.client.post(
            reverse("v1:property-rooms-import", args=[prop.pk]), {"file": file}, format="multipart"
        )
        assert response.status_code == 403

    def test_room_extras_need_the_feature(self, owner: Actor) -> None:
        put_on(owner, "basic")
        prop = make_property(owner.organization)
        response = owner.client.post(
            ROOMS,
            {
                "property": str(prop.pk),
                "number": "9",
                "sharing": 1,
                "bed_rent": 100000,
                "features": [{"amenity": "balcony", "charge": "extra", "charge_amount": 50000}],
            },
            format="json",
        )
        assert response.status_code == 403

    def test_platform_switch_off_still_wins(self, owner: Actor) -> None:
        put_on(owner, "business")
        owner.organization.disabled_features = ["finance"]
        owner.organization.save()
        response = owner.client.get(reverse("v1:expense-list"))
        assert "switched off for your business" in response.json()["error"]["message"]


class TestPlatformPlans:
    def test_list_create_edit_and_hide(self) -> None:
        admin = platform_admin()
        rows = admin.get(reverse("v1:platform-plan-list")).json()
        assert [p["key"] for p in rows] == ["free", "basic", "pro", "business"]
        created = admin.post(
            reverse("v1:platform-plan-list"),
            {
                "key": "starter",
                "name": "Starter",
                "price_month": 29900,
                "limits": {"properties": 1, "beds": 40},
                "features": ["reminders"],
            },
            format="json",
        )
        assert created.status_code == 201, created.json()
        bad = admin.patch(
            reverse("v1:platform-plan-detail", args=[created.json()["id"]]),
            {"limits": {"parking": 2}},
            format="json",
        )
        assert bad.status_code == 400
        assert (
            admin.delete(
                reverse("v1:platform-plan-detail", args=[created.json()["id"]])
            ).status_code
            == 204
        )

    def test_plan_in_use_cannot_be_deleted(self, owner: Actor) -> None:
        admin = platform_admin()
        pro = Plan.objects.get(key="pro")
        response = admin.delete(reverse("v1:platform-plan-detail", args=[pro.pk]))
        assert response.status_code == 400
        assert "Hide it" in str(response.json()["error"]["fields"])

    def test_owner_cannot_open_platform_plans(self, owner: Actor) -> None:
        assert owner.client.get(reverse("v1:platform-plan-list")).status_code == 403

    def test_assign_plan_with_history(self, owner: Actor) -> None:
        admin = platform_admin()
        url = reverse("v1:platform-subscription", args=[owner.organization.pk])
        response = admin.put(
            url,
            {
                "plan": "basic",
                "ends_on": "2027-01-31",
                "limit_overrides": {"beds": 120},
                "note": "Deal",
            },
            format="json",
        )
        assert response.status_code == 200, response.json()
        body = response.json()
        assert (body["plan"], body["ends_on"], body["limit_overrides"]) == (
            "basic",
            "2027-01-31",
            {"beds": 120},
        )
        assert [h["kind"] for h in body["history"]] == ["assigned", "trial"]
        assert body["history"][0]["from_plan"] == "Pro"
        beds = next(u for u in body["summary"]["usage"] if u["key"] == "beds")
        assert beds["limit"] == 120

    def test_catalog_lists_everything_a_plan_controls(self) -> None:
        body = platform_admin().get(reverse("v1:platform-plan-catalog")).json()
        assert [e["key"] for e in body["limits"]] == [
            "properties",
            "rooms",
            "beds",
            "tenants",
            "team",
        ]
        assert "verification" in [e["key"] for e in body["features"]]


@pytest.mark.parametrize("role", [Role.MANAGER, Role.STAFF])
def test_everyone_in_the_business_can_see_the_plan(owner: Actor, role: str) -> None:
    member = make_actor(role, organization=owner.organization)
    assert member.client.get(MY_PLAN).status_code == 200


def test_plan_choices_hide_non_public_plans(owner: Actor) -> None:
    keys = [p["key"] for p in owner.client.get(reverse("v1:plan-choices")).json()]
    assert keys == ["free", "basic", "pro"]
