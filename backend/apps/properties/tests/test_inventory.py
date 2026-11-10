"""Floors, flats/portions, rooms and beds; statuses, readiness, archiving and bulk actions."""

from __future__ import annotations

import datetime as dt
import importlib
from typing import Any

import pytest
from django.urls import reverse

from apps.properties.models import Bed, Floor, Letting, Property, RentalUnit, Room
from core.models import AuditLog
from core.tests.support import (
    Actor,
    assert_isolated,
    make_property,
    make_room,
    make_stay,
    make_tenant,
)

PROPS = reverse("v1:property-list")
FLOORS = reverse("v1:floor-list")
UNITS = reverse("v1:unit-list")
ROOMS = reverse("v1:room-list")
BEDS = reverse("v1:bed-list")
BULK = reverse("v1:property-bulk")


def url(name: str, pk: Any, action: str | None = None) -> str:
    return reverse(f"v1:{name}-{action or 'detail'}", args=[pk])


def new_property(actor: Actor, **over: Any) -> dict[str, Any]:
    payload = {
        "name": "Sunrise Comforts",
        "address_line": "22, 14th Main",
        "locality": "HSR Layout",
        "property_type": "pg",
        **over,
    }
    response = actor.client.post(PROPS, payload)
    assert response.status_code == 201, response.json()
    return response.json()


def readiness(actor: Actor, pk: Any) -> dict[str, Any]:
    response = actor.client.get(url("property", pk, "readiness"))
    assert response.status_code == 200
    return response.json()


def problem_codes(actor: Actor, pk: Any) -> list[str]:
    return [p["code"] for p in readiness(actor, pk)["problems"]]


def add_unit(actor: Actor, prop_id: Any, **over: Any) -> Any:
    response = actor.client.post(UNITS, {"property": prop_id, "code": "Flat 101", **over})
    assert response.status_code == 201, response.json()
    return response.json()


def add_room(actor: Actor, prop_id: Any, **over: Any) -> Any:
    payload = {"property": prop_id, "number": "101", "sharing": 2, "bed_rent": 850000, **over}
    response = actor.client.post(ROOMS, payload, format="json")
    assert response.status_code == 201, response.json()
    return response.json()


class TestStatuses:
    def test_new_property_is_not_finished_until_opened(self, owner: Actor) -> None:
        prop = new_property(owner)
        assert prop["status"] == "draft"
        assert prop["status_label"] == "Not finished"
        assert prop["is_active"] is False
        assert prop["verification_status_label"] == "Not checked yet"
        assert problem_codes(owner, prop["id"]) == ["nothing_to_rent"]

        refused = owner.client.post(url("property", prop["id"], "activate"))
        assert refused.status_code == 409
        assert refused.json()["error"]["code"] == "cannot_activate"
        assert "Add at least one room" in refused.json()["error"]["message"]

        add_room(owner, prop["id"])
        opened = owner.client.post(url("property", prop["id"], "activate"))
        assert opened.status_code == 200, opened.json()
        assert opened.json()["status_label"] == "Open"
        assert opened.json()["beds_total"] == 2
        assert Property.objects.get().is_active is True
        assert AuditLog.objects.filter(action="property.activate").count() == 1

    def test_close_remove_restore(self, owner: Actor) -> None:
        prop = make_property(owner.organization)
        make_room(prop)
        for action, expected in (
            ("deactivate", "inactive"),
            ("archive", "archived"),
            ("restore", "inactive"),
            ("activate", "active"),
        ):
            response = owner.client.post(url("property", prop.pk, action))
            assert response.status_code == 200, (action, response.json())
            assert response.json()["status"] == expected
        again = owner.client.post(url("property", prop.pk, "restore"))
        assert again.status_code == 409
        assert again.json()["error"]["message"] == "Only a removed property can be restored."

    def test_cannot_remove_while_tenants_live_there(self, owner: Actor) -> None:
        prop = make_property(owner.organization)
        bed = make_room(prop).beds.first()
        make_stay(owner, bed, make_tenant(owner.organization), dt.date(2026, 9, 1))
        response = owner.client.post(url("property", prop.pk, "archive"))
        assert response.status_code == 409
        assert "Check them out first" in response.json()["error"]["message"]

    def test_status_is_not_writable_directly(self, owner: Actor) -> None:
        prop = new_property(owner)
        owner.client.patch(url("property", prop["id"]), {"status": "active"})
        assert Property.objects.get().status == Property.Status.DRAFT

    def test_staff_cannot_change_status_but_can_read_readiness(
        self, owner: Actor, staff: Actor
    ) -> None:
        prop = make_property(owner.organization)
        assert staff.client.post(url("property", prop.pk, "deactivate")).status_code == 403
        assert staff.client.get(url("property", prop.pk, "readiness")).status_code == 200
        assert staff.client.get(url("property", prop.pk, "inventory")).status_code == 200

    def test_other_organization_gets_404_on_actions(self, owner: Actor, outsider: Actor) -> None:
        prop = make_property(owner.organization)
        for action in ("activate", "deactivate", "archive", "restore"):
            response = outsider.client.post(url("property", prop.pk, action))
            assert response.status_code == 404
        assert outsider.client.get(url("property", prop.pk, "readiness")).status_code == 404
        assert outsider.client.get(url("property", prop.pk, "inventory")).status_code == 404


class TestPropertyTypes:
    def test_pg_with_floors_rooms_and_beds(self, owner: Actor) -> None:
        prop = new_property(owner)
        for floor in (0, 1, 2):
            for n in range(1, 5):
                add_room(owner, prop["id"], number=f"{floor}0{n}", floor_number=floor)
        assert Floor.objects.filter(property_id=prop["id"]).count() == 3
        room = Room.objects.get(number="101")
        assert room.floor is not None and room.floor.display_name == "1st floor"
        assert room.beds.count() == 2
        assert readiness(owner, prop["id"]) == {"ready": True, "problems": []}
        tree = owner.client.get(url("property", prop["id"], "inventory")).json()
        assert [f["display_name"] for f in tree["floors"]] == [
            "Ground floor",
            "1st floor",
            "2nd floor",
        ]
        assert len(tree["rooms"]) == 12
        assert tree["rooms"][0]["letting_label"] == "Bed by bed"
        assert tree["rooms"][0]["floor_name"] == "Ground floor"

    def test_building_with_eight_flats_rented_whole(self, owner: Actor) -> None:
        prop = new_property(owner, name="Maple Residency", property_type="building")
        assert prop["unit_word"] == "Flat"
        floor = owner.client.post(FLOORS, {"property": prop["id"], "number": 1}).json()
        for n in range(1, 9):
            add_unit(
                owner,
                prop["id"],
                code=f"Flat {100 + n}",
                floor=floor["id"],
                unit_type="2bhk",
                monthly_rent=2500000,
            )
        add_unit(owner, prop["id"], code="Flat 109", unit_type="1bhk")
        problems = readiness(owner, prop["id"])["problems"]
        assert [p["message"] for p in problems] == ["Flat 109 has no rent."]
        owner.client.patch(
            url("unit", RentalUnit.objects.get(code="Flat 109").pk), {"monthly_rent": 1800000}
        )
        assert readiness(owner, prop["id"])["ready"] is True
        unit = owner.client.get(UNITS, {"property": prop["id"]}).json()["results"][0]
        assert unit["letting_label"] == "Whole flat"
        assert unit["unit_type_label"] == "2 BHK"
        assert unit["floor_name"] == "1st floor"

    def test_independent_house_gets_one_whole_house_unit(self, owner: Actor) -> None:
        prop = new_property(owner, name="Banyan Villa", property_type="house")
        assert prop["unit_word"] == "Portion"
        [unit] = RentalUnit.objects.filter(property_id=prop["id"])
        assert unit.code == "Whole house" and unit.letting == Letting.WHOLE
        assert [p["message"] for p in readiness(owner, prop["id"])["problems"]] == [
            "Whole house has no rent."
        ]

    def test_coliving_flat_rented_room_by_room(self, owner: Actor) -> None:
        prop = new_property(owner, property_type="coliving")
        unit = add_unit(owner, prop["id"], code="A-101", letting="by_parts", unit_type="3bhk")
        assert problem_codes(owner, prop["id"]) == ["unit_without_rooms", "nothing_to_rent"]
        for n in ("1", "2", "3"):
            room = add_room(
                owner,
                prop["id"],
                unit=unit["id"],
                number=n,
                sharing=1,
                letting="whole",
                monthly_rent=1200000,
            )
            assert room["beds"] == []
            assert room["letting_label"] == "Whole room"
        assert readiness(owner, prop["id"])["ready"] is True

    def test_mixed_private_and_shared_rooms(self, owner: Actor) -> None:
        prop = new_property(owner, property_type="coliving")
        add_room(owner, prop["id"], number="P1", sharing=1, letting="whole", monthly_rent=1500000)
        add_room(owner, prop["id"], number="S1", sharing=3)
        assert readiness(owner, prop["id"])["ready"] is True
        rooms = {r.number: r for r in Room.objects.all()}
        assert rooms["P1"].room_type == Room.RoomType.PRIVATE
        assert rooms["S1"].beds.count() == 3

    def test_house_types_shown_in_plain_words(self, owner: Actor) -> None:
        prop = new_property(owner, property_type="hostel")
        assert prop["property_type_label"] == "Hostel"


class TestStructureRules:
    def test_duplicate_codes_and_numbers(self, owner: Actor) -> None:
        prop = new_property(owner, property_type="building")
        add_unit(owner, prop["id"], code="Flat 302")
        dup = owner.client.post(UNITS, {"property": prop["id"], "code": "Flat 302"})
        assert dup.status_code == 400
        assert dup.json()["error"]["fields"]["code"] == [
            "Flat 302 already exists in this property."
        ]
        add_room(owner, prop["id"], number="1")
        dup_room = owner.client.post(
            ROOMS, {"property": prop["id"], "number": "1", "sharing": 2, "bed_rent": 1}
        )
        assert dup_room.status_code == 400
        assert dup_room.json()["error"]["fields"]["number"] == ["Room 1 already exists."]
        dup_floor = owner.client.post(FLOORS, {"property": prop["id"], "number": 0})
        assert dup_floor.status_code == 201
        assert owner.client.post(FLOORS, {"property": prop["id"], "number": 0}).status_code == 400

    def test_same_room_number_in_two_flats(self, owner: Actor) -> None:
        prop = new_property(owner, property_type="coliving")
        for code in ("A-101", "A-102"):
            unit = add_unit(owner, prop["id"], code=code, letting="by_parts")
            add_room(owner, prop["id"], unit=unit["id"], number="1")
        assert Room.objects.filter(number="1").count() == 2
        unit = RentalUnit.objects.get(code="A-101")
        clash = owner.client.post(
            ROOMS,
            {
                "property": prop["id"],
                "unit": str(unit.pk),
                "number": "1",
                "sharing": 2,
                "bed_rent": 1,
            },
        )
        assert clash.json()["error"]["fields"]["number"] == ["Room 1 already exists in A-101."]

    def test_rooms_in_a_flat_rented_whole_have_no_rent_or_beds(self, owner: Actor) -> None:
        prop = new_property(owner, property_type="apartment")
        unit = add_unit(owner, prop["id"], monthly_rent=3000000)
        room = add_room(owner, prop["id"], unit=unit["id"], number="Bedroom 1")
        assert room["letting"] == "whole" and room["beds"] == []
        with_rent = owner.client.post(
            ROOMS,
            {
                "property": prop["id"],
                "unit": unit["id"],
                "number": "Bedroom 2",
                "sharing": 1,
                "monthly_rent": 100000,
            },
        )
        assert with_rent.status_code == 400
        assert "rented as a whole" in with_rent.json()["error"]["fields"]["letting"][0]
        bed = owner.client.post(BEDS, {"room": room["id"], "label": "A", "monthly_rent": 1})
        assert bed.status_code == 400
        assert "rented as a whole" in bed.json()["error"]["fields"]["room"][0]

    def test_rent_sits_on_the_level_that_is_rented(self, owner: Actor) -> None:
        prop = new_property(owner)
        whole = owner.client.post(
            ROOMS, {"property": prop["id"], "number": "1", "sharing": 1, "letting": "whole"}
        )
        assert whole.json()["error"]["fields"]["monthly_rent"] == [
            "Enter the rent for the whole room."
        ]
        by_beds = owner.client.post(
            ROOMS,
            {"property": prop["id"], "number": "2", "sharing": 2, "bed_rent": 1, "monthly_rent": 5},
        )
        assert "set rent on each bed" in by_beds.json()["error"]["fields"]["monthly_rent"][0]
        unit = owner.client.post(
            UNITS,
            {"property": prop["id"], "code": "F1", "letting": "by_parts", "monthly_rent": 5},
        )
        assert unit.status_code == 400

    def test_parts_must_belong_to_the_same_property(self, owner: Actor) -> None:
        one, two = new_property(owner, name="One"), new_property(owner, name="Two")
        floor = owner.client.post(FLOORS, {"property": two["id"], "number": 1}).json()
        unit = add_unit(owner, two["id"])
        bad = owner.client.post(
            ROOMS,
            {
                "property": one["id"],
                "number": "1",
                "sharing": 1,
                "bed_rent": 1,
                "floor": floor["id"],
                "unit": unit["id"],
            },
        )
        assert bad.status_code == 400
        fields = bad.json()["error"]["fields"]
        assert fields["floor"] == ["This belongs to a different property."]
        assert fields["unit"] == ["This belongs to a different property."]
        moved = owner.client.patch(url("unit", unit["id"]), {"property": one["id"]})
        assert moved.status_code == 400

    def test_ids_from_another_organization_do_not_exist(
        self, owner: Actor, outsider: Actor
    ) -> None:
        theirs = make_property(outsider.organization)
        their_unit = RentalUnit.objects.create(
            organization=outsider.organization, property=theirs, code="X"
        )
        prop = new_property(owner)
        response = owner.client.post(
            ROOMS,
            {
                "property": prop["id"],
                "unit": str(their_unit.pk),
                "number": "1",
                "sharing": 1,
                "bed_rent": 1,
            },
        )
        assert response.status_code == 400
        assert "does not exist" in response.json()["error"]["fields"]["unit"][0]
        floor_into_theirs = owner.client.post(FLOORS, {"property": str(theirs.pk), "number": 1})
        assert floor_into_theirs.status_code == 400

    def test_switching_a_flat_to_whole_needs_rooms_without_rent(self, owner: Actor) -> None:
        prop = new_property(owner, property_type="coliving")
        unit = add_unit(owner, prop["id"], letting="by_parts")
        add_room(owner, prop["id"], unit=unit["id"], number="1")
        response = owner.client.patch(url("unit", unit["id"]), {"letting": "whole"})
        assert response.status_code == 400
        assert "Some rooms in this flat" in response.json()["error"]["fields"]["letting"][0]

    def test_cannot_rent_out_a_room_whole_while_beds_are_taken(self, owner: Actor) -> None:
        prop = make_property(owner.organization)
        room = make_room(prop)
        make_stay(owner, room.beds.first(), make_tenant(owner.organization), dt.date(2026, 9, 1))
        response = owner.client.patch(
            url("room", room.pk), {"letting": "whole", "monthly_rent": 2000000}
        )
        assert response.status_code == 409
        assert response.json()["error"]["code"] == "room_has_tenants"

    def test_beds_of_a_whole_room_cannot_be_rented_alone(self, owner: Actor) -> None:
        prop = make_property(owner.organization)
        room = make_room(prop)
        Room.objects.filter(pk=room.pk).update(letting=Letting.WHOLE, monthly_rent=100)
        tenants = owner.client.post(
            reverse("v1:stay-list"),
            {
                "tenant": str(make_tenant(owner.organization).pk),
                "bed": str(room.beds.first().pk),
                "check_in": "2026-10-01",
            },
        )
        assert tenants.status_code == 409, tenants.json()
        assert tenants.json()["error"]["code"] == "bed_not_rentable"

    def test_staff_cannot_change_inventory(self, owner: Actor, staff: Actor) -> None:
        prop = make_property(owner.organization)
        assert staff.client.post(UNITS, {"property": str(prop.pk), "code": "F"}).status_code == 403
        assert staff.client.post(FLOORS, {"property": str(prop.pk), "number": 1}).status_code == 403
        assert staff.client.get(UNITS).status_code == 200


class TestArchiving:
    def test_removing_a_room_hides_it_and_its_beds(self, owner: Actor) -> None:
        prop = make_property(owner.organization)
        room = make_room(prop, sharing=3)
        assert owner.client.post(url("room", room.pk, "archive")).status_code == 204
        assert owner.client.get(ROOMS).json()["results"] == []
        assert owner.client.get(BEDS).json()["results"] == []
        shown = owner.client.get(ROOMS, {"include_archived": "true"}).json()["results"]
        assert shown[0]["archived_at"] is not None
        [row] = owner.client.get(PROPS).json()["results"]
        assert row["beds_total"] == 0 and row["rooms_count"] == 0
        bed = room.beds.first()
        refused = owner.client.post(url("bed", bed.pk, "restore"))
        assert refused.status_code == 409
        assert owner.client.post(url("room", room.pk, "restore")).status_code == 204
        assert owner.client.post(url("bed", bed.pk, "restore")).status_code == 204
        assert owner.client.get(BEDS).json()["results"][0]["id"] == str(bed.pk)

    def test_cannot_remove_where_a_tenant_lives(self, owner: Actor) -> None:
        prop = make_property(owner.organization)
        room = make_room(prop)
        bed = room.beds.first()
        make_stay(owner, bed, make_tenant(owner.organization), dt.date(2026, 9, 1))
        assert owner.client.post(url("bed", bed.pk, "archive")).status_code == 409
        assert owner.client.post(url("room", room.pk, "archive")).status_code == 409

    def test_floor_in_use_cannot_be_removed(self, owner: Actor) -> None:
        prop = new_property(owner)
        add_room(owner, prop["id"], floor_number=1)
        floor = Floor.objects.get()
        response = owner.client.post(url("floor", floor.pk, "archive"))
        assert response.status_code == 409
        assert response.json()["error"]["code"] == "floor_in_use"

    def test_removed_flat_takes_its_rooms_along(self, owner: Actor) -> None:
        prop = new_property(owner, property_type="coliving")
        unit = add_unit(owner, prop["id"], letting="by_parts")
        add_room(owner, prop["id"], unit=unit["id"], number="1")
        assert owner.client.post(url("unit", unit["id"], "archive")).status_code == 204
        assert Room.objects.get().is_archived
        assert all(b.is_archived for b in Bed.objects.all())

    def test_archived_bed_cannot_get_a_tenant(self, owner: Actor) -> None:
        prop = make_property(owner.organization)
        bed = make_room(prop).beds.first()
        owner.client.post(url("bed", bed.pk, "archive"))
        bed.refresh_from_db()
        bed.status = Bed.Status.VACANT
        with pytest.raises(Exception, match="removed"):
            make_stay(owner, bed, make_tenant(owner.organization), dt.date(2026, 9, 1))

    def test_isolation_of_floors_and_units(self, owner: Actor, outsider: Actor) -> None:
        prop = new_property(owner, property_type="building")
        floor = owner.client.post(FLOORS, {"property": prop["id"], "number": 1}).json()
        unit = add_unit(owner, prop["id"])
        assert_isolated(outsider.client, url("floor", floor["id"]), payload={"name": "x"})
        assert_isolated(outsider.client, url("unit", unit["id"]), payload={"code": "x"})
        for name, pk in (("floor", floor["id"]), ("unit", unit["id"])):
            for action in ("archive", "restore"):
                assert outsider.client.post(url(name, pk, action)).status_code == 404
        assert outsider.client.get(UNITS).json()["results"] == []


class TestListAndBulk:
    def test_numbered_pages_search_filters_and_order(self, owner: Actor) -> None:
        for i in range(30):
            make_property(owner.organization, name=f"PG {i:02d}", locality="HSR Layout")
        make_property(
            owner.organization,
            name="Koramangala Nest",
            locality="Koramangala",
            property_type="coliving",
        )
        make_property(owner.organization, name="Old Place", status=Property.Status.ARCHIVED)
        page = owner.client.get(PROPS).json()
        assert page["count"] == 31 and len(page["results"]) == 25
        second = owner.client.get(PROPS, {"page": "2"}).json()
        assert len(second["results"]) == 6
        newest = owner.client.get(PROPS, {"ordering": "-name", "page_size": "1"}).json()
        assert newest["results"][0]["name"] == "PG 29"
        assert owner.client.get(PROPS, {"q": "nest"}).json()["count"] == 1
        assert owner.client.get(PROPS, {"property_type": "coliving"}).json()["count"] == 1
        assert owner.client.get(PROPS, {"locality": "koramangala"}).json()["count"] == 1
        assert owner.client.get(PROPS, {"status": "archived"}).json()["count"] == 1
        assert owner.client.get(PROPS, {"status": "all"}).json()["count"] == 32
        assert owner.client.get(PROPS, {"ordering": "price"}).status_code == 400
        assert owner.client.get(PROPS, {"status": "gone"}).status_code == 400

    def test_bulk_is_all_or_nothing(self, owner: Actor) -> None:
        ready = make_property(owner.organization, name="Ready", status=Property.Status.INACTIVE)
        make_room(ready)
        empty = make_property(owner.organization, name="Empty", status=Property.Status.DRAFT)
        response = owner.client.post(
            BULK, {"action": "activate", "ids": [str(ready.pk), str(empty.pk)]}, format="json"
        )
        assert response.status_code == 400
        [item] = response.json()["error"]["fields"]["items"]
        assert item["name"] == "Empty" and "Add at least one room" in item["message"]
        ready.refresh_from_db()
        assert ready.status == Property.Status.INACTIVE
        ok = owner.client.post(BULK, {"action": "activate", "ids": [str(ready.pk)]}, format="json")
        assert ok.status_code == 200
        ready.refresh_from_db()
        assert ready.status == Property.Status.ACTIVE

    def test_bulk_ignores_other_organizations(self, owner: Actor, outsider: Actor) -> None:
        theirs = make_property(outsider.organization)
        response = owner.client.post(
            BULK, {"action": "deactivate", "ids": [str(theirs.pk)]}, format="json"
        )
        assert response.status_code == 400
        assert response.json()["error"]["fields"]["ids"] == ["Some properties were not found."]
        theirs.refresh_from_db()
        assert theirs.status == Property.Status.ACTIVE

    def test_bulk_needs_owner_or_manager(self, owner: Actor, staff: Actor) -> None:
        prop = make_property(owner.organization)
        response = staff.client.post(
            BULK, {"action": "archive", "ids": [str(prop.pk)]}, format="json"
        )
        assert response.status_code == 403


def test_old_free_text_floors_are_understood() -> None:
    migration = importlib.import_module("apps.properties.migrations.0007_copy_existing_data")
    cases = {
        "G": 0,
        "ground": 0,
        "1": 1,
        "2nd": 2,
        "3rd floor": 3,
        "-1": -1,
        "Terrace": None,
        "": None,
        "999": None,
    }
    for text, expected in cases.items():
        assert migration.floor_number(text) == expected, text


@pytest.mark.parametrize(
    ("number", "name"),
    [
        (0, "Ground floor"),
        (1, "1st floor"),
        (2, "2nd floor"),
        (3, "3rd floor"),
        (11, "11th floor"),
        (21, "21st floor"),
        (-1, "Basement 1"),
    ],
)
def test_floor_names(number: int, name: str) -> None:
    from apps.properties.models import ordinal_floor

    assert ordinal_floor(number) == name


def test_unit_floor_can_be_given_as_a_number(owner: Actor) -> None:
    prop = new_property(owner, property_type="building")
    unit = add_unit(owner, prop["id"], code="Flat 301", floor_number=3)
    assert unit["floor_name"] == "3rd floor"
    moved = owner.client.patch(url("unit", unit["id"]), {"floor_number": 0}, format="json")
    assert moved.status_code == 200, moved.json()
    assert moved.json()["floor_name"] == "Ground floor"
    assert Floor.objects.filter(property_id=prop["id"]).count() == 2


def test_room_can_be_edited(owner: Actor) -> None:
    prop = new_property(owner)
    room = add_room(owner, prop["id"], number="101", floor_number=1)
    changed = owner.client.patch(
        url("room", room["id"]),
        {
            "number": "102",
            "is_ac": True,
            "has_attached_bath": True,
            "room_type": "private",
            "floor_number": 2,
        },
        format="json",
    )
    assert changed.status_code == 200, changed.json()
    body = changed.json()
    assert (body["number"], body["is_ac"], body["room_type_label"], body["floor_name"]) == (
        "102",
        True,
        "Private room",
        "2nd floor",
    )
    cleared = owner.client.patch(url("room", room["id"]), {"floor_number": None}, format="json")
    assert cleared.json()["floor_name"] == ""
