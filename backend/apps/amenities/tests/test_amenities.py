from typing import Any

import pytest
from django.urls import reverse
from rest_framework.test import APIClient

from apps.amenities import catalog
from apps.amenities.models import Amenity, AmenityCategory, PropertyAmenity
from apps.properties.models import Property
from core.models import AuditLog
from core.tests.support import Actor, make_listing, make_property, make_room

CATALOG = reverse("v1:amenity-catalog")


@pytest.fixture(autouse=True)
def amenity_catalog(db: Any) -> None:
    # Tests that flush the database (transaction=True) also remove the migrated catalog.
    catalog.sync(AmenityCategory, Amenity)


def url(prop: Property) -> str:
    return reverse("v1:property-amenities", args=[prop.pk])


def put(actor: Actor, prop: Property, *assignments: dict[str, Any]) -> Any:
    return actor.client.put(url(prop), {"assignments": list(assignments)}, format="json")


def field_errors(response: Any, index: int = 0) -> dict[str, Any]:
    return response.json()["error"]["fields"]["assignments"][index]


class TestCatalog:
    def test_categories_and_amenities_from_the_database(self, anon: APIClient) -> None:
        body = anon.get(CATALOG).json()
        names = [c["name"] for c in body["categories"]]
        assert names == [name for _, name in catalog.CATEGORIES]  # all 14, in order
        keys = [a["key"] for c in body["categories"] for a in c["amenities"]]
        assert len(keys) == len(set(keys)) >= 60  # no duplicates across categories
        assert {"ac", "wifi", "meals", "parking", "private_entrance"} <= set(keys)
        assert {"value": "house", "label": "Independent house"} in body["property_types"]
        wifi = next(a for c in body["categories"] for a in c["amenities"] if a["key"] == "wifi")
        assert wifi["supports_sharing"] and wifi["supports_charge"]
        assert [attr["key"] for attr in wifi["attributes"]] == ["coverage", "speed_mbps"]

    def test_filtered_by_property_type(self, anon: APIClient) -> None:
        def keys(**params: str) -> set[str]:
            body = anon.get(CATALOG, params).json()
            return {a["key"] for c in body["categories"] for a in c["amenities"]}

        pg, house = keys(property_type="pg"), keys(property_type="house")
        assert "meals" in pg and "meals" not in house
        assert "private_entrance" in house and "private_entrance" not in pg
        assert {"wifi", "parking", "cctv"} <= pg & house  # common amenities
        assert anon.get(CATALOG, {"property_type": "castle"}).status_code == 400

    def test_only_active_and_filterable(self, anon: APIClient) -> None:
        Amenity.objects.filter(key="gym").update(is_active=False)
        body = anon.get(CATALOG, {"filterable": "true"}).json()
        keys = {a["key"] for c in body["categories"] for a in c["amenities"]}
        assert "wifi" in keys and "gym" not in keys and "mattress" not in keys

    def test_sync_is_idempotent_and_keeps_admin_edits(self) -> None:
        Amenity.objects.filter(key="wifi").update(name="WiFi (fast)")
        created, updated = catalog.sync(AmenityCategory, Amenity)
        assert (created, updated) == (0, 0)
        assert Amenity.objects.get(key="wifi").name == "WiFi (fast)"
        catalog.sync(AmenityCategory, Amenity, overwrite=True)
        assert Amenity.objects.get(key="wifi").name == "Wi-Fi"


class TestSaveAmenities:
    def test_save_read_edit_and_remove(self, owner: Actor) -> None:
        prop = make_property(owner.organization, property_type="pg")
        response = put(
            owner,
            prop,
            {
                "amenity": "wifi",
                "sharing": "shared",
                "charge": "included",
                "details": {"coverage": "whole", "speed_mbps": 100},
            },
            {
                "amenity": "meals",
                "charge": "extra",
                "charge_amount": 300000,
                "charge_period": "month",
                "details": {"meals": ["dinner", "breakfast"], "diet": "veg"},
            },
            {"amenity": "lift", "status": "unavailable"},
        )
        assert response.status_code == 200, response.json()
        rows = {r["amenity"]: r for r in owner.client.get(url(prop)).json()}
        assert set(rows) == {"wifi", "meals", "lift"}
        assert rows["meals"]["details"]["meals"] == ["breakfast", "dinner"]  # canonical order
        assert rows["meals"]["charge_label"] == "₹3,000 per month"
        assert rows["wifi"]["detail_labels"] == ["Whole property", "Speed: 100 Mbps"]
        assert rows["lift"]["status"] == "unavailable"
        prop.refresh_from_db()
        assert prop.amenities == ["meals", "wifi"]  # only available ones, for search

        # edit wifi, drop meals: the PUT is the complete set
        response = put(owner, prop, {"amenity": "wifi", "sharing": "private"})
        assert response.status_code == 200
        [row] = response.json()
        assert (row["amenity"], row["sharing"], row["charge"], row["details"]) == (
            "wifi",
            "private",
            "",
            {},
        )
        prop.refresh_from_db()
        assert prop.amenities == ["wifi"]
        assert PropertyAmenity.objects.count() == 1
        assert AuditLog.objects.filter(action="property.amenities_updated").count() == 2

    def test_clear_all(self, owner: Actor) -> None:
        prop = make_property(owner.organization)
        put(owner, prop, {"amenity": "cctv"})
        assert put(owner, prop).json() == []
        prop.refresh_from_db()
        assert prop.amenities == []

    def test_room_level(self, owner: Actor) -> None:
        prop = make_property(owner.organization)
        r1, r2 = make_room(prop, number="101"), make_room(prop, number="102")
        response = put(
            owner,
            prop,
            {"amenity": "ac", "level": "room", "rooms": [str(r2.pk), str(r1.pk)], "quantity": 2},
        )
        assert response.status_code == 200, response.json()
        [row] = response.json()
        assert row["room_numbers"] == ["101", "102"]
        assert row["detail_labels"] == ["2 available"]

    @pytest.mark.parametrize(
        "payload,field",
        [
            ({"amenity": "cctv", "sharing": "private"}, "sharing"),
            ({"amenity": "cctv", "charge": "included"}, "charge"),
            ({"amenity": "cctv", "quantity": 3}, "quantity"),
            ({"amenity": "wifi", "charge": "extra", "charge_period": "month"}, "charge_amount"),
            ({"amenity": "wifi", "charge": "extra", "charge_amount": 50000}, "charge_period"),
            ({"amenity": "wifi", "charge": "included", "charge_amount": 50000}, "charge_amount"),
            (
                {
                    "amenity": "wifi",
                    "charge": "extra",
                    "charge_amount": 999_999_999,
                    "charge_period": "month",
                },
                "charge_amount",
            ),
            ({"amenity": "lift", "level": "room"}, "level"),
            ({"amenity": "ac", "level": "room", "rooms": []}, "rooms"),
            ({"amenity": "lift", "status": "unavailable", "note": "", "sharing": ""}, None),
            ({"amenity": "wifi", "status": "unavailable", "sharing": "shared"}, "sharing"),
            ({"amenity": "meals", "status": "unavailable", "details": {"diet": "veg"}}, "details"),
            ({"amenity": "wifi", "details": {"coverage": "moon"}}, "details"),
            ({"amenity": "wifi", "details": {"speed_mbps": 0}}, "details"),
            ({"amenity": "wifi", "details": {"colour": "red"}}, "details"),
            ({"amenity": "meals", "details": {"meals": ["brunch"]}}, "details"),
            ({"amenity": "kitchen", "details": {"self_cooking": "maybe"}}, "details"),
            ({"amenity": "teleporter"}, "amenity"),
            ({"amenity": "wifi", "sharing": "both"}, "sharing"),
        ],
    )
    def test_validation(self, owner: Actor, payload: dict[str, Any], field: str | None) -> None:
        prop = make_property(owner.organization)
        response = put(owner, prop, payload)
        if field is None:
            assert response.status_code == 200, response.json()
            return
        assert response.status_code == 400, response.json()
        assert field in field_errors(response)
        assert not PropertyAmenity.objects.exists()  # nothing saved from a rejected set

    def test_amenity_must_fit_property_type(self, owner: Actor) -> None:
        house = make_property(owner.organization, property_type="house")
        response = put(owner, house, {"amenity": "meals"})
        assert response.status_code == 400
        assert "does not apply to this property type (Independent house)" in str(
            field_errors(response)["amenity"]
        )
        assert put(owner, house, {"amenity": "private_entrance"}).status_code == 200

    def test_duplicates_rejected(self, owner: Actor) -> None:
        prop = make_property(owner.organization)
        response = put(owner, prop, {"amenity": "wifi"}, {"amenity": "wifi", "sharing": "private"})
        assert response.status_code == 400
        assert "listed twice" in str(response.json()["error"]["fields"]["assignments"])

    def test_rooms_must_be_in_this_property(self, owner: Actor) -> None:
        prop, other = make_property(owner.organization), make_property(owner.organization, name="B")
        room = make_room(other, number="9")
        response = put(owner, prop, {"amenity": "ac", "level": "room", "rooms": [str(room.pk)]})
        assert response.status_code == 400
        assert "not in this property" in str(field_errors(response)["rooms"])

    def test_changing_property_type_drops_amenities_that_no_longer_apply(
        self, owner: Actor
    ) -> None:
        prop = make_property(owner.organization, property_type="pg")
        put(owner, prop, {"amenity": "meals"}, {"amenity": "wifi"})
        response = owner.client.patch(
            reverse("v1:property-detail", args=[prop.pk]), {"property_type": "apartment"}
        )
        assert response.status_code == 200
        assert response.json()["amenities"] == ["wifi"]
        assert [r["amenity"] for r in owner.client.get(url(prop)).json()] == ["wifi"]


class TestPermissions:
    def test_staff_read_but_cannot_change(self, owner: Actor, staff: Actor) -> None:
        prop = make_property(owner.organization)
        put(owner, prop, {"amenity": "cctv"})
        assert [r["amenity"] for r in staff.client.get(url(prop)).json()] == ["cctv"]
        response = put(staff, prop, {"amenity": "wifi"})
        assert response.status_code == 403
        assert response.json()["error"]["code"] == "insufficient_role"

    def test_manager_can_change(self, manager: Actor) -> None:
        prop = make_property(manager.organization)
        assert put(manager, prop, {"amenity": "wifi"}).status_code == 200

    def test_other_organization_gets_404(self, owner: Actor, outsider: Actor) -> None:
        prop = make_property(owner.organization)
        put(owner, prop, {"amenity": "cctv"})
        assert outsider.client.get(url(prop)).status_code == 404
        assert put(outsider, prop, {"amenity": "wifi"}).status_code == 404
        assert list(prop.amenity_assignments.values_list("amenity__key", flat=True)) == ["cctv"]

    def test_rooms_from_another_organization_look_missing(
        self, owner: Actor, outsider: Actor
    ) -> None:
        prop = make_property(owner.organization)
        foreign = make_room(make_property(outsider.organization), number="1")
        response = put(owner, prop, {"amenity": "ac", "level": "room", "rooms": [str(foreign.pk)]})
        assert response.status_code == 400
        assert "does not exist" in str(field_errors(response)["rooms"])

    def test_anonymous_refused(self, anon: APIClient, owner: Actor) -> None:
        prop = make_property(owner.organization)
        assert anon.get(url(prop)).status_code == 401


class TestMarketplace:
    def test_listing_shows_only_available_amenities_with_how_they_are_offered(
        self, owner: Actor, anon: APIClient
    ) -> None:
        prop = make_property(owner.organization, amenities=[])
        listing = make_listing(owner, property=prop)
        put(
            owner,
            prop,
            {"amenity": "wifi", "sharing": "shared", "charge": "included"},
            {
                "amenity": "gym",
                "sharing": "private",
                "charge": "extra",
                "charge_amount": 50000,
                "charge_period": "month",
            },
            {"amenity": "lift", "status": "unavailable"},
        )
        body = anon.get(reverse("v1:public-listing", args=[listing.slug])).json()
        details = {a["key"]: a for a in body["amenity_details"]}
        assert set(details) == {"wifi", "gym"}
        assert details["wifi"]["sharing"] == "shared"
        assert details["wifi"]["charge_label"] == "Included in rent"
        assert details["gym"]["charge_label"] == "₹500 per month"
        assert details["gym"]["category_name"] == "Fitness & Recreation"
        assert body["amenities"] == ["gym", "wifi"]

    def test_search_filter_uses_assigned_amenities(self, owner: Actor, anon: APIClient) -> None:
        with_gym = make_property(owner.organization, name="Alpha", amenities=[])
        without = make_property(owner.organization, name="Beta", amenities=[])
        make_listing(owner, property=with_gym)
        make_listing(owner, property=without)
        put(owner, with_gym, {"amenity": "gym"}, {"amenity": "wifi"})
        put(owner, without, {"amenity": "wifi"}, {"amenity": "gym", "status": "unavailable"})
        search = reverse("v1:public-listing-list")
        names = lambda q: {r["name"] for r in anon.get(search, {"amenities": q}).json()["results"]}  # noqa: E731
        assert names("wifi") == {"Alpha", "Beta"}
        assert names("gym") == {"Alpha"}  # "not available" does not match
        assert names("hot water") == set()  # old words still accepted, mapped to geyser


class TestLegacyMigration:
    def test_old_words_become_assignments_and_unknown_words_are_kept(self, owner: Actor) -> None:
        import importlib

        from django.apps import apps as django_apps

        migration = importlib.import_module(
            "apps.amenities.migrations.0002_catalog_and_legacy_amenities"
        )
        prop = make_property(
            owner.organization, amenities=["wifi", "hot water", "Food", "rooftop sauna", "wifi"]
        )
        migration.forwards(django_apps, None)
        prop.refresh_from_db()
        keys = set(prop.amenity_assignments.values_list("amenity__key", flat=True))
        assert keys == {"wifi", "geyser", "meals"}
        assert prop.amenities == ["geyser", "meals", "rooftop sauna", "wifi"]
        migration.forwards(django_apps, None)  # running twice changes nothing
        assert prop.amenity_assignments.count() == 3
