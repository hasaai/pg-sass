"""Bulk add rooms and beds from a CSV file."""

from typing import Any

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from django.urls import reverse

from apps.organizations.models import Role
from apps.properties.models import Bed, Letting, RentalUnit, Room
from core.tests.support import Actor, make_actor, make_property, make_room

GOOD = (
    "room,floor,sharing,rent_per_bed,whole_room_rent,room_type,ac,attached_bathroom\n"
    '201,2,3,"7,500",,shared,yes,no\n'
    "202,2,1,,₹14000,private,no,yes\n"
)


def url(prop: Any) -> str:
    return reverse("v1:property-rooms-import", args=[prop.pk])


def upload(
    actor: Actor, prop: Any, text: str, commit: bool = False, name: str = "rooms.csv"
) -> Any:
    file = SimpleUploadedFile(name, text.encode("utf-8"), content_type="text/csv")
    return actor.client.post(url(prop), {"file": file, "commit": commit}, format="multipart")


@pytest.fixture
def prop(owner: Actor) -> Any:
    return make_property(owner.organization)


class TestCheckFile:
    def test_check_only_saves_nothing(self, owner: Actor, prop: Any) -> None:
        response = upload(owner, prop, GOOD)
        assert response.status_code == 200, response.json()
        body = response.json()
        assert (body["valid"], body["invalid"], body["beds"], body["created"]) == (2, 0, 3, 0)
        assert body["rows"][0]["rent_per_bed"] == 750000
        assert body["rows"][1]["whole_room_rent"] == 1400000
        assert Room.objects.count() == 0

    def test_add_rooms_and_beds(self, owner: Actor, prop: Any) -> None:
        response = upload(owner, prop, GOOD, commit=True)
        assert response.status_code == 200, response.json()
        assert response.json()["created"] == 2
        shared = Room.objects.get(number="201")
        assert (shared.sharing, shared.is_ac, shared.floor.number) == (3, True, 2)
        assert sorted(b.label for b in shared.beds.all()) == ["A", "B", "C"]
        assert {b.monthly_rent for b in shared.beds.all()} == {750000}
        whole = Room.objects.get(number="202")
        assert (whole.letting, whole.monthly_rent, whole.beds.count()) == (
            Letting.WHOLE,
            1400000,
            0,
        )
        assert whole.has_attached_bath

    def test_problems_name_the_line_and_nothing_is_saved(self, owner: Actor, prop: Any) -> None:
        make_room(prop, number="101")
        text = (
            "Room Number,Sharing,Rent\n"
            "101,2,8000\n"  # already exists
            "103,two,8000\n"  # bad sharing
            "104,2,\n"  # no rent
            "105,2,8000\n"
            "105,2,8000\n"  # twice in the file
        )
        body = upload(owner, prop, text).json()
        problems = {r["row"]: r["problems"] for r in body["rows"]}
        assert "Room 101 already exists." in problems[2]
        assert "Sharing “two” is not a whole number." in problems[3]
        assert "Give the rent per bed, or a whole room rent." in problems[4]
        assert problems[5] == []
        assert "Room 105 is also on line 5." in problems[6]
        assert body["invalid"] == 4
        refused = upload(owner, prop, text, commit=True)
        assert refused.status_code == 400
        assert Room.objects.filter(property=prop).count() == 1

    def test_rooms_inside_a_flat(self, owner: Actor) -> None:
        building = make_property(owner.organization, property_type="building")
        RentalUnit.objects.create(
            organization=owner.organization,
            property=building,
            code="Flat 202",
            letting=Letting.BY_PARTS,
        )
        text = "room,sharing,rent_per_bed,flat\n1,1,12000,Flat 202\n2,1,11000,flat 999\n"
        body = upload(owner, building, text).json()
        assert body["rows"][0]["problems"] == []
        assert "There is no flat or portion “flat 999”" in body["rows"][1]["problems"][0]

    def test_semicolon_files_from_excel_work(self, owner: Actor, prop: Any) -> None:
        body = upload(owner, prop, "﻿room;sharing;rent_per_bed\n301;2;9000\n").json()
        assert body["valid"] == 1


class TestBadFiles:
    @pytest.mark.parametrize(
        "text,message",
        [
            ("", "file is empty"),
            ("\n\n", "The file is empty."),
            ("name,price\nx,1\n", "“room” and “sharing” are needed"),
            ("room,sharing\n", "no rooms"),
        ],
    )
    def test_unreadable_files_are_explained(
        self, owner: Actor, prop: Any, text: str, message: str
    ) -> None:
        response = upload(owner, prop, text)
        assert response.status_code == 400
        assert message in str(response.json()["error"]["fields"]["file"])

    def test_binary_file_is_refused(self, owner: Actor, prop: Any) -> None:
        file = SimpleUploadedFile("rooms.xlsx", b"PK\x03\x04\xff\xfe\x00", content_type="text/csv")
        response = owner.client.post(url(prop), {"file": file}, format="multipart")
        assert response.status_code == 400
        assert "CSV UTF-8" in str(response.json()["error"]["fields"]["file"])

    def test_too_many_rows(self, owner: Actor, prop: Any) -> None:
        text = "room,sharing,rent_per_bed\n" + "".join(f"{i},1,5000\n" for i in range(501))
        assert "Up to 500 rooms" in str(upload(owner, prop, text).json()["error"]["fields"])


class TestAccess:
    def test_staff_cannot_import(self, owner: Actor, prop: Any) -> None:
        staff = make_actor(Role.STAFF, organization=owner.organization)
        assert upload(staff, prop, GOOD).status_code == 403

    def test_other_business_gets_404(self, owner: Actor, prop: Any) -> None:
        other = make_actor(Role.OWNER)
        assert upload(other, prop, GOOD, commit=True).status_code == 404
        assert Bed.objects.count() == 0


class TestAmenityColumns:
    def test_yes_is_included_and_an_amount_is_an_extra_charge(
        self, owner: Actor, prop: Any
    ) -> None:
        text = (
            "room,floor,sharing,rent_per_bed,Balcony,geyser,Television,Refrigerator\n"
            "301,3,2,8000,yes,Yes,300,\n"
        )
        response = upload(owner, prop, text, commit=True)
        assert response.status_code == 200, response.json()
        room = Room.objects.get(number="301")
        features = {f.amenity.key: (f.charge, f.charge_amount) for f in room.features.all()}
        assert features == {
            "balcony": ("included", None),
            "geyser": ("included", None),
            "television": ("extra", 30000),
        }

    def test_a_bad_amenity_value_is_explained(self, owner: Actor, prop: Any) -> None:
        text = "room,sharing,rent_per_bed,Balcony\n301,2,8000,maybe\n"
        body = upload(owner, prop, text).json()
        assert body["invalid"] == 1
        assert "Balcony: write yes" in body["rows"][0]["problems"][0]

    def test_template_lists_every_room_amenity(self, owner: Actor) -> None:
        response = owner.client.get(reverse("v1:property-rooms-import-template"))
        assert response.status_code == 200
        header = response.content.decode().splitlines()[0].split(",")
        assert header[:3] == ["room", "floor", "sharing"]
        assert "Balcony" in header and "Hot water / geyser" in header

    def test_template_needs_manage_permission(self, owner: Actor) -> None:
        staff = make_actor(Role.STAFF, organization=owner.organization)
        assert staff.client.get(reverse("v1:property-rooms-import-template")).status_code == 403
