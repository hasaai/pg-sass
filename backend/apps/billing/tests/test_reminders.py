import datetime as dt
from unittest import mock
from urllib.parse import unquote

import pytest
from django.core import mail
from django.core.management import call_command
from django.urls import reverse

from apps.billing import reminders, services
from apps.billing.models import Invoice, RentReminder
from apps.organizations.models import Role
from apps.tenants import services as stays
from core.money import format_inr
from core.tests.support import Actor, make_actor, make_property, make_room, make_stay, make_tenant

TODAY = dt.date(2026, 10, 18)
DUE = reverse("v1:reminders-due")


@pytest.fixture(autouse=True)
def _today():
    with mock.patch("django.utils.timezone.localdate", return_value=TODAY):
        yield


@pytest.fixture
def invoices(owner: Actor) -> dict[str, Invoice]:
    prop = make_property(owner.organization, name="Lotus", rent_due_day=5)
    beds = list(make_room(prop, sharing=4, rent=900000).beds.all())
    people = [
        ("Meera Nair", "9900000001", "meera@example.com"),
        ("Asha", "9900000002", ""),
        ("Paid Up", "9900000003", "paid@example.com"),
        ("Left Already", "9900000004", "left@example.com"),
    ]
    stays_ = [
        make_stay(
            owner,
            bed,
            make_tenant(owner.organization, phone=p, full_name=n, email=e),
            dt.date(2026, 9, 1),
        )
        for bed, (n, p, e) in zip(beds, people, strict=True)
    ]
    created = services.generate_invoices(
        organization=owner.organization, actor=owner.user, period=dt.date(2026, 10, 1)
    )
    Invoice.objects.update(due_date=dt.date(2026, 10, 5))
    by_name = {i.stay.tenant.full_name: Invoice.objects.get(pk=i.pk) for i in created}
    services.record_payment(
        actor=owner.user,
        invoice=by_name["Paid Up"],
        amount=900000,
        mode="upi",
        received_on=dt.date(2026, 10, 2),
    )
    stays.checkout(
        actor=owner.user, stay=stays_[3], check_out_date=dt.date(2026, 10, 10), deductions=[]
    )
    return by_name


def test_format_inr() -> None:
    assert format_inr(12345600) == "₹1,23,456"
    assert format_inr(1250050) == "₹12,500.50"
    assert format_inr(99900) == "₹999"


def test_due_list(owner: Actor, invoices: dict) -> None:
    rows = owner.client.get(DUE).json()
    assert {r["tenant_name"] for r in rows} == {"Meera Nair", "Asha"}  # not paid, not left
    meera = next(r for r in rows if r["tenant_name"] == "Meera Nair")
    assert meera["days_overdue"] == 13
    assert meera["balance"] == 900000
    assert meera["whatsapp_url"].startswith("https://wa.me/919900000001?text=")
    text = unquote(meera["whatsapp_url"].split("text=")[1])
    assert "Hi Meera" in text and "₹9,000" in text and "was due on 05 Oct" in text
    assert meera["last_reminded_at"] is None


def test_not_yet_due_is_excluded(owner: Actor, invoices: dict) -> None:
    Invoice.objects.update(due_date=dt.date(2026, 10, 30))
    assert owner.client.get(DUE).json() == []
    Invoice.objects.update(due_date=dt.date(2026, 10, 20))  # due within 3 days
    assert len(owner.client.get(DUE).json()) == 2


def test_log_whatsapp_reminder(owner: Actor, invoices: dict) -> None:
    inv = invoices["Asha"]
    response = owner.client.post(
        reverse("v1:reminders-log"), {"invoice": str(inv.pk), "channel": "whatsapp"}
    )
    assert response.status_code == 201
    row = next(r for r in owner.client.get(DUE).json() if r["tenant_name"] == "Asha")
    assert row["last_reminded_at"] is not None


def test_email_reminders_and_three_day_gap(owner: Actor, invoices: dict) -> None:
    url = reverse("v1:reminders-email")
    ids = [str(invoices["Meera Nair"].pk), str(invoices["Asha"].pk), str(invoices["Paid Up"].pk)]
    result = owner.client.post(url, {"invoices": ids}).json()
    assert result == {"sent": 1, "skipped_recent": 0, "no_email": 1, "failed": 0}
    assert mail.outbox[0].to == ["meera@example.com"]
    assert "Rent reminder" in mail.outbox[0].subject
    again = owner.client.post(url, {"invoices": ids}).json()
    assert again["skipped_recent"] == 1 and len(mail.outbox) == 1


def test_automatic_command(owner: Actor, invoices: dict, outsider: Actor) -> None:
    call_command("send_rent_reminders")
    assert [m.to for m in mail.outbox] == [["meera@example.com"]]
    assert RentReminder.objects.get().automatic is True
    assert reminders.run_automatic()["skipped_recent"] == 1


def test_roles_and_isolation(owner: Actor, outsider: Actor, invoices: dict) -> None:
    staff = make_actor(Role.STAFF, organization=owner.organization)
    assert staff.client.get(DUE).status_code == 403
    assert outsider.client.get(DUE).json() == []
    foreign = str(invoices["Meera Nair"].pk)
    assert (
        outsider.client.post(reverse("v1:reminders-email"), {"invoices": [foreign]}).status_code
        == 400
    )
    assert (
        outsider.client.post(
            reverse("v1:reminders-log"), {"invoice": foreign, "channel": "whatsapp"}
        ).status_code
        == 400
    )
