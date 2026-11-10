import pytest
from django.urls import reverse

from apps.organizations.models import Role
from apps.properties.models import Bed, Property
from core.tests.support import Actor, assert_isolated, make_actor, make_property, make_room

PROPS = reverse("v1:property-list")
ROOMS = reverse("v1:room-list")
BEDS = reverse("v1:bed-list")


def prop_payload(**over: object) -> dict[str, object]:
    return {
        "name": "Sunrise Comforts",
        "address_line": "22, 14th Main",
        "locality": "HSR Layout",
        "gender": "women",
        "property_type": "coliving",
        "pincode": "560102",
        **over,
    }


class TestProperties:
    def test_owner_creates_property(self, owner: Actor) -> None:
        response = owner.client.post(PROPS, prop_payload())
        assert response.status_code == 201, response.json()
        body = response.json()
        assert body["property_type"] == "coliving"
        assert body["amenities"] == []  # managed by /properties/{id}/amenities/
        assert body["city"] == "Bengaluru"
        assert Property.objects.get().organization == owner.organization

    def test_manager_can_create_staff_cannot(self, manager: Actor, staff: Actor) -> None:
        assert manager.client.post(PROPS, prop_payload()).status_code == 201
        response = staff.client.post(PROPS, prop_payload(name="Other"))
        assert response.status_code == 403
        assert response.json()["error"]["code"] == "insufficient_role"

    def test_staff_can_read(self, owner: Actor, staff: Actor) -> None:
        make_property(owner.organization)
        response = staff.client.get(PROPS)
        assert response.status_code == 200
        assert len(response.json()["results"]) == 1

    @pytest.mark.parametrize(
        "field,value",
        [("pincode", "12"), ("rent_due_day", 31), ("property_type", "castle"), ("name", "")],
    )
    def test_validation(self, owner: Actor, field: str, value: object) -> None:
        response = owner.client.post(PROPS, prop_payload(**{field: value}))
        assert response.status_code == 400
        assert field in response.json()["error"]["fields"]

    def test_bed_counts_in_list(self, owner: Actor) -> None:
        prop = make_property(owner.organization)
        room = make_room(prop, sharing=3)
        Bed.objects.filter(room=room, label="A").update(status=Bed.Status.OCCUPIED)
        [row] = owner.client.get(PROPS).json()["results"]
        assert (row["beds_total"], row["beds_vacant"], row["beds_occupied"]) == (3, 2, 1)

    def test_delete_with_rooms_is_refused(self, owner: Actor) -> None:
        prop = make_property(owner.organization)
        make_room(prop)
        response = owner.client.delete(reverse("v1:property-detail", args=[prop.pk]))
        assert response.status_code == 409
        assert response.json()["error"]["code"] == "in_use"

    def test_delete_empty_property(self, owner: Actor) -> None:
        prop = make_property(owner.organization)
        assert owner.client.delete(reverse("v1:property-detail", args=[prop.pk])).status_code == 204

    def test_isolation(self, owner: Actor, outsider: Actor) -> None:
        prop = make_property(owner.organization)
        assert_isolated(
            outsider.client,
            reverse("v1:property-detail", args=[prop.pk]),
            payload={"name": "Hacked"},
        )
        assert outsider.client.get(PROPS).json()["results"] == []


class TestRooms:
    def test_create_room_makes_beds(self, owner: Actor) -> None:
        prop = make_property(owner.organization)
        response = owner.client.post(
            ROOMS, {"property": str(prop.pk), "number": "201", "sharing": 3, "bed_rent": 750000}
        )
        assert response.status_code == 201, response.json()
        beds = response.json()["beds"]
        assert [b["label"] for b in beds] == ["A", "B", "C"]
        assert {b["monthly_rent"] for b in beds} == {750000}

    def test_bed_count_overrides_sharing(self, owner: Actor) -> None:
        prop = make_property(owner.organization)
        response = owner.client.post(
            ROOMS,
            {"property": str(prop.pk), "number": "1", "sharing": 3, "bed_count": 1, "bed_rent": 1},
        )
        assert len(response.json()["beds"]) == 1

    def test_duplicate_room_number(self, owner: Actor) -> None:
        prop = make_property(owner.organization)
        make_room(prop, number="101")
        response = owner.client.post(
            ROOMS, {"property": str(prop.pk), "number": "101", "sharing": 1, "bed_rent": 1}
        )
        assert response.status_code == 400
        assert "number" in response.json()["error"]["fields"]

    def test_rent_required(self, owner: Actor) -> None:
        prop = make_property(owner.organization)
        response = owner.client.post(ROOMS, {"property": str(prop.pk), "number": "1", "sharing": 1})
        assert "bed_rent" in response.json()["error"]["fields"]

    def test_cannot_use_other_orgs_property(self, owner: Actor, outsider: Actor) -> None:
        foreign = make_property(outsider.organization)
        response = owner.client.post(
            ROOMS, {"property": str(foreign.pk), "number": "1", "sharing": 1, "bed_rent": 1}
        )
        assert response.status_code == 400
        assert "property" in response.json()["error"]["fields"]

    def test_room_cannot_move_property(self, owner: Actor) -> None:
        room = make_room(make_property(owner.organization))
        other = make_property(owner.organization, name="Second")
        response = owner.client.patch(
            reverse("v1:room-detail", args=[room.pk]), {"property": str(other.pk)}
        )
        assert response.status_code == 400

    def test_filter_by_property_and_bad_id(self, owner: Actor) -> None:
        a = make_property(owner.organization)
        b = make_property(owner.organization, name="B")
        make_room(a)
        make_room(b)
        assert len(owner.client.get(ROOMS, {"property": str(a.pk)}).json()["results"]) == 1
        response = owner.client.get(ROOMS, {"property": "nope"})
        assert response.status_code == 400

    def test_isolation(self, owner: Actor, outsider: Actor) -> None:
        room = make_room(make_property(owner.organization))
        assert_isolated(
            outsider.client, reverse("v1:room-detail", args=[room.pk]), payload={"number": "X"}
        )


class TestBeds:
    def test_block_and_reserve(self, owner: Actor) -> None:
        bed = make_room(make_property(owner.organization)).beds.first()
        url = reverse("v1:bed-detail", args=[bed.pk])
        assert owner.client.patch(url, {"status": "blocked"}).json()["status"] == "blocked"
        assert owner.client.patch(url, {"status": "reserved"}).json()["status"] == "reserved"

    def test_cannot_mark_occupied_by_hand(self, owner: Actor) -> None:
        bed = make_room(make_property(owner.organization)).beds.first()
        response = owner.client.patch(
            reverse("v1:bed-detail", args=[bed.pk]), {"status": "occupied"}
        )
        assert response.status_code == 400

    def test_cannot_free_occupied_bed_by_hand(self, owner: Actor) -> None:
        bed = make_room(make_property(owner.organization)).beds.first()
        Bed.objects.filter(pk=bed.pk).update(status=Bed.Status.OCCUPIED)
        response = owner.client.patch(reverse("v1:bed-detail", args=[bed.pk]), {"status": "vacant"})
        assert response.status_code == 400

    def test_add_bed_and_duplicate_label(self, owner: Actor) -> None:
        room = make_room(make_property(owner.organization), sharing=1)
        room.sharing = 3  # room for two more beds
        room.save()
        ok = owner.client.post(BEDS, {"room": str(room.pk), "label": "B", "monthly_rent": 5})
        assert ok.status_code == 201
        dup = owner.client.post(BEDS, {"room": str(room.pk), "label": "B", "monthly_rent": 5})
        assert dup.status_code == 400

    def test_filters(self, owner: Actor) -> None:
        room = make_room(make_property(owner.organization), sharing=2)
        Bed.objects.filter(room=room, label="A").update(status=Bed.Status.BLOCKED)
        assert len(owner.client.get(BEDS, {"status": "vacant"}).json()["results"]) == 1
        assert owner.client.get(BEDS, {"status": "weird"}).status_code == 400

    def test_staff_cannot_edit(self, owner: Actor) -> None:
        staff = make_actor(Role.STAFF, organization=owner.organization)
        bed = make_room(make_property(owner.organization)).beds.first()
        response = staff.client.patch(
            reverse("v1:bed-detail", args=[bed.pk]), {"status": "blocked"}
        )
        assert response.status_code == 403

    def test_isolation(self, owner: Actor, outsider: Actor) -> None:
        bed = make_room(make_property(owner.organization)).beds.first()
        assert_isolated(
            outsider.client, reverse("v1:bed-detail", args=[bed.pk]), payload={"status": "blocked"}
        )


def test_rooms_listed_by_number(owner: Actor) -> None:
    prop = make_property(owner.organization)
    for number in ("201", "101", "102"):
        make_room(prop, number=number)
    rows = owner.client.get(ROOMS).json()["results"]
    assert [r["number"] for r in rows] == ["101", "102", "201"]
