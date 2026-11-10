from pathlib import Path

from django.urls import reverse
from rest_framework.test import APIClient

from apps.properties.models import PropertyPhoto
from core.tests.support import (
    Actor,
    assert_isolated,
    make_listing,
    make_property,
    pdf_file,
    png_file,
)


def upload_url(prop) -> str:
    return reverse("v1:property-photos", args=[prop.pk])


def upload(actor: Actor, prop, **extra):
    return actor.client.post(upload_url(prop), {"image": png_file(), **extra}, format="multipart")


class TestPropertyPhotos:
    def test_upload_shows_on_property(self, owner: Actor) -> None:
        prop = make_property(owner.organization)
        response = upload(owner, prop, caption="Front gate")
        assert response.status_code == 201, response.json()
        body = response.json()
        assert body["caption"] == "Front gate"
        assert body["url"].startswith(f"/media/public/properties/{owner.organization.pk}/")
        assert (body["width"], body["height"]) > (0, 0)
        detail = owner.client.get(reverse("v1:property-detail", args=[prop.pk])).json()
        assert [p["caption"] for p in detail["photos"]] == ["Front gate"]

    def test_staff_see_but_cannot_upload(self, owner: Actor, staff: Actor) -> None:
        prop = make_property(owner.organization)
        upload(owner, prop)
        assert upload(staff, prop).status_code == 403
        detail = staff.client.get(reverse("v1:property-detail", args=[prop.pk])).json()
        assert len(detail["photos"]) == 1

    def test_rejects_non_images(self, owner: Actor) -> None:
        prop = make_property(owner.organization)
        response = owner.client.post(upload_url(prop), {"image": pdf_file()}, format="multipart")
        assert response.status_code == 400
        assert "image" in response.json()["error"]["fields"]
        assert not PropertyPhoto.objects.exists()

    def test_limit(self, owner: Actor, monkeypatch) -> None:
        monkeypatch.setattr("apps.properties.views.MAX_PROPERTY_PHOTOS", 2)
        prop = make_property(owner.organization)
        upload(owner, prop)
        upload(owner, prop)
        response = upload(owner, prop)
        assert response.status_code == 400
        assert "at most 2" in str(response.json()["error"]["fields"]["image"])

    def test_edit_and_delete_removes_file(self, owner: Actor, manager: Actor) -> None:
        prop = make_property(owner.organization)
        photo_id = upload(owner, prop).json()["id"]
        photo = PropertyPhoto.objects.get(pk=photo_id)
        path = Path(photo.image.path)
        assert path.exists()
        url = reverse("v1:property-photo-detail", args=[photo_id])
        response = manager.client.patch(url, {"caption": "Lobby", "position": 4})
        assert response.status_code == 200
        assert response.json() == {"caption": "Lobby", "position": 4}
        assert manager.client.delete(url).status_code == 204
        assert not path.exists()

    def test_staff_cannot_edit(self, owner: Actor, staff: Actor) -> None:
        prop = make_property(owner.organization)
        url = reverse("v1:property-photo-detail", args=[upload(owner, prop).json()["id"]])
        assert staff.client.patch(url, {"caption": "x"}).status_code == 403
        assert staff.client.delete(url).status_code == 403

    def test_other_organization_gets_404(self, owner: Actor, outsider: Actor) -> None:
        prop = make_property(owner.organization)
        photo_id = upload(owner, prop).json()["id"]
        assert_isolated(
            outsider.client,
            reverse("v1:property-photo-detail", args=[photo_id]),
            methods=("patch", "delete"),
            payload={"caption": "x"},
        )
        response = outsider.client.post(upload_url(prop), {"image": png_file()}, format="multipart")
        assert response.status_code == 404
        assert PropertyPhoto.objects.count() == 1


class TestPublicListingPhotos:
    def test_property_photos_come_first_on_the_listing(self, owner: Actor, anon: APIClient) -> None:
        prop = make_property(owner.organization)
        listing = make_listing(owner, property=prop)
        upload(owner, prop, caption="Building")
        owner.client.post(
            reverse("v1:listing-photos", args=[listing.pk]),
            {"image": png_file(), "caption": "Offer room"},
            format="multipart",
        )
        public = anon.get(reverse("v1:public-listing", args=[listing.slug])).json()
        assert [p["caption"] for p in public["photos"]] == ["Building", "Offer room"]
        assert all(p["url"].startswith("/media/public/") for p in public["photos"])
        rows = anon.get(reverse("v1:public-listing-list")).json()["results"]
        assert [p["caption"] for p in rows[0]["photos"]] == ["Building", "Offer room"]
