"""Room features (balcony, geyser ...) with extra charges, and beds never exceeding sharing."""

import datetime as dt
from typing import Any

import pytest
from django.urls import reverse

from apps.organizations.models import Role
from apps.properties.models import Bed, RoomFeature
from core.tests.support import Actor, make_actor, make_property, make_stay, make_tenant

ROOMS = reverse("v1:room-list")
BEDS = reverse("v1:bed-list")
CHOICES = reverse("v1:room-feature-choices")


def room_url(pk: Any, action: str | None = None) -> str:
    return reverse(f"v1:room-{action or 'detail'}", args=[pk])


def add_room(actor: Actor, prop_id: Any, **over: Any) -> Any:
    payload = {"property": str(prop_id), "number": "101", "sharing": 2, "bed_rent": 850000, **over}
    return actor.client.post(ROOMS, payload, format="json")


@pytest.fixture
def prop(owner: Actor) -> Any:
    return make_property(owner.organization)


class TestFeatureChoices:
    def test_choices_come_from_the_catalog(self, owner: Actor) -> None:
        body = owner.client.get(CHOICES).json()
        keys = [c["key"] for c in body]
        assert "balcony" in keys and "geyser" in keys
        assert "ac" not in keys and "bathroom" not in keys  # they have their own switches
        assert "wifi" not in keys  # property-wide, not a room feature

    def test_staff_can_read_choices(self, owner: Actor) -> None:
        staff = make_actor(Role.STAFF, organization=owner.organization)
        assert staff.client.get(CHOICES).status_code == 200


class TestRoomFeatures:
    def test_add_room_with_balcony_as_extra(self, owner: Actor, prop: Any) -> None:
        response = add_room(
            owner,
            prop.pk,
            features=[
                {"amenity": "balcony", "charge": "extra", "charge_amount": 50000},
                {"amenity": "geyser"},
            ],
        )
        assert response.status_code == 201, response.json()
        body = response.json()
        assert body["features"] == [
            {
                "amenity": "balcony",
                "name": "Balcony",
                "charge": "extra",
                "charge_label": "Extra charge",
                "charge_amount": 50000,
            },
            {
                "amenity": "geyser",
                "name": "Hot water / geyser",
                "charge": "included",
                "charge_label": "Included in rent",
                "charge_amount": None,
            },
        ]
        assert body["extra_charges"] == 50000

    def test_editing_replaces_the_whole_list(self, owner: Actor, prop: Any) -> None:
        room = add_room(owner, prop.pk, features=[{"amenity": "balcony"}]).json()
        response = owner.client.patch(
            room_url(room["id"]), {"features": [{"amenity": "television"}]}, format="json"
        )
        assert response.status_code == 200, response.json()
        assert [f["amenity"] for f in response.json()["features"]] == ["television"]
        unchanged = owner.client.patch(room_url(room["id"]), {"is_ac": True}, format="json")
        assert [f["amenity"] for f in unchanged.json()["features"]] == ["television"]

    @pytest.mark.parametrize(
        "features,message",
        [
            ([{"amenity": "balcony", "charge": "extra"}], "Balcony: enter the extra charge"),
            ([{"amenity": "wifi"}], "is not a room feature"),
            ([{"amenity": "balcony"}, {"amenity": "balcony"}], "Balcony is listed twice"),
        ],
    )
    def test_bad_features_are_explained(
        self, owner: Actor, prop: Any, features: list[dict[str, Any]], message: str
    ) -> None:
        response = add_room(owner, prop.pk, features=features)
        assert response.status_code == 400
        assert message in str(response.json()["error"]["fields"]["features"])

    def test_included_feature_never_keeps_an_amount(self, owner: Actor, prop: Any) -> None:
        add_room(
            owner,
            prop.pk,
            features=[{"amenity": "balcony", "charge": "included", "charge_amount": 30000}],
        )
        assert RoomFeature.objects.get().charge_amount is None

    def test_staff_cannot_change_features(self, owner: Actor, prop: Any) -> None:
        room = add_room(owner, prop.pk).json()
        staff = make_actor(Role.STAFF, organization=owner.organization)
        response = staff.client.patch(
            room_url(room["id"]), {"features": [{"amenity": "balcony"}]}, format="json"
        )
        assert response.status_code == 403

    def test_other_business_cannot_see_the_room(self, owner: Actor, prop: Any) -> None:
        room = add_room(owner, prop.pk, features=[{"amenity": "balcony"}]).json()
        other = make_actor(Role.OWNER)
        assert other.client.get(room_url(room["id"])).status_code == 404

    def test_extra_charge_is_added_to_the_rent_bill(self, owner: Actor) -> None:
        prop = make_property(owner.organization, rent_due_day=5)
        room = add_room(
            owner,
            prop.pk,
            features=[{"amenity": "balcony", "charge": "extra", "charge_amount": 50000}],
        ).json()
        bed = Bed.objects.get(pk=room["beds"][0]["id"])
        make_stay(owner, bed, make_tenant(owner.organization), dt.date(2026, 10, 1))
        created = owner.client.post(reverse("v1:invoice-generate"), {"period": "2026-10"})
        assert created.status_code == 201, created.json()
        invoice = owner.client.get(reverse("v1:invoice-list")).json()["results"][0]
        assert invoice["total"] == 850000 + 50000
        lines = [(line["description"], line["amount"]) for line in invoice["lines"]]
        assert ("Balcony (extra charge)", 50000) in lines

    def test_extra_charge_is_pro_rated_with_the_rent(self, owner: Actor) -> None:
        prop = make_property(owner.organization)
        room = add_room(
            owner,
            prop.pk,
            features=[{"amenity": "balcony", "charge": "extra", "charge_amount": 31000}],
        ).json()
        bed = Bed.objects.get(pk=room["beds"][0]["id"])
        make_stay(owner, bed, make_tenant(owner.organization), dt.date(2026, 10, 17))
        owner.client.post(reverse("v1:invoice-generate"), {"period": "2026-10"})
        invoice = owner.client.get(reverse("v1:invoice-list")).json()["results"][0]
        extra = next(ln for ln in invoice["lines"] if ln["description"].startswith("Balcony"))
        assert extra["amount"] == 15000  # 15 of 31 days


class TestBedsNeverExceedSharing:
    def test_two_sharing_room_takes_only_two_beds(self, owner: Actor, prop: Any) -> None:
        room = add_room(owner, prop.pk).json()
        assert len(room["beds"]) == 2
        response = owner.client.post(BEDS, {"room": room["id"], "label": "C", "monthly_rent": 1})
        assert response.status_code == 409
        assert response.json()["error"]["code"] == "room_full"
        assert "2 sharing and already has 2 beds" in response.json()["error"]["message"]

    def test_raising_sharing_allows_another_bed(self, owner: Actor, prop: Any) -> None:
        room = add_room(owner, prop.pk).json()
        owner.client.patch(room_url(room["id"]), {"sharing": 3}, format="json")
        response = owner.client.post(
            BEDS, {"room": room["id"], "label": "C", "monthly_rent": 850000}
        )
        assert response.status_code == 201, response.json()

    def test_sharing_cannot_drop_below_the_beds(self, owner: Actor, prop: Any) -> None:
        room = add_room(owner, prop.pk, sharing=3).json()
        response = owner.client.patch(room_url(room["id"]), {"sharing": 2}, format="json")
        assert response.status_code == 400
        assert "has 3 beds. Remove 1 bed first" in str(response.json()["error"]["fields"])

    def test_removed_beds_do_not_count(self, owner: Actor, prop: Any) -> None:
        room = add_room(owner, prop.pk).json()
        bed_id = room["beds"][1]["id"]
        owner.client.post(reverse("v1:bed-archive", args=[bed_id]))
        response = owner.client.post(BEDS, {"room": room["id"], "label": "C", "monthly_rent": 1})
        assert response.status_code == 201, response.json()
        # the removed bed cannot come back while the room is full again
        restore = owner.client.post(reverse("v1:bed-restore", args=[bed_id]))
        assert restore.status_code == 409

    def test_cannot_ask_for_more_beds_than_sharing(self, owner: Actor, prop: Any) -> None:
        response = add_room(owner, prop.pk, sharing=2, bed_count=3)
        assert response.status_code == 400
        assert "at most 2 beds" in str(response.json()["error"]["fields"])

    def test_free_place_shows_the_extra(self, owner: Actor, prop: Any) -> None:
        add_room(
            owner,
            prop.pk,
            features=[{"amenity": "balcony", "charge": "extra", "charge_amount": 50000}],
        )
        rows = owner.client.get(reverse("v1:stay-free-places"), {"property": str(prop.pk)}).json()
        assert rows[0]["detail"] == "2 sharing · Balcony +₹500/month"
