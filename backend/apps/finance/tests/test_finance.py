import datetime as dt
from unittest import mock

import pytest
from django.urls import reverse

from apps.billing import services as billing
from apps.finance.models import Employee, Expense
from apps.organizations.models import Role
from core.tests.support import (
    Actor,
    assert_isolated,
    make_actor,
    make_property,
    make_room,
    make_stay,
    make_tenant,
)

TODAY = dt.date(2026, 10, 18)
EXPENSES = reverse("v1:expense-list")
EMPLOYEES = reverse("v1:employee-list")
SUMMARY = reverse("v1:report-finance")
CSV = reverse("v1:report-monthly")


@pytest.fixture(autouse=True)
def _today():
    with mock.patch("django.utils.timezone.localdate", return_value=TODAY):
        yield


def expense(actor: Actor, **over: object) -> dict:
    payload = {
        "category": "groceries",
        "vendor": "Nandini Dairy",
        "amount": 450000,
        "paid_on": "2026-10-10",
        "mode": "upi",
        **over,
    }
    response = actor.client.post(EXPENSES, payload)
    assert response.status_code == 201, response.json()
    return response.json()


def employee(actor: Actor, **over: object) -> dict:
    payload = {
        "full_name": "Manjunath",
        "role_title": "Cook",
        "monthly_salary": 1800000,
        "pay_day": 1,
        "phone": "9845055555",
        **over,
    }
    response = actor.client.post(EMPLOYEES, payload)
    assert response.status_code == 201, response.json()
    return response.json()


class TestExpenses:
    def test_create_and_filter(self, owner: Actor) -> None:
        prop = make_property(owner.organization)
        expense(owner, property=str(prop.pk), category="electricity", amount=1250000)
        expense(owner, paid_on="2026-09-28")
        rows = owner.client.get(EXPENSES, {"period": "2026-10"}).json()["results"]
        assert [r["category_label"] for r in rows] == ["Electricity"]
        assert rows[0]["property_name"] == prop.name
        assert len(owner.client.get(EXPENSES, {"category": "groceries"}).json()["results"]) == 1

    @pytest.mark.parametrize(
        "field,value",
        [("paid_on", "2026-12-01"), ("amount", 0), ("category", "salary"), ("category", "bribes")],
    )
    def test_validation(self, owner: Actor, field: str, value: object) -> None:
        response = owner.client.post(
            EXPENSES,
            {"category": "groceries", "amount": 100, "paid_on": "2026-10-01", field: value},
        )
        assert response.status_code == 400
        assert field in response.json()["error"]["fields"]

    def test_foreign_property_rejected(self, owner: Actor, outsider: Actor) -> None:
        prop = make_property(outsider.organization)
        response = owner.client.post(
            EXPENSES,
            {"category": "water", "amount": 100, "paid_on": "2026-10-01", "property": str(prop.pk)},
        )
        assert "property" in response.json()["error"]["fields"]

    def test_roles_and_isolation(self, owner: Actor, outsider: Actor) -> None:
        row = expense(owner)
        staff = make_actor(Role.STAFF, organization=owner.organization)
        assert staff.client.get(EXPENSES).status_code == 403
        assert_isolated(
            outsider.client, reverse("v1:expense-detail", args=[row["id"]]), payload={"amount": 1}
        )


class TestSalaries:
    def test_pay_salary_once_per_month(self, owner: Actor) -> None:
        emp = employee(owner)
        url = reverse("v1:employee-pay", args=[emp["id"]])
        paid = owner.client.post(url, {"month": "2026-10", "paid_on": "2026-10-01", "mode": "cash"})
        assert paid.status_code == 201, paid.json()
        body = paid.json()
        assert (body["category"], body["amount"], body["employee_name"]) == (
            "salary",
            1800000,
            "Manjunath",
        )
        assert body["salary_month"] == "2026-10-01"
        again = owner.client.post(url, {"month": "2026-10", "paid_on": "2026-10-02"})
        assert again.status_code == 409
        assert again.json()["error"]["code"] == "salary_already_paid"
        partial = owner.client.post(
            url, {"month": "2026-09", "paid_on": "2026-10-02", "amount": 900000}
        )
        assert partial.json()["amount"] == 900000

    def test_bad_month_and_future_date(self, owner: Actor) -> None:
        url = reverse("v1:employee-pay", args=[employee(owner)["id"]])
        assert (
            "month"
            in owner.client.post(url, {"month": "Oct", "paid_on": "2026-10-01"}).json()["error"][
                "fields"
            ]
        )
        assert (
            "paid_on"
            in owner.client.post(url, {"month": "2026-10", "paid_on": "2026-11-30"}).json()[
                "error"
            ]["fields"]
        )

    def test_employee_with_paid_salary_cannot_be_deleted(self, owner: Actor) -> None:
        emp = employee(owner)
        owner.client.post(
            reverse("v1:employee-pay", args=[emp["id"]]),
            {"month": "2026-10", "paid_on": "2026-10-01"},
        )
        response = owner.client.delete(reverse("v1:employee-detail", args=[emp["id"]]))
        assert response.status_code == 409
        assert (
            owner.client.patch(
                reverse("v1:employee-detail", args=[emp["id"]]), {"is_active": False}
            ).json()["is_active"]
            is False
        )

    def test_isolation(self, owner: Actor, outsider: Actor) -> None:
        emp = employee(owner)
        assert_isolated(
            outsider.client,
            reverse("v1:employee-detail", args=[emp["id"]]),
            payload={"monthly_salary": 1},
        )
        assert (
            outsider.client.post(
                reverse("v1:employee-pay", args=[emp["id"]]),
                {"month": "2026-10", "paid_on": "2026-10-01"},
            ).status_code
            == 404
        )


@pytest.fixture
def books(owner: Actor) -> Actor:
    """October: ₹9,000 rent received, ₹4,500 groceries, ₹18,000 salary paid; one cook unpaid."""
    prop = make_property(owner.organization, name="Lotus")
    bed = make_room(prop, rent=900000).beds.first()
    make_stay(
        owner, bed, make_tenant(owner.organization, full_name="=cmd|evil"), dt.date(2026, 9, 1)
    )
    [inv] = billing.generate_invoices(
        organization=owner.organization, actor=owner.user, period=dt.date(2026, 10, 1)
    )
    billing.record_payment(
        actor=owner.user,
        invoice=inv,
        amount=900000,
        mode="upi",
        received_on=dt.date(2026, 10, 3),
        reference="UTR1",
    )
    expense(owner, property=str(prop.pk))
    paid = employee(owner, property=str(prop.pk))
    owner.client.post(
        reverse("v1:employee-pay", args=[paid["id"]]), {"month": "2026-10", "paid_on": "2026-10-01"}
    )
    employee(owner, full_name="Shanthamma", role_title="Housekeeping", monthly_salary=1200000)
    return owner


def test_finance_summary(books: Actor) -> None:
    body = books.client.get(SUMMARY, {"period": "2026-10"}).json()
    assert body["income"] == 900000
    assert body["income_by_mode"] == {"upi": 900000}
    assert body["expenses"] == 450000 + 1800000
    assert body["net"] == 900000 - 2250000
    assert [c["category"] for c in body["expenses_by_category"]] == ["salary", "groceries"]
    assert [s["full_name"] for s in body["salaries_due"]] == ["Shanthamma"]


def test_finance_summary_other_month_and_roles(books: Actor) -> None:
    assert books.client.get(SUMMARY, {"period": "2026-09"}).json()["net"] == 0
    manager = make_actor(Role.MANAGER, organization=books.organization)
    staff = make_actor(Role.STAFF, organization=books.organization)
    assert manager.client.get(SUMMARY).status_code == 200
    assert staff.client.get(SUMMARY).status_code == 403
    assert staff.client.get(CSV).status_code == 403


def test_summary_is_per_organization(books: Actor, outsider: Actor) -> None:
    body = outsider.client.get(SUMMARY, {"period": "2026-10"}).json()
    assert (body["income"], body["expenses"], body["salaries_due"]) == (0, 0, [])


def test_monthly_csv(books: Actor) -> None:
    response = books.client.get(CSV, {"period": "2026-10"})
    assert response.status_code == 200
    lines = response.content.decode().strip().splitlines()
    assert lines[0].startswith("Date,Type,Category")
    assert any(line.startswith("2026-10-03,Income,Rent,'=cmd|evil") for line in lines)
    assert lines[-2].endswith("9000.00,22500.00")
    assert lines[-1].endswith("-13500.00,")


def test_employee_model_is_scoped() -> None:
    assert Employee._meta.get_field("organization")
    assert Expense._meta.get_field("organization")
