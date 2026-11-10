from decimal import Decimal

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from django.urls import reverse
from rest_framework.test import APIClient

from apps.listings.models import ListingPhoto, ListingReport, PgRequest
from apps.organizations.models import Role
from core.tests.support import (
    Actor,
    authed_client,
    make_actor,
    make_listing,
    make_property,
    make_user,
    png_file,
)

PUBLIC = reverse("v1:public-listing-list")


def detail(listing) -> str:
    return reverse("v1:public-listing", args=[listing.slug])


class TestVerification:
    def test_unverified_listing_is_hidden(self, anon: APIClient, owner: Actor) -> None:
        hidden = make_listing(owner, verified=False)
        assert anon.get(PUBLIC).json()["results"] == []
        assert anon.get(detail(hidden)).status_code == 404

    @override_settings(LISTINGS_REQUIRE_VERIFICATION=False)
    def test_verification_can_be_switched_off(self, anon: APIClient, owner: Actor) -> None:
        make_listing(owner, verified=False)
        assert len(anon.get(PUBLIC).json()["results"]) == 1

    def test_operator_cannot_self_verify(self, owner: Actor) -> None:
        listing = make_listing(owner, verified=False)
        url = reverse("v1:listing-detail", args=[listing.pk])
        response = owner.client.patch(url, {"is_verified": True})
        assert response.status_code == 200
        listing.refresh_from_db()
        assert listing.is_verified is False


class TestOwnerPhone:
    def test_hidden_from_anonymous_visitors(self, anon: APIClient, owner: Actor) -> None:
        listing = make_listing(owner)
        body = anon.get(detail(listing)).json()
        assert body["contact_phone"] is None
        assert body["phone_hidden"] is True

    def test_shown_after_sign_in(self, owner: Actor) -> None:
        listing = make_listing(owner)
        seeker = authed_client(make_user())
        body = seeker.get(detail(listing)).json()
        assert body["contact_phone"] == "9845000000"
        assert body["phone_hidden"] is False

    def test_bad_token_is_treated_as_anonymous(self, owner: Actor) -> None:
        listing = make_listing(owner)
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION="Bearer expired-or-garbage")
        response = client.get(detail(listing))
        assert response.status_code == 200
        assert response.json()["contact_phone"] is None


class TestSearchFilters:
    @pytest.fixture
    def two(self, owner: Actor) -> None:
        a = make_property(
            owner.organization,
            name="Alpha",
            amenities=["wifi", "gym"],
            latitude=Decimal("12.912345"),
            longitude=Decimal("77.638765"),
        )
        b = make_property(
            owner.organization,
            name="Beta",
            amenities=["wifi"],
            latitude=Decimal("12.935000"),
            longitude=Decimal("77.624000"),
        )
        make_listing(owner, property=a, food_included=True)
        make_listing(owner, property=b)

    @pytest.mark.parametrize(
        "params,names",
        [
            ({"amenities": "wifi"}, {"Alpha", "Beta"}),
            ({"amenities": "wifi,gym"}, {"Alpha"}),
            ({"amenities": "pool"}, set()),
            ({"food": "true"}, {"Alpha"}),
            ({"min_lat": 12.90, "max_lat": 12.92, "min_lng": 77.63, "max_lng": 77.64}, {"Alpha"}),
            (
                {"min_lat": 12.0, "max_lat": 13.0, "min_lng": 77.0, "max_lng": 78.0},
                {"Alpha", "Beta"},
            ),
        ],
    )
    def test_filters(
        self, anon: APIClient, two: None, params: dict[str, str | float], names: set[str]
    ) -> None:
        rows = anon.get(PUBLIC, params).json()["results"]
        assert {r["name"] for r in rows} == names

    def test_partial_or_bad_bounds(self, anon: APIClient, two: None) -> None:
        assert anon.get(PUBLIC, {"min_lat": 12}).status_code == 400
        bad: dict[str, str | float] = {"min_lat": "x", "max_lat": 1, "min_lng": 1, "max_lng": 1}
        assert anon.get(PUBLIC, bad).status_code == 400

    def test_map_pin_is_approximate(self, anon: APIClient, two: None) -> None:
        rows = {r["name"]: r for r in anon.get(PUBLIC).json()["results"]}
        assert rows["Alpha"]["latitude"] == 12.912
        assert rows["Alpha"]["longitude"] == 77.639


class TestPropertyCoordinates:
    def test_both_or_neither(self, owner: Actor) -> None:
        url = reverse("v1:property-list")
        base = {"name": "P", "address_line": "a", "locality": "HSR Layout"}
        assert owner.client.post(url, {**base, "latitude": "12.9"}).status_code == 400
        assert (
            owner.client.post(url, {**base, "latitude": "95", "longitude": "77"}).status_code == 400
        )
        ok = owner.client.post(url, {**base, "latitude": "12.912345", "longitude": "77.638765"})
        assert ok.status_code == 201
        assert ok.json()["latitude"] == "12.912345"


class TestPhotos:
    def url(self, listing) -> str:
        return reverse("v1:listing-photos", args=[listing.pk])

    def test_upload_list_and_public(self, owner: Actor, anon: APIClient) -> None:
        listing = make_listing(owner)
        response = owner.client.post(
            self.url(listing), {"image": png_file(), "caption": "Room 101"}, format="multipart"
        )
        assert response.status_code == 201, response.json()
        body = response.json()
        assert body["url"].startswith("/media/public/listings/")
        assert (body["width"], body["height"]) == (64, 48)
        assert len(owner.client.get(self.url(listing)).json()) == 1
        public = anon.get(detail(listing)).json()
        assert public["photos"][0]["caption"] == "Room 101"

    def test_rejects_files_that_are_not_images(self, owner: Actor) -> None:
        listing = make_listing(owner)
        fake = SimpleUploadedFile("evil.png", b"<script>alert(1)</script>", "image/png")
        response = owner.client.post(self.url(listing), {"image": fake}, format="multipart")
        assert response.status_code == 400
        assert "image" in response.json()["error"]["fields"]

    @override_settings(MAX_UPLOAD_BYTES=100)
    def test_rejects_large_files(self, owner: Actor) -> None:
        listing = make_listing(owner)
        response = owner.client.post(
            self.url(listing), {"image": png_file(size=(400, 400))}, format="multipart"
        )
        assert response.status_code == 400

    def test_photo_limit(self, owner: Actor) -> None:
        listing = make_listing(owner)
        for i in range(15):
            ListingPhoto.objects.create(
                organization=owner.organization, listing=listing, image=png_file(f"p{i}.png")
            )
        response = owner.client.post(self.url(listing), {"image": png_file()}, format="multipart")
        assert response.status_code == 400

    def test_edit_and_delete_removes_file(self, owner: Actor) -> None:
        listing = make_listing(owner)
        photo_id = owner.client.post(
            self.url(listing), {"image": png_file()}, format="multipart"
        ).json()["id"]
        photo = ListingPhoto.objects.get(pk=photo_id)
        path = photo.image.path
        url = reverse("v1:listing-photo-detail", args=[photo_id])
        assert (
            owner.client.patch(url, {"caption": "Lobby", "position": 3}).json()["caption"]
            == "Lobby"
        )
        assert owner.client.delete(url).status_code == 204
        import os

        assert not os.path.exists(path)

    def test_staff_and_outsiders(self, owner: Actor, outsider: Actor) -> None:
        listing = make_listing(owner)
        staff = make_actor(Role.STAFF, organization=owner.organization)
        assert (
            staff.client.post(
                self.url(listing), {"image": png_file()}, format="multipart"
            ).status_code
            == 403
        )
        assert (
            outsider.client.post(
                self.url(listing), {"image": png_file()}, format="multipart"
            ).status_code
            == 404
        )
        photo = ListingPhoto.objects.create(
            organization=owner.organization, listing=listing, image=png_file()
        )
        url = reverse("v1:listing-photo-detail", args=[photo.pk])
        assert outsider.client.patch(url, {"caption": "x"}).status_code == 404
        assert outsider.client.delete(url).status_code == 404


class TestReportsAndRequests:
    def test_report_a_listing(self, anon: APIClient, owner: Actor) -> None:
        listing = make_listing(owner)
        url = reverse("v1:public-report", args=[listing.slug])
        response = anon.post(url, {"reason": "photos_mismatch", "details": "Rooms look older."})
        assert response.status_code == 201
        report = ListingReport.objects.get()
        assert (report.listing, report.status, report.reporter) == (listing, "open", None)
        assert anon.post(url, {"reason": "nonsense"}).status_code == 400
        assert (
            anon.post(reverse("v1:public-report", args=["nope"]), {"reason": "other"}).status_code
            == 404
        )

    def test_signed_in_reporter_is_recorded(self, owner: Actor) -> None:
        listing = make_listing(owner)
        user = make_user()
        authed_client(user).post(
            reverse("v1:public-report", args=[listing.slug]), {"reason": "fraud"}
        )
        assert ListingReport.objects.get().reporter == user

    def test_request_unlisted_pg(self, anon: APIClient) -> None:
        url = reverse("v1:public-pg-request")
        payload = {
            "pg_name": "Sai Comforts",
            "locality": "Marathahalli",
            "contact_name": "Ravi",
            "contact_phone": "+91 98450 11111",
        }
        assert anon.post(url, payload).status_code == 201
        assert PgRequest.objects.get().contact_phone == "9845011111"
        assert anon.post(url, {**payload, "contact_phone": "123"}).status_code == 400
        anon.post(url, {**payload, "website": "spam"})
        assert PgRequest.objects.count() == 1  # honeypot dropped silently
