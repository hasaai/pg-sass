import datetime as dt
from unittest import mock

import pytest
from django.core import mail
from django.urls import reverse
from rest_framework.test import APIClient

from apps.applications.models import Application, WishlistItem
from apps.organizations.models import Role
from apps.properties.models import Bed
from apps.tenants.models import Stay, Tenant
from core.tests.support import (
    Actor,
    assert_isolated,
    authed_client,
    make_actor,
    make_listing,
    make_property,
    make_room,
    make_tenant,
    make_user,
)

TODAY = dt.date(2026, 10, 18)
MINE = reverse("v1:my-application-list")
INBOX = reverse("v1:application-list")


@pytest.fixture(autouse=True)
def _today():
    with mock.patch("django.utils.timezone.localdate", return_value=TODAY):
        yield


@pytest.fixture
def seeker():
    user = make_user(full_name="Divya Rao", email="divya@example.com")
    return user, authed_client(user)


def apply_payload(listing, **over):
    return {
        "listing": listing.slug,
        "full_name": "Divya Rao",
        "phone": "98450 22222",
        "occupation": "Designer",
        "id_type": "aadhaar",
        "id_last4": "7788",
        "preferred_sharing": 2,
        "move_in_date": "2026-11-01",
        "consent": True,
        **over,
    }


class TestSeekerSignup:
    def test_register_seeker(self, anon: APIClient) -> None:
        response = anon.post(
            reverse("v1:auth-register-seeker"),
            {
                "full_name": "Kiran",
                "email": "kiran@example.com",
                "phone": "+919845033333",
                "password": "Room-Hunt-2026!",
            },
        )
        assert response.status_code == 201, response.json()
        assert response.json()["user"]["memberships"] == []
        assert response.json()["user"]["phone"] == "9845033333"

    def test_duplicate_phone_and_weak_password(self, anon: APIClient) -> None:
        make_user(phone="9845033333")
        url = reverse("v1:auth-register-seeker")
        dup = anon.post(
            url,
            {
                "full_name": "K",
                "email": "k@example.com",
                "phone": "9845033333",
                "password": "Room-Hunt-2026!",
            },
        )
        assert "phone" in dup.json()["error"]["fields"]
        weak = anon.post(
            url,
            {"full_name": "K", "email": "k@example.com", "phone": "9845044444", "password": "123"},
        )
        assert "password" in weak.json()["error"]["fields"]


class TestApply:
    def test_apply_and_track(self, owner: Actor, seeker) -> None:
        user, client = seeker
        listing = make_listing(owner)
        response = client.post(MINE, apply_payload(listing))
        assert response.status_code == 201, response.json()
        body = response.json()
        assert body["status"] == "pending"
        assert body["listing"]["slug"] == listing.slug
        assert body["phone"] == "9845022222"
        assert Application.objects.get().organization == owner.organization
        assert [a["id"] for a in client.get(MINE).json()["results"]] == [body["id"]]
        # owners and managers are emailed about the new application
        assert any("New application" in m.subject for m in mail.outbox)

    def test_requires_login(self, anon: APIClient, owner: Actor) -> None:
        assert anon.post(MINE, apply_payload(make_listing(owner))).status_code == 401

    @pytest.mark.parametrize(
        "field,value",
        [
            ("consent", False),
            ("move_in_date", "2026-10-01"),
            ("move_in_date", "2027-06-01"),
            ("phone", "123"),
            ("id_last4", "12345"),
        ],
    )
    def test_validation(self, owner: Actor, seeker, field: str, value: object) -> None:
        response = seeker[1].post(MINE, apply_payload(make_listing(owner), **{field: value}))
        assert response.status_code == 400
        assert field in response.json()["error"]["fields"]

    def test_only_public_listings(self, owner: Actor, seeker) -> None:
        hidden = make_listing(owner, verified=False)
        assert seeker[1].post(MINE, apply_payload(hidden)).status_code == 404

    def test_one_pending_application_per_listing(self, owner: Actor, seeker) -> None:
        listing = make_listing(owner)
        seeker[1].post(MINE, apply_payload(listing))
        again = seeker[1].post(MINE, apply_payload(listing))
        assert again.status_code == 409
        assert again.json()["error"]["code"] == "already_applied"

    def test_withdraw(self, owner: Actor, seeker) -> None:
        app_id = seeker[1].post(MINE, apply_payload(make_listing(owner))).json()["id"]
        url = reverse("v1:my-application-withdraw", args=[app_id])
        assert seeker[1].post(url).json()["status"] == "withdrawn"
        assert seeker[1].post(url).json()["error"]["code"] == "not_pending"

    def test_seekers_never_see_each_other(self, owner: Actor, seeker) -> None:
        app_id = seeker[1].post(MINE, apply_payload(make_listing(owner))).json()["id"]
        other = authed_client(make_user())
        assert other.get(MINE).json()["results"] == []
        assert other.get(reverse("v1:my-application-detail", args=[app_id])).status_code == 404
        assert other.post(reverse("v1:my-application-withdraw", args=[app_id])).status_code == 404


class TestOwnerDecision:
    @pytest.fixture
    def app(self, owner: Actor, seeker) -> Application:
        listing = make_listing(owner)
        seeker[1].post(MINE, apply_payload(listing))
        return Application.objects.get()

    def approve_url(self, app: Application) -> str:
        return reverse("v1:application-approve", args=[app.pk])

    def test_inbox_and_approve_into_bed(self, owner: Actor, app: Application, seeker) -> None:
        assert [a["id"] for a in owner.client.get(INBOX).json()["results"]] == [str(app.pk)]
        bed = Bed.objects.filter(room__property=app.listing.property).first()
        assert bed is not None
        mail.outbox.clear()
        response = owner.client.post(
            self.approve_url(app),
            {
                "bed": str(bed.pk),
                "check_in": "2026-11-01",
                "deposit_amount": 1800000,
                "deposit_collected": 900000,
            },
        )
        assert response.status_code == 200, response.json()
        body = response.json()
        assert body["status"] == "approved"
        assert body["allocated"]["bed_label"] == bed.label
        tenant = Tenant.objects.get()
        assert (tenant.full_name, tenant.phone, tenant.id_last4) == (
            "Divya Rao",
            "9845022222",
            "7788",
        )
        assert tenant.consent_given_at is not None
        stay = Stay.objects.get()
        assert stay.bed == bed and stay.monthly_rent == bed.monthly_rent
        bed.refresh_from_db()
        assert bed.status == "occupied"
        assert mail.outbox[0].to == ["divya@example.com"]
        # the seeker sees the outcome and their bed
        mine = seeker[1].get(MINE).json()["results"][0]
        assert mine["status"] == "approved" and mine["allocated"]["room_number"] == "101"

    def test_existing_tenant_is_reused(self, owner: Actor, app: Application) -> None:
        existing = make_tenant(owner.organization, phone="9845022222", full_name="Divya R")
        bed = Bed.objects.filter(room__property=app.listing.property).first()
        assert bed is not None
        owner.client.post(self.approve_url(app), {"bed": str(bed.pk), "check_in": "2026-11-01"})
        assert Tenant.objects.count() == 1
        assert Stay.objects.get().tenant == existing

    def test_bed_must_be_in_the_listed_property(self, owner: Actor, app: Application) -> None:
        other_bed = make_room(make_property(owner.organization, name="Other")).beds.first()
        response = owner.client.post(
            self.approve_url(app), {"bed": str(other_bed.pk), "check_in": "2026-11-01"}
        )
        assert response.json()["error"]["code"] == "wrong_property"
        assert Application.objects.get().status == "pending"

    def test_occupied_bed_and_foreign_bed(
        self, owner: Actor, outsider: Actor, app: Application
    ) -> None:
        bed = Bed.objects.filter(room__property=app.listing.property).first()
        assert bed is not None
        Bed.objects.filter(pk=bed.pk).update(status="occupied")
        assert (
            owner.client.post(
                self.approve_url(app), {"bed": str(bed.pk), "check_in": "2026-11-01"}
            ).json()["error"]["code"]
            == "bed_unavailable"
        )
        foreign = make_room(make_property(outsider.organization)).beds.first()
        assert (
            owner.client.post(
                self.approve_url(app), {"bed": str(foreign.pk), "check_in": "2026-11-01"}
            ).status_code
            == 400
        )

    def test_decline_with_reason(self, owner: Actor, app: Application, seeker) -> None:
        url = reverse("v1:application-decline", args=[app.pk])
        assert owner.client.post(url, {}).status_code == 400
        mail.outbox.clear()
        response = owner.client.post(url, {"reason": "Full for November"})
        assert response.json()["status"] == "declined"
        assert "Full for November" in mail.outbox[0].body
        assert seeker[1].get(MINE).json()["results"][0]["decline_reason"] == "Full for November"
        again = owner.client.post(url, {"reason": "x"})
        assert again.json()["error"]["code"] == "not_pending"

    def test_staff_and_outsiders(self, owner: Actor, outsider: Actor, app: Application) -> None:
        staff = make_actor(Role.STAFF, organization=owner.organization)
        assert staff.client.get(INBOX).status_code == 403
        assert outsider.client.get(INBOX).json()["results"] == []
        assert_isolated(
            outsider.client, reverse("v1:application-detail", args=[app.pk]), methods=["get"]
        )
        for action in ("approve", "decline"):
            url = reverse(f"v1:application-{action}", args=[app.pk])
            assert outsider.client.post(url, {"reason": "x"}).status_code == 404


class TestWishlist:
    def test_add_list_remove(self, owner: Actor, seeker) -> None:
        user, client = seeker
        listing = make_listing(owner)
        url = reverse("v1:my-wishlist")
        assert client.post(url, {"listing": listing.slug}).status_code == 201
        assert client.post(url, {"listing": listing.slug}).status_code == 201  # idempotent
        rows = client.get(url).json()
        assert [r["slug"] for r in rows] == [listing.slug]
        assert rows[0]["contact_phone"] == "9845000000"  # signed in, so visible
        assert client.delete(reverse("v1:my-wishlist-item", args=[listing.slug])).status_code == 204
        assert client.get(url).json() == []

    def test_private_and_public_only(self, owner: Actor, seeker, anon: APIClient) -> None:
        user, client = seeker
        hidden = make_listing(owner, verified=False)
        assert client.post(reverse("v1:my-wishlist"), {"listing": hidden.slug}).status_code == 404
        assert anon.get(reverse("v1:my-wishlist")).status_code == 401
        listing = make_listing(owner)
        WishlistItem.objects.create(user=user, listing=listing)
        assert authed_client(make_user()).get(reverse("v1:my-wishlist")).json() == []
