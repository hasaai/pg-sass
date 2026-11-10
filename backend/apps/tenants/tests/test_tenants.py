import datetime as dt

import pytest
from django.urls import reverse

from apps.organizations.models import Role
from apps.properties.models import Bed
from apps.tenants.models import Stay
from core.models import AuditLog
from core.tests.support import (
    Actor,
    assert_isolated,
    make_actor,
    make_property,
    make_room,
    make_stay,
    make_tenant,
)

TENANTS = reverse("v1:tenant-list")
STAYS = reverse("v1:stay-list")
D = dt.date(2026, 10, 1)


def stay_url(stay: Stay, action: str) -> str:
    return reverse(f"v1:stay-{action}", args=[stay.pk])


def tenant_payload(**over: object) -> dict[str, object]:
    return {
        "full_name": "Meera N",
        "phone": "+91 98450 12345",
        "id_type": "aadhaar",
        "id_last4": "1234",
        "consent": True,
        **over,
    }


class TestTenantProfile:
    def test_create_normalises_phone_and_records_consent(self, owner: Actor) -> None:
        response = owner.client.post(TENANTS, tenant_payload())
        assert response.status_code == 201, response.json()
        body = response.json()
        assert body["phone"] == "9845012345"
        assert body["consent_given_at"]
        assert body["current_stay"] is None

    def test_consent_required(self, owner: Actor) -> None:
        response = owner.client.post(TENANTS, tenant_payload(consent=False))
        assert "consent" in response.json()["error"]["fields"]

    @pytest.mark.parametrize("field,value", [("phone", "12345"), ("id_last4", "123456789012")])
    def test_validation(self, owner: Actor, field: str, value: str) -> None:
        response = owner.client.post(TENANTS, tenant_payload(**{field: value}))
        assert response.status_code == 400
        assert field in response.json()["error"]["fields"]

    def test_duplicate_phone_in_same_org_only(self, owner: Actor, outsider: Actor) -> None:
        make_tenant(owner.organization, phone="9845012345")
        assert owner.client.post(TENANTS, tenant_payload()).status_code == 400
        assert outsider.client.post(TENANTS, tenant_payload()).status_code == 201

    def test_staff_can_read_not_create(self, owner: Actor, staff: Actor) -> None:
        make_tenant(owner.organization)
        assert staff.client.get(TENANTS).status_code == 200
        assert staff.client.post(TENANTS, tenant_payload()).status_code == 403

    def test_search_and_residency_filter(self, owner: Actor) -> None:
        bed = make_room(make_property(owner.organization)).beds.first()
        living = make_tenant(owner.organization, full_name="Asha", phone="9000000001")
        make_tenant(owner.organization, full_name="Bina", phone="9000000002")
        make_stay(owner, bed, living, D)
        assert [
            t["full_name"] for t in owner.client.get(TENANTS, {"q": "ash"}).json()["results"]
        ] == ["Asha"]
        current = owner.client.get(TENANTS, {"residency": "current"}).json()["results"]
        assert [t["full_name"] for t in current] == ["Asha"]
        assert current[0]["current_stay"]["bed"]["label"] == "A"
        past = owner.client.get(TENANTS, {"residency": "past"}).json()["results"]
        assert [t["full_name"] for t in past] == ["Bina"]

    def test_isolation(self, owner: Actor, outsider: Actor) -> None:
        tenant = make_tenant(owner.organization)
        assert_isolated(
            outsider.client,
            reverse("v1:tenant-detail", args=[tenant.pk]),
            payload={"full_name": "x"},
        )


class TestCheckIn:
    def test_check_in_occupies_bed_and_collects_deposit(self, owner: Actor) -> None:
        bed = make_room(make_property(owner.organization), rent=800000).beds.first()
        tenant = make_tenant(owner.organization)
        response = owner.client.post(
            STAYS,
            {
                "tenant": str(tenant.pk),
                "bed": str(bed.pk),
                "check_in": "2026-10-01",
                "deposit_amount": 1600000,
                "deposit_collected": 1000000,
            },
        )
        assert response.status_code == 201, response.json()
        body = response.json()
        assert body["monthly_rent"] == 800000
        assert body["deposit_held"] == 1000000
        bed.refresh_from_db()
        assert bed.status == Bed.Status.OCCUPIED
        assert AuditLog.objects.filter(action="stay.check_in").exists()

    def test_bed_must_be_free(self, owner: Actor) -> None:
        bed = make_room(make_property(owner.organization)).beds.first()
        make_stay(owner, bed, make_tenant(owner.organization), D)
        other = make_tenant(owner.organization, phone="9000000009")
        response = owner.client.post(
            STAYS, {"tenant": str(other.pk), "bed": str(bed.pk), "check_in": "2026-10-02"}
        )
        assert response.status_code == 409
        assert response.json()["error"]["code"] == "bed_unavailable"

    def test_blocked_bed_refused(self, owner: Actor) -> None:
        bed = make_room(make_property(owner.organization)).beds.first()
        Bed.objects.filter(pk=bed.pk).update(status=Bed.Status.BLOCKED)
        tenant = make_tenant(owner.organization)
        response = owner.client.post(
            STAYS, {"tenant": str(tenant.pk), "bed": str(bed.pk), "check_in": "2026-10-02"}
        )
        assert response.status_code == 409

    def test_tenant_cannot_hold_two_beds(self, owner: Actor) -> None:
        room = make_room(make_property(owner.organization))
        a, b = room.beds.all()
        tenant = make_tenant(owner.organization)
        make_stay(owner, a, tenant, D)
        response = owner.client.post(
            STAYS, {"tenant": str(tenant.pk), "bed": str(b.pk), "check_in": "2026-10-02"}
        )
        assert response.json()["error"]["code"] == "tenant_has_stay"

    def test_deposit_collected_cannot_exceed_agreed(self, owner: Actor) -> None:
        bed = make_room(make_property(owner.organization)).beds.first()
        tenant = make_tenant(owner.organization)
        response = owner.client.post(
            STAYS,
            {
                "tenant": str(tenant.pk),
                "bed": str(bed.pk),
                "check_in": "2026-10-01",
                "deposit_amount": 10,
                "deposit_collected": 20,
            },
        )
        assert response.status_code == 409

    def test_cannot_use_other_orgs_bed_or_tenant(self, owner: Actor, outsider: Actor) -> None:
        foreign_bed = make_room(make_property(outsider.organization)).beds.first()
        tenant = make_tenant(owner.organization)
        response = owner.client.post(
            STAYS, {"tenant": str(tenant.pk), "bed": str(foreign_bed.pk), "check_in": "2026-10-01"}
        )
        assert response.status_code == 400
        assert "bed" in response.json()["error"]["fields"]

    def test_staff_cannot_check_in(self, owner: Actor) -> None:
        staff = make_actor(Role.STAFF, organization=owner.organization)
        bed = make_room(make_property(owner.organization)).beds.first()
        tenant = make_tenant(owner.organization)
        response = staff.client.post(
            STAYS, {"tenant": str(tenant.pk), "bed": str(bed.pk), "check_in": "2026-10-01"}
        )
        assert response.status_code == 403


class TestStayLifecycle:
    @pytest.fixture
    def stay(self, owner: Actor) -> Stay:
        bed = make_room(make_property(owner.organization), rent=600000).beds.first()
        return make_stay(
            owner,
            bed,
            make_tenant(owner.organization),
            D,
            deposit_amount=1200000,
            deposit_collected=1200000,
        )

    def test_notice_and_withdraw(self, owner: Actor, stay: Stay) -> None:
        response = owner.client.post(
            stay_url(stay, "notice"),
            {"notice_date": "2026-10-10", "expected_checkout": "2026-11-09"},
        )
        assert response.json()["status"] == "notice"
        assert owner.client.post(stay_url(stay, "withdraw-notice")).json()["status"] == "active"

    def test_notice_dates_validated(self, owner: Actor, stay: Stay) -> None:
        response = owner.client.post(
            stay_url(stay, "notice"),
            {"notice_date": "2026-10-10", "expected_checkout": "2026-10-01"},
        )
        assert response.json()["error"]["code"] == "invalid_dates"

    def test_transfer_moves_bed(self, owner: Actor, stay: Stay) -> None:
        old_bed = stay.bed
        assert old_bed is not None
        new_bed = make_room(old_bed.room.property, number="102", rent=700000).beds.first()
        response = owner.client.post(stay_url(stay, "transfer"), {"bed": str(new_bed.pk)})
        assert response.status_code == 200, response.json()
        assert response.json()["monthly_rent"] == 700000
        old_bed.refresh_from_db()
        new_bed.refresh_from_db()
        assert (old_bed.status, new_bed.status) == ("vacant", "occupied")

    def test_transfer_to_same_or_occupied_bed(self, owner: Actor, stay: Stay) -> None:
        same = owner.client.post(stay_url(stay, "transfer"), {"bed": str(stay.bed_id)})
        assert same.json()["error"]["code"] == "same_place"
        assert stay.bed is not None
        neighbour = stay.bed.room.beds.exclude(pk=stay.bed.pk)[0]
        make_stay(owner, neighbour, make_tenant(owner.organization, phone="9111111111"), D)
        taken = owner.client.post(stay_url(stay, "transfer"), {"bed": str(neighbour.pk)})
        assert taken.json()["error"]["code"] == "bed_unavailable"

    def test_checkout_with_deductions_refunds_rest(self, owner: Actor, stay: Stay) -> None:
        response = owner.client.post(
            stay_url(stay, "checkout"),
            {
                "check_out": "2026-10-20",
                "deductions": [{"reason": "Broken chair", "amount": 200000}],
            },
        )
        assert response.status_code == 200, response.json()
        body = response.json()
        assert body["status"] == "closed"
        assert body["deposit_held"] == 0
        kinds = [(t["kind"], t["amount"]) for t in body["deposit_transactions"]]
        assert kinds == [("collected", 1200000), ("deducted", 200000), ("refunded", 1000000)]
        assert stay.bed is not None
        stay.bed.refresh_from_db()
        assert stay.bed.status == "vacant"

    def test_deductions_cannot_exceed_deposit(self, owner: Actor, stay: Stay) -> None:
        response = owner.client.post(
            stay_url(stay, "checkout"),
            {
                "check_out": "2026-10-20",
                "deductions": [{"reason": "x", "amount": 9_999_999}],
            },
        )
        assert response.json()["error"]["code"] == "deductions_exceed_deposit"

    def test_checkout_before_checkin_and_twice(self, owner: Actor, stay: Stay) -> None:
        early = owner.client.post(stay_url(stay, "checkout"), {"check_out": "2026-09-01"})
        assert early.json()["error"]["code"] == "invalid_dates"
        assert (
            owner.client.post(stay_url(stay, "checkout"), {"check_out": "2026-10-05"}).status_code
            == 200
        )
        again = owner.client.post(stay_url(stay, "checkout"), {"check_out": "2026-10-06"})
        assert again.json()["error"]["code"] == "stay_closed"

    def test_collect_more_deposit_limited(self, owner: Actor) -> None:
        bed = make_room(make_property(owner.organization)).beds.first()
        stay = make_stay(
            owner,
            bed,
            make_tenant(owner.organization),
            D,
            deposit_amount=1000,
            deposit_collected=400,
        )
        ok = owner.client.post(stay_url(stay, "deposit"), {"amount": 600, "date": "2026-10-02"})
        assert ok.json()["deposit_held"] == 1000
        too_much = owner.client.post(stay_url(stay, "deposit"), {"amount": 1, "date": "2026-10-02"})
        assert too_much.json()["error"]["code"] == "deposit_too_high"

    def test_staff_cannot_checkout(self, owner: Actor, stay: Stay) -> None:
        staff = make_actor(Role.STAFF, organization=owner.organization)
        assert (
            staff.client.post(stay_url(stay, "checkout"), {"check_out": "2026-10-05"}).status_code
            == 403
        )
        assert staff.client.get(STAYS).status_code == 200

    def test_isolation(self, owner: Actor, outsider: Actor, stay: Stay) -> None:
        assert_isolated(outsider.client, reverse("v1:stay-detail", args=[stay.pk]), methods=["get"])
        for action in ("notice", "transfer", "checkout", "deposit"):
            response = outsider.client.post(stay_url(stay, action), {})
            assert response.status_code == 404, action
