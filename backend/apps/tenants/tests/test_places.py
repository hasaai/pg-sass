"""A stay rents a bed, a whole room or a whole flat / portion."""

import datetime as dt

import pytest
from django.urls import reverse

from apps.organizations.models import Role
from apps.properties.models import Bed, Letting, Property, RentalUnit, Room
from apps.tenants.models import Stay
from core.tests.support import (
    Actor,
    make_actor,
    make_property,
    make_room,
    make_stay,
    make_tenant,
)

TENANTS = reverse("v1:tenant-list")
SUMMARY = reverse("v1:tenant-summary")
STAYS = reverse("v1:stay-list")
D = dt.date(2026, 10, 1)


def stay_url(stay_id: str, action: str) -> str:
    return reverse(f"v1:stay-{action}", args=[stay_id])


def whole_room(prop: Property, number: str = "201", rent: int = 1500000) -> Room:
    return Room.objects.create(
        organization=prop.organization,
        property=prop,
        number=number,
        sharing=1,
        room_type=Room.RoomType.PRIVATE,
        letting=Letting.WHOLE,
        monthly_rent=rent,
    )


def whole_flat(prop: Property, code: str = "302", rent: int = 3200000) -> RentalUnit:
    return RentalUnit.objects.create(
        organization=prop.organization,
        property=prop,
        code=code,
        unit_type=RentalUnit.UnitType.BHK2,
        letting=Letting.WHOLE,
        monthly_rent=rent,
    )


def check_in(actor: Actor, phone: str, **place: str) -> dict:
    tenant = make_tenant(actor.organization, phone=phone)
    response = actor.client.post(
        STAYS, {"tenant": str(tenant.pk), "check_in": "2026-10-01", **place}
    )
    return {**response.json(), "http": response.status_code}


@pytest.fixture
def building(owner: Actor) -> Property:
    return make_property(owner.organization, name="Lake View Apartments", property_type="apartment")


class TestWholeRoom:
    def test_check_in_to_whole_room_uses_room_rent(self, owner: Actor) -> None:
        room = whole_room(make_property(owner.organization))
        body = check_in(owner, "9000000001", room=str(room.pk))
        assert body["http"] == 201, body
        assert body["monthly_rent"] == 1500000
        assert body["bed"] is None
        assert body["place"]["kind"] == "room"
        assert body["place"]["label"] == "Room 201 · Whole room"
        assert body["place"]["kind_label"] == "Whole room"
        assert body["place"]["room_id"] == str(room.pk)

    def test_room_rented_bed_by_bed_is_refused(self, owner: Actor) -> None:
        room = make_room(make_property(owner.organization))
        body = check_in(owner, "9000000001", room=str(room.pk))
        assert body["http"] == 409
        assert body["error"]["code"] == "room_not_rentable"
        assert "bed by bed" in body["error"]["message"]

    def test_second_tenant_in_the_same_room_is_refused(self, owner: Actor) -> None:
        room = whole_room(make_property(owner.organization))
        check_in(owner, "9000000001", room=str(room.pk))
        body = check_in(owner, "9000000002", room=str(room.pk))
        assert body["error"]["code"] == "room_unavailable"

    def test_room_cannot_switch_to_bed_by_bed_while_let(self, owner: Actor) -> None:
        room = whole_room(make_property(owner.organization))
        check_in(owner, "9000000001", room=str(room.pk))
        response = owner.client.patch(
            reverse("v1:room-detail", args=[room.pk]),
            {"letting": "by_parts", "monthly_rent": None},
            format="json",
        )
        assert response.status_code == 409, response.json()
        assert "Check them out first" in response.json()["error"]["message"]

    def test_checkout_frees_the_room(self, owner: Actor) -> None:
        room = whole_room(make_property(owner.organization))
        stay = check_in(owner, "9000000001", room=str(room.pk))
        owner.client.post(stay_url(stay["id"], "checkout"), {"check_out": "2026-10-20"})
        again = check_in(owner, "9000000002", room=str(room.pk))
        assert again["http"] == 201, again


class TestWholeFlat:
    def test_check_in_to_whole_flat(self, owner: Actor, building: Property) -> None:
        flat = whole_flat(building)
        body = check_in(owner, "9000000001", unit=str(flat.pk))
        assert body["http"] == 201, body
        assert body["monthly_rent"] == 3200000
        assert body["place"]["kind"] == "unit"
        assert body["place"]["label"] == "Flat 302 · Whole flat"
        assert body["place"]["property_name"] == "Lake View Apartments"

    def test_flat_rented_room_by_room_is_refused(self, owner: Actor, building: Property) -> None:
        flat = whole_flat(building)
        flat.letting = Letting.BY_PARTS
        flat.monthly_rent = None
        flat.save()
        body = check_in(owner, "9000000001", unit=str(flat.pk))
        assert body["error"]["code"] == "unit_not_rentable"

    def test_blocked_flat_is_refused(self, owner: Actor, building: Property) -> None:
        flat = whole_flat(building)
        flat.status = RentalUnit.Status.BLOCKED
        flat.save()
        assert check_in(owner, "9000000001", unit=str(flat.pk))["error"]["code"] == (
            "unit_unavailable"
        )

    def test_flat_with_a_tenant_cannot_be_removed(self, owner: Actor, building: Property) -> None:
        flat = whole_flat(building)
        check_in(owner, "9000000001", unit=str(flat.pk))
        response = owner.client.post(reverse("v1:unit-archive", args=[flat.pk]))
        assert response.status_code == 409

    def test_portion_of_a_house_uses_portion_words(self, owner: Actor) -> None:
        house = make_property(owner.organization, name="Rose Villa", property_type="house")
        portion = RentalUnit.objects.create(
            organization=owner.organization,
            property=house,
            code="Ground floor",
            unit_type=RentalUnit.UnitType.PORTION,
            letting=Letting.WHOLE,
            monthly_rent=2000000,
        )
        body = check_in(owner, "9000000001", unit=str(portion.pk))
        assert body["place"]["label"] == "Portion Ground floor · Whole portion"


class TestPlaceChoice:
    def test_exactly_one_place(self, owner: Actor) -> None:
        prop = make_property(owner.organization)
        room = whole_room(prop)
        bed = make_room(prop, number="102").beds.first()
        none = check_in(owner, "9000000001")
        both = check_in(owner, "9000000002", room=str(room.pk), bed=str(bed.pk))
        for body in (none, both):
            assert body["http"] == 400
            assert "place" in body["error"]["fields"]

    def test_room_of_another_business_does_not_exist(self, owner: Actor) -> None:
        other = make_actor(Role.OWNER)
        room = whole_room(make_property(other.organization))
        body = check_in(owner, "9000000001", room=str(room.pk))
        assert body["http"] == 400
        assert "room" in body["error"]["fields"]

    def test_move_from_bed_to_whole_room_and_back(self, owner: Actor) -> None:
        prop = make_property(owner.organization)
        bed = make_room(prop).beds.first()
        room = whole_room(prop)
        stay = make_stay(owner, bed, make_tenant(owner.organization), D)
        moved = owner.client.post(stay_url(stay.pk, "transfer"), {"room": str(room.pk)})
        assert moved.status_code == 200, moved.json()
        assert moved.json()["place"]["kind"] == "room"
        assert moved.json()["monthly_rent"] == 1500000
        bed.refresh_from_db()
        assert bed.status == Bed.Status.VACANT
        back = owner.client.post(stay_url(stay.pk, "transfer"), {"bed": str(bed.pk)})
        assert back.status_code == 200, back.json()
        bed.refresh_from_db()
        assert bed.status == Bed.Status.OCCUPIED
        assert Stay.objects.get(pk=stay.pk).room_id is None

    def test_failed_move_keeps_the_old_place(self, owner: Actor) -> None:
        prop = make_property(owner.organization)
        bed = make_room(prop).beds.first()
        shared = make_room(prop, number="103")
        stay = make_stay(owner, bed, make_tenant(owner.organization), D)
        refused = owner.client.post(stay_url(stay.pk, "transfer"), {"room": str(shared.pk)})
        assert refused.status_code == 409
        bed.refresh_from_db()
        assert bed.status == Bed.Status.OCCUPIED

    def test_staff_cannot_check_in(self, owner: Actor) -> None:
        staff = make_actor(Role.STAFF, organization=owner.organization)
        room = whole_room(make_property(owner.organization))
        assert check_in(staff, "9000000001", room=str(room.pk))["http"] == 403


class TestTenantList:
    @pytest.fixture
    def people(self, owner: Actor) -> dict[str, object]:
        lotus = make_property(owner.organization, name="Lotus")
        maple = make_property(owner.organization, name="Maple")
        staying = make_tenant(owner.organization, phone="9000000001", full_name="Asha")
        leaving = make_tenant(owner.organization, phone="9000000002", full_name="Bala")
        gone = make_tenant(owner.organization, phone="9000000003", full_name="Chitra")
        make_tenant(owner.organization, phone="9000000004", full_name="Deepa")
        make_stay(owner, make_room(lotus).beds.first(), staying, D)
        notice = make_stay(owner, make_room(maple).beds.first(), leaving, D)
        owner.client.post(
            stay_url(notice.pk, "notice"),
            {"notice_date": "2026-10-05", "expected_checkout": "2026-11-05"},
        )
        old = make_stay(owner, make_room(lotus, number="104").beds.first(), gone, D)
        owner.client.post(stay_url(old.pk, "checkout"), {"check_out": "2026-10-10"})
        return {"lotus": lotus, "maple": maple}

    def names(self, owner: Actor, **params: str) -> list[str]:
        response = owner.client.get(TENANTS, params)
        assert response.status_code == 200, response.json()
        return [t["full_name"] for t in response.json()["results"]]

    def test_status_filters(self, owner: Actor, people: dict) -> None:
        assert self.names(owner, status="active") == ["Asha"]
        assert self.names(owner, status="notice") == ["Bala"]
        assert self.names(owner, status="past") == ["Chitra"]
        assert self.names(owner, status="never") == ["Deepa"]

    def test_property_filter_and_sorting(self, owner: Actor, people: dict) -> None:
        lotus = people["lotus"]
        assert self.names(owner, property=str(lotus.pk)) == ["Asha"]
        assert self.names(owner, ordering="-name") == ["Deepa", "Chitra", "Bala", "Asha"]

    def test_pages_have_a_count(self, owner: Actor, people: dict) -> None:
        body = owner.client.get(TENANTS, {"page_size": 2}).json()
        assert body["count"] == 4
        assert len(body["results"]) == 2

    def test_summary_counts(self, owner: Actor, people: dict) -> None:
        body = owner.client.get(SUMMARY).json()
        assert body == {"all": 4, "active": 1, "notice": 1, "past": 1, "never": 1}
        maple = people["maple"]
        filtered = owner.client.get(SUMMARY, {"property": str(maple.pk)}).json()
        assert filtered["all"] == 1 and filtered["notice"] == 1

    def test_current_stay_shows_the_place(self, owner: Actor, people: dict) -> None:
        body = owner.client.get(TENANTS, {"status": "active"}).json()["results"][0]
        assert body["current_stay"]["place"]["label"] == "Room 101 · Bed A"
        assert body["current_stay"]["status_label"] == "Active"

    def test_summary_is_scoped_to_the_business(self, owner: Actor, people: dict) -> None:
        other = make_actor(Role.OWNER)
        assert other.client.get(SUMMARY).json()["all"] == 0

    def test_staff_can_read_summary(self, owner: Actor, people: dict) -> None:
        staff = make_actor(Role.STAFF, organization=owner.organization)
        assert staff.client.get(SUMMARY).status_code == 200

    def test_new_profile_fields(self, owner: Actor) -> None:
        response = owner.client.post(
            TENANTS,
            {
                "full_name": "Meera",
                "phone": "9845012345",
                "date_of_birth": "2001-04-12",
                "home_address": "12, Temple Road, Mysuru",
                "consent": True,
            },
        )
        assert response.status_code == 201, response.json()
        assert response.json()["date_of_birth"] == "2001-04-12"


class TestRentForWholePlaces:
    def test_invoice_for_whole_flat_names_the_flat(self, owner: Actor, building: Property) -> None:
        flat = whole_flat(building)
        check_in(owner, "9000000001", unit=str(flat.pk))
        created = owner.client.post(reverse("v1:invoice-generate"), {"period": "2026-10"})
        assert created.status_code in (200, 201), created.json()
        invoice = owner.client.get(reverse("v1:invoice-list")).json()["results"][0]
        assert invoice["total"] == 3200000
        assert invoice["details"]["place_label"] == "Flat 302 · Whole flat"
        assert invoice["details"]["room_number"] == "Flat 302"
        assert invoice["details"]["bed_label"] == "Whole flat"


class TestFreePlaces:
    URL = reverse("v1:stay-free-places")

    def test_lists_only_places_a_tenant_can_take(self, owner: Actor, building: Property) -> None:
        flat = whole_flat(building)
        taken_flat = whole_flat(building, code="303")
        check_in(owner, "9000000001", unit=str(taken_flat.pk))
        co_living = RentalUnit.objects.create(
            organization=owner.organization,
            property=building,
            code="401",
            letting=Letting.BY_PARTS,
        )
        room = whole_room(building, number="1")
        room.unit = co_living
        room.save()
        shared = make_room(building, number="2")
        shared.unit = co_living
        shared.save()
        first_bed = shared.beds.first()
        check_in(owner, "9000000002", bed=str(first_bed.pk))
        rows = owner.client.get(self.URL, {"property": str(building.pk)}).json()
        labels = [(r["kind"], r["label"]) for r in rows]
        assert labels == [
            ("unit", "Flat 302"),
            ("room", "Flat 401 · Room 1"),
            ("bed", "Flat 401 · Room 2 · Bed B"),
        ]
        assert rows[0]["id"] == str(flat.pk)
        assert rows[0]["monthly_rent"] == 3200000
        assert rows[2]["detail"] == "2 sharing"

    def test_needs_owner_or_manager(self, owner: Actor, building: Property) -> None:
        staff = make_actor(Role.STAFF, organization=owner.organization)
        response = staff.client.get(self.URL, {"property": str(building.pk)})
        assert response.status_code == 403

    def test_other_business_property_is_not_found(self, building: Property) -> None:
        other = make_actor(Role.OWNER)
        response = other.client.get(self.URL, {"property": str(building.pk)})
        assert response.status_code == 404
