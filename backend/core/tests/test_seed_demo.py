import datetime as dt
from io import StringIO
from unittest import mock

import pytest
from django.core.management import CommandError, call_command
from django.test import override_settings

from apps.accounts.models import User
from apps.amenities.models import PropertyAmenity
from apps.applications.models import Application, WishlistItem
from apps.billing.models import Invoice, Payment, RentReminder
from apps.finance.models import Employee, Expense
from apps.listings.models import Enquiry, Listing, ListingPhoto, PgRequest
from apps.organizations.models import Membership
from apps.properties.models import Bed, Property, PropertyPhoto
from apps.tenants.models import Stay


def seed(today: dt.date, *args: str) -> str:
    out = StringIO()
    with mock.patch("django.utils.timezone.localdate", return_value=today):
        call_command("seed_demo", *args, stdout=out)
    return out.getvalue()


# Month starts, month ends and a year boundary are where date logic breaks.
@pytest.mark.parametrize(
    "today",
    [
        dt.date(2026, 10, 1),
        dt.date(2026, 10, 2),
        dt.date(2026, 10, 18),
        dt.date(2026, 10, 31),
        dt.date(2027, 1, 3),
        dt.date(2026, 3, 1),
    ],
)
@override_settings(DEBUG=True)
def test_seed_demo_builds_a_realistic_org(today: dt.date) -> None:
    output = seed(today)
    assert "Demo data ready" in output
    assert Bed.objects.count() == 49
    assert Bed.objects.filter(status="occupied").count() >= 30
    assert Stay.objects.filter(status="notice").count() == 3
    assert Stay.objects.filter(status="closed").count() == 4
    assert Listing.objects.filter(is_published=True).count() == 4
    assert Enquiry.objects.count() == 12
    assert Membership.objects.get(user__email="raju@example.com").properties.exists()
    assert User.objects.count() == 15  # 5 team, 1 seeker, 5 applicants, 4 platform team
    # PG Buddy style marketplace data
    assert Listing.objects.filter(is_verified=True).count() == 4
    assert PropertyPhoto.objects.count() == 12
    # Amenities: from the catalog, with details, kept in sync with Property.amenities
    assert PropertyAmenity.objects.filter(status="available").count() >= 4 * 20
    assert Property.objects.filter(property_type="coliving").count() == 1
    assert PropertyAmenity.objects.filter(level="room").exists()
    assert PropertyAmenity.objects.filter(charge="extra", charge_amount__gt=0).exists()
    assert all(
        "wifi" in p.amenities and "lift" not in p.amenities
        for p in Property.objects.filter(property_type="pg")
    )
    assert ListingPhoto.objects.count() == 4
    assert not Listing.objects.filter(property__latitude__isnull=True).exists()
    statuses = sorted(Application.objects.values_list("status", flat=True))
    assert statuses == ["approved", "declined", "pending", "pending", "pending", "pending"]
    assert Application.objects.get(status="approved").stay is not None
    assert WishlistItem.objects.count() == 2
    assert PgRequest.objects.count() == 1
    # Finance: staff, salaries and running costs
    assert Employee.objects.count() == 6
    assert Expense.objects.filter(category="salary").exists()
    assert Expense.objects.exclude(category="salary").exists()
    assert not Expense.objects.filter(paid_on__gt=today).exists()
    assert RentReminder.objects.exists()
    invoices = Invoice.objects.all()
    assert invoices.count() >= 90
    assert {"paid", "partially_paid", "issued"} <= set(invoices.values_list("status", flat=True))
    # Every payment is dated on or before today, and never more than the invoice.
    assert not Payment.objects.filter(received_on__gt=today).exists()
    assert all(i.paid <= i.total for i in invoices)
    # Overdue invoices exist (unpaid, due date in the past) so the dues screens have data.
    assert any(i.balance > 0 and i.due_date < today for i in invoices)


# --fresh runs `flush`, which PostgreSQL refuses inside the per-test transaction.
@pytest.mark.django_db(transaction=True)
@override_settings(DEBUG=True)
def test_seed_demo_twice_and_fresh() -> None:
    today = dt.date(2026, 10, 18)
    seed(today)
    assert "already exists" in seed(today)
    assert Bed.objects.count() == 49
    assert "Demo data ready" in seed(today, "--fresh")
    assert Bed.objects.count() == 49  # rebuilt, not doubled


def test_seed_demo_refuses_without_debug() -> None:
    with pytest.raises(CommandError):
        call_command("seed_demo")
