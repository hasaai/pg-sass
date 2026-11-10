import datetime as dt
from typing import Any
from unittest import mock

import pytest
from django.urls import reverse

from apps.billing import services
from apps.billing.models import Invoice
from apps.organizations.models import Role
from apps.tenants import services as stay_services
from core.money import prorate
from core.tests.support import (
    Actor,
    assert_isolated,
    make_actor,
    make_property,
    make_room,
    make_stay,
    make_tenant,
)

INVOICES = reverse("v1:invoice-list")
GENERATE = reverse("v1:invoice-generate")
PAYMENTS = reverse("v1:payment-list")
TODAY = dt.date(2026, 10, 3)


@pytest.fixture(autouse=True)
def _fixed_today():
    with mock.patch("django.utils.timezone.localdate", return_value=TODAY):
        yield


def setup_stay(actor: Actor, check_in: dt.date, rent: int = 900000, phone: str = "9876543210"):
    prop = make_property(actor.organization, rent_due_day=5)
    bed = make_room(prop, number=phone[-3:], rent=rent).beds.first()
    return make_stay(actor, bed, make_tenant(actor.organization, phone=phone), check_in)


def generate(actor: Actor, period: str = "2026-10") -> dict:
    response = actor.client.post(GENERATE, {"period": period})
    assert response.status_code == 201, response.json()
    return response.json()


def invoice_url(invoice_id: str, action: str | None = None) -> str:
    if action:
        return reverse(f"v1:invoice-{action}", args=[invoice_id])
    return reverse("v1:invoice-detail", args=[invoice_id])


class TestProrate:
    @pytest.mark.parametrize(
        "amount,used,days,expected",
        [
            (900000, 31, 31, 900000),
            (900000, 16, 31, 464516),
            (100, 1, 3, 33),
            (100, 2, 3, 67),
            (900000, 0, 30, 0),
            (900000, 40, 30, 900000),
        ],
    )
    def test_rounding(self, amount: int, used: int, days: int, expected: int) -> None:
        assert prorate(amount, used, days) == expected

    def test_zero_days_rejected(self) -> None:
        with pytest.raises(ValueError):
            prorate(1, 1, 0)


class TestGenerate:
    def test_full_month_and_due_date(self, owner: Actor) -> None:
        setup_stay(owner, dt.date(2026, 9, 1))
        result = generate(owner)
        assert result["created"] == 1
        invoice = owner.client.get(invoice_url(result["invoice_ids"][0])).json()
        assert invoice["total"] == 900000
        assert invoice["due_date"] == "2026-10-05"
        assert invoice["status"] == "issued"
        assert invoice["number"].startswith("INV-202610-")
        assert invoice["details"]["tenant_name"] == "Ravi Kumar"
        assert invoice["lines"][0]["kind"] == "rent"

    def test_mid_month_check_in_is_prorated(self, owner: Actor) -> None:
        setup_stay(owner, dt.date(2026, 10, 16))  # 16 of 31 days
        generate(owner)
        invoice = Invoice.objects.get()
        assert invoice.total == 464516
        assert "pro-rated" in invoice.lines.get().description

    def test_checkout_month_is_prorated(self, owner: Actor) -> None:
        stay = setup_stay(owner, dt.date(2026, 9, 1))
        stay_services.checkout(
            actor=owner.user, stay=stay, check_out_date=dt.date(2026, 10, 10), deductions=[]
        )
        generate(owner)
        assert Invoice.objects.get().total == prorate(900000, 10, 31)

    def test_running_twice_creates_nothing_new(self, owner: Actor) -> None:
        setup_stay(owner, dt.date(2026, 9, 1))
        generate(owner)
        assert generate(owner)["created"] == 0
        assert Invoice.objects.count() == 1

    def test_void_invoice_can_be_regenerated(self, owner: Actor) -> None:
        setup_stay(owner, dt.date(2026, 9, 1))
        first = generate(owner)["invoice_ids"][0]
        owner.client.post(invoice_url(first, "void"), {"reason": "wrong rent"})
        assert generate(owner)["created"] == 1

    def test_stays_outside_period_ignored(self, owner: Actor) -> None:
        setup_stay(owner, dt.date(2026, 11, 2))
        assert generate(owner)["created"] == 0

    def test_bad_period(self, owner: Actor) -> None:
        response = owner.client.post(GENERATE, {"period": "2026-13"})
        assert response.status_code == 400

    def test_only_own_organization(self, owner: Actor, outsider: Actor) -> None:
        setup_stay(outsider, dt.date(2026, 9, 1))
        assert generate(owner)["created"] == 0

    def test_staff_cannot_see_money(self, owner: Actor, staff: Actor) -> None:
        assert staff.client.get(INVOICES).status_code == 403
        assert staff.client.post(GENERATE, {"period": "2026-10"}).status_code == 403
        assert staff.client.get(PAYMENTS).status_code == 403


class TestChargesAndVoid:
    def test_add_charge_updates_total(self, owner: Actor) -> None:
        setup_stay(owner, dt.date(2026, 9, 1))
        inv = generate(owner)["invoice_ids"][0]
        response = owner.client.post(
            invoice_url(inv, "charges"),
            {"kind": "electricity", "description": "Oct meter", "amount": 45000},
        )
        assert response.json()["total"] == 945000
        assert len(response.json()["lines"]) == 2

    def test_rent_kind_not_allowed_as_charge(self, owner: Actor) -> None:
        setup_stay(owner, dt.date(2026, 9, 1))
        inv = generate(owner)["invoice_ids"][0]
        response = owner.client.post(
            invoice_url(inv, "charges"), {"kind": "rent", "description": "x", "amount": 1}
        )
        assert response.status_code == 400

    def test_cannot_void_paid_invoice(self, owner: Actor) -> None:
        setup_stay(owner, dt.date(2026, 9, 1))
        inv = generate(owner)["invoice_ids"][0]
        owner.client.post(
            PAYMENTS, {"invoice": inv, "amount": 100, "mode": "cash", "received_on": "2026-10-02"}
        )
        response = owner.client.post(invoice_url(inv, "void"), {"reason": "x"})
        assert response.json()["error"]["code"] == "invoice_has_payments"

    def test_no_charges_on_void(self, owner: Actor) -> None:
        setup_stay(owner, dt.date(2026, 9, 1))
        inv = generate(owner)["invoice_ids"][0]
        owner.client.post(invoice_url(inv, "void"), {"reason": "dup"})
        response = owner.client.post(
            invoice_url(inv, "charges"), {"kind": "other", "description": "x", "amount": 1}
        )
        assert response.json()["error"]["code"] == "invoice_void"


class TestPayments:
    @pytest.fixture
    def invoice_id(self, owner: Actor) -> str:
        setup_stay(owner, dt.date(2026, 9, 1))
        return generate(owner)["invoice_ids"][0]

    def pay(self, actor: Actor, invoice_id: str, amount: int, key: str | None = None, **extra):
        headers: dict[str, Any] = {"HTTP_IDEMPOTENCY_KEY": key} if key else {}
        return actor.client.post(
            PAYMENTS,
            {
                "invoice": invoice_id,
                "amount": amount,
                "mode": "upi",
                "reference": "UTR123",
                "received_on": "2026-10-02",
                **extra,
            },
            **headers,
        )

    def test_partial_then_full(self, owner: Actor, invoice_id: str) -> None:
        first = self.pay(owner, invoice_id, 400000)
        assert first.status_code == 201
        assert first.json()["receipt_number"] == "RCPT-00001"
        assert first.json()["invoice_balance"] == 500000
        inv = owner.client.get(invoice_url(invoice_id)).json()
        assert (inv["status"], inv["balance"]) == ("partially_paid", 500000)
        self.pay(owner, invoice_id, 500000)
        assert owner.client.get(invoice_url(invoice_id)).json()["status"] == "paid"

    def test_overpayment_refused(self, owner: Actor, invoice_id: str) -> None:
        response = self.pay(owner, invoice_id, 900001)
        assert response.status_code == 409
        assert response.json()["error"]["code"] == "overpayment"

    def test_idempotent_retry_records_once(self, owner: Actor, invoice_id: str) -> None:
        a = self.pay(owner, invoice_id, 100000, key="abc-1")
        b = self.pay(owner, invoice_id, 100000, key="abc-1")
        assert (a.status_code, b.status_code) == (201, 200)
        assert a.json()["id"] == b.json()["id"]
        assert owner.client.get(invoice_url(invoice_id)).json()["paid"] == 100000

    def test_reused_key_for_different_payment(self, owner: Actor, invoice_id: str) -> None:
        self.pay(owner, invoice_id, 100000, key="abc-2")
        response = self.pay(owner, invoice_id, 200000, key="abc-2")
        assert response.json()["error"]["code"] == "idempotency_key_reused"

    def test_future_date_and_zero_amount(self, owner: Actor, invoice_id: str) -> None:
        assert self.pay(owner, invoice_id, 0).status_code == 400
        future = self.pay(owner, invoice_id, 10, received_on="2026-12-01")
        assert "received_on" in future.json()["error"]["fields"]

    def test_pay_void_invoice(self, owner: Actor, invoice_id: str) -> None:
        owner.client.post(invoice_url(invoice_id, "void"), {"reason": "x"})
        assert self.pay(owner, invoice_id, 10).json()["error"]["code"] == "invoice_void"

    def test_other_org_invoice_rejected(
        self, owner: Actor, outsider: Actor, invoice_id: str
    ) -> None:
        response = self.pay(outsider, invoice_id, 10)
        assert response.status_code == 400
        assert "invoice" in response.json()["error"]["fields"]

    def test_filters(self, owner: Actor, invoice_id: str) -> None:
        self.pay(owner, invoice_id, 10)
        assert len(owner.client.get(INVOICES, {"outstanding": "true"}).json()["results"]) == 1
        assert owner.client.get(INVOICES, {"overdue": "true"}).json()["results"] == []
        assert len(owner.client.get(INVOICES, {"period": "2026-10"}).json()["results"]) == 1
        assert owner.client.get(INVOICES, {"period": "Oct"}).status_code == 400
        assert len(owner.client.get(PAYMENTS, {"invoice": invoice_id}).json()["results"]) == 1

    def test_manager_can_record(self, owner: Actor, invoice_id: str) -> None:
        manager = make_actor(Role.MANAGER, organization=owner.organization)
        assert self.pay(manager, invoice_id, 10).status_code == 201

    def test_isolation(self, owner: Actor, outsider: Actor, invoice_id: str) -> None:
        payment_id = self.pay(owner, invoice_id, 10).json()["id"]
        assert_isolated(outsider.client, invoice_url(invoice_id), methods=["get"])
        assert_isolated(
            outsider.client, reverse("v1:payment-detail", args=[payment_id]), methods=["get"]
        )
        for action in ("charges", "void"):
            assert outsider.client.post(invoice_url(invoice_id, action), {}).status_code == 404


class TestNumbering:
    def test_numbers_are_per_organization(self, owner: Actor, outsider: Actor) -> None:
        setup_stay(owner, dt.date(2026, 9, 1))
        setup_stay(outsider, dt.date(2026, 9, 1))
        services.generate_invoices(
            organization=owner.organization, actor=owner.user, period=dt.date(2026, 10, 1)
        )
        services.generate_invoices(
            organization=outsider.organization, actor=outsider.user, period=dt.date(2026, 10, 1)
        )
        assert set(Invoice.objects.values_list("number", flat=True)) == {"INV-202610-00001"}
