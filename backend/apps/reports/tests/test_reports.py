import datetime as dt
from unittest import mock

import pytest
from django.urls import reverse

from apps.billing import services as billing
from apps.operations.models import Complaint
from apps.organizations.models import Role
from core.tests.support import Actor, make_actor, make_property, make_room, make_stay, make_tenant

DASHBOARD = reverse("v1:report-dashboard")
CSV = reverse("v1:report-collections")
TODAY = dt.date(2026, 10, 20)


@pytest.fixture(autouse=True)
def _today():
    with mock.patch("django.utils.timezone.localdate", return_value=TODAY):
        yield


@pytest.fixture
def busy_org(owner: Actor) -> Actor:
    prop = make_property(owner.organization, rent_due_day=5)
    a, b = make_room(prop, sharing=2, rent=1000000).beds.all()
    tenant = make_tenant(owner.organization, full_name="=HYPERLINK(evil)")
    make_stay(owner, a, tenant, dt.date(2026, 9, 1))
    [inv] = billing.generate_invoices(
        organization=owner.organization, actor=owner.user, period=dt.date(2026, 10, 1)
    )
    # Issued on the 20th, so due today; pretend it was issued on time (due the 5th).
    type(inv).objects.filter(pk=inv.pk).update(due_date=dt.date(2026, 10, 5))
    billing.record_payment(
        actor=owner.user,
        invoice=inv,
        amount=400000,
        mode="upi",
        received_on=dt.date(2026, 10, 3),
        reference="UTR1",
    )
    Complaint.objects.create(
        organization=owner.organization, property=prop, title="t", category="other", priority="high"
    )
    return owner


def test_dashboard_numbers(busy_org: Actor) -> None:
    body = busy_org.client.get(DASHBOARD, {"period": "2026-10"}).json()
    assert body["beds"]["occupied"] == 1 and body["beds"]["total"] == 2
    assert body["occupancy_rate"] == 50.0
    assert body["tenants"]["current"] == 1
    assert body["money"] == {
        "invoiced": 1000000,
        "collected": 400000,
        "outstanding": 600000,
        "overdue": 600000,
        "overdue_invoices": 1,
    }
    assert body["complaints"] == {"open": 1, "high_priority_open": 1}


def test_staff_dashboard_hides_money(busy_org: Actor) -> None:
    staff = make_actor(Role.STAFF, organization=busy_org.organization)
    body = staff.client.get(DASHBOARD).json()
    assert body["money"] is None
    assert "enquiries" not in body


def test_dashboard_is_per_organization(busy_org: Actor, outsider: Actor) -> None:
    body = outsider.client.get(DASHBOARD).json()
    assert body["beds"]["total"] == 0
    assert body["money"]["collected"] == 0


def test_collections_csv(busy_org: Actor) -> None:
    response = busy_org.client.get(CSV, {"period": "2026-10"})
    assert response.status_code == 200
    assert response["Content-Type"] == "text/csv"
    lines = response.content.decode().strip().splitlines()
    assert lines[0].startswith("Receipt,Date,Tenant")
    assert "4000.00" in lines[1]
    assert "'=HYPERLINK(evil)" in lines[1]  # formula injection neutralised


def test_csv_roles_and_bad_period(busy_org: Actor) -> None:
    staff = make_actor(Role.STAFF, organization=busy_org.organization)
    assert staff.client.get(CSV).status_code == 403
    assert busy_org.client.get(CSV, {"period": "October"}).status_code == 400


def test_audit_log_owner_only(busy_org: Actor) -> None:
    manager = make_actor(Role.MANAGER, organization=busy_org.organization)
    actions = {
        row["action"] for row in busy_org.client.get(reverse("v1:audit-log-list")).json()["results"]
    }
    assert {"stay.check_in", "invoice.generate", "payment.record"} <= actions
    assert manager.client.get(reverse("v1:audit-log-list")).status_code == 403
