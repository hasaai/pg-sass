import datetime as dt
from unittest import mock

import pytest
from django.urls import reverse
from rest_framework.test import APIClient

from apps.listings.models import Enquiry, Listing
from apps.organizations.models import Organization
from apps.properties.models import Bed
from core.tests.support import Actor, assert_isolated, make_property, make_room

LISTINGS = reverse("v1:listing-list")
PUBLIC = reverse("v1:public-listing-list")


@pytest.fixture
def listing(owner: Actor) -> Listing:
    prop = make_property(owner.organization, name="Lotus PG", locality="HSR Layout", gender="women")
    make_room(prop, number="101", sharing=2, rent=900000)
    room = make_room(prop, number="102", sharing=3, rent=650000)
    Bed.objects.filter(room=room, label="A").update(status=Bed.Status.OCCUPIED)
    Bed.objects.filter(room=room, label="B").update(status=Bed.Status.BLOCKED)
    response = owner.client.post(
        LISTINGS,
        {
            "property": str(prop.pk),
            "headline": "Lotus PG for women",
            "is_published": True,
            "contact_phone": "9845000000",
        },
    )
    assert response.status_code == 201, response.json()
    # The platform team verifies listings before they go public.
    Listing.objects.filter(pk=response.json()["id"]).update(is_verified=True)
    return Listing.objects.get(pk=response.json()["id"])


class TestOperatorListings:
    def test_slug_published_at_and_options(self, owner: Actor, listing: Listing) -> None:
        assert listing.slug == "lotus-pg-hsr-layout"
        assert listing.published_at is not None
        body = owner.client.get(reverse("v1:listing-detail", args=[listing.pk])).json()
        assert body["options"] == [
            {
                "sharing": 2,
                "min_rent": 900000,
                "max_rent": 900000,
                "vacant_beds": 2,
                "is_ac": False,
            },
            {
                "sharing": 3,
                "min_rent": 650000,
                "max_rent": 650000,
                "vacant_beds": 1,
                "is_ac": False,
            },
        ]

    def test_one_listing_per_property(self, owner: Actor, listing: Listing) -> None:
        response = owner.client.post(
            LISTINGS, {"property": str(listing.property_id), "headline": "x"}
        )
        assert "property" in response.json()["error"]["fields"]

    def test_staff_cannot_manage(self, owner: Actor, staff: Actor, listing: Listing) -> None:
        assert staff.client.get(LISTINGS).status_code == 403

    def test_isolation(self, owner: Actor, outsider: Actor, listing: Listing) -> None:
        assert_isolated(
            outsider.client,
            reverse("v1:listing-detail", args=[listing.pk]),
            payload={"headline": "x"},
        )


class TestPublicMarketplace:
    def test_search_shows_published_without_address(
        self, anon: APIClient, listing: Listing
    ) -> None:
        response = anon.get(PUBLIC)
        assert response.status_code == 200
        [row] = response.json()["results"]
        assert row["slug"] == listing.slug
        assert row["starting_rent"] == 650000
        assert row["vacant_beds"] == 3
        assert "address_line" not in row and "id" not in row

    @pytest.mark.parametrize(
        "params,found",
        [
            ({"locality": "hsr layout"}, True),
            ({"locality": "Koramangala"}, False),
            ({"gender": "men"}, False),
            ({"sharing": 2}, True),
            ({"sharing": 1}, False),
            ({"max_rent": 700000}, True),
            ({"max_rent": 500000}, False),
            ({"q": "lotus"}, True),
            ({"available": "true", "sharing": 3}, True),
        ],
    )
    def test_filters(self, anon: APIClient, listing: Listing, params: dict, found: bool) -> None:
        rows = anon.get(PUBLIC, params).json()["results"]
        assert bool(rows) is found

    def test_unpublished_and_suspended_hidden(self, anon: APIClient, listing: Listing) -> None:
        Organization.objects.filter(pk=listing.organization_id).update(status="suspended")
        assert anon.get(PUBLIC).json()["results"] == []
        assert anon.get(reverse("v1:public-listing", args=[listing.slug])).status_code == 404
        Organization.objects.filter(pk=listing.organization_id).update(status="active")
        Listing.objects.filter(pk=listing.pk).update(is_published=False)
        assert anon.get(PUBLIC).json()["results"] == []

    def test_bad_filter_values(self, anon: APIClient) -> None:
        assert anon.get(PUBLIC, {"sharing": "two"}).status_code == 400
        assert anon.get(PUBLIC, {"gender": "x"}).status_code == 400

    def test_localities(self, anon: APIClient, listing: Listing) -> None:
        response = anon.get(reverse("v1:public-localities"))
        assert response.json() == [{"locality": "HSR Layout", "listings": 1}]


class TestEnquiries:
    def url(self, listing: Listing) -> str:
        return reverse("v1:public-enquiry", args=[listing.slug])

    def test_public_enquiry_lands_in_inbox(
        self, anon: APIClient, owner: Actor, listing: Listing
    ) -> None:
        response = anon.post(
            self.url(listing),
            {
                "name": "Divya",
                "phone": "98450 11111",
                "preferred_sharing": 2,
                "message": "Visit Sat?",
            },
        )
        assert response.status_code == 201
        assert response.json() == {"status": "received"}
        [row] = owner.client.get(reverse("v1:enquiry-list")).json()["results"]
        assert (row["name"], row["phone"], row["status"]) == ("Divya", "9845011111", "new")
        updated = owner.client.patch(
            reverse("v1:enquiry-detail", args=[row["id"]]),
            {"status": "contacted", "notes": "Called", "name": "Hacked"},
        )
        assert updated.json()["status"] == "contacted"
        assert updated.json()["name"] == "Divya"

    def test_validation(self, anon: APIClient, listing: Listing) -> None:
        response = anon.post(
            self.url(listing), {"name": "", "phone": "123", "move_in_date": "2000-01-01"}
        )
        assert {"name", "phone", "move_in_date"} <= set(response.json()["error"]["fields"])

    def test_honeypot_is_silently_dropped(self, anon: APIClient, listing: Listing) -> None:
        response = anon.post(
            self.url(listing), {"name": "Bot", "phone": "9845011111", "website": "http://spam"}
        )
        assert response.status_code == 201
        assert not Enquiry.objects.exists()

    def test_unknown_listing(self, anon: APIClient) -> None:
        response = anon.post(
            reverse("v1:public-enquiry", args=["nope"]), {"name": "a", "phone": "9845011111"}
        )
        assert response.status_code == 404

    def test_rate_limited(self, anon: APIClient, listing: Listing) -> None:
        from django.core.cache import cache
        from rest_framework.throttling import ScopedRateThrottle

        cache.clear()
        payload = {"name": "A", "phone": "9845011111"}
        with mock.patch.dict(ScopedRateThrottle.THROTTLE_RATES, {"enquiry": "2/hour"}):
            codes = [anon.post(self.url(listing), payload).status_code for _ in range(3)]
        assert codes == [201, 201, 429]

    def test_staff_and_outsider(
        self, owner: Actor, staff: Actor, outsider: Actor, listing: Listing
    ) -> None:
        e = Enquiry.objects.create(
            organization=owner.organization,
            listing=listing,
            name="x",
            phone="9845011111",
            move_in_date=dt.date(2030, 1, 1),
        )
        assert staff.client.get(reverse("v1:enquiry-list")).status_code == 403
        assert_isolated(
            outsider.client,
            reverse("v1:enquiry-detail", args=[e.pk]),
            methods=["get", "patch"],
            payload={"status": "lost"},
        )
