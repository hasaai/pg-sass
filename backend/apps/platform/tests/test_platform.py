"""Platform admin API: only platform staff, across every business."""

from __future__ import annotations

import pytest
from django.urls import reverse
from rest_framework.test import APIClient

from apps.amenities import catalog
from apps.amenities.models import Amenity, AmenityCategory
from apps.organizations.models import Organization
from apps.properties.models import Property, PropertyDocument
from core.models import AuditLog
from core.tests.support import (
    Actor,
    authed_client,
    make_listing,
    make_platform_user,
    make_property,
    pdf_file,
)


@pytest.fixture
def admin() -> APIClient:
    return authed_client(make_platform_user(full_name="Platform Person"))


def doc_for(prop: Property, kind: str = "ownership_proof") -> PropertyDocument:
    return PropertyDocument.objects.create(
        organization=prop.organization,
        property=prop,
        kind=kind,
        file=pdf_file("deed.pdf"),
        file_name="deed.pdf",
        content_type="application/pdf",
    )


ENDPOINTS = [
    ("get", "v1:platform-overview", None),
    ("get", "v1:platform-organization-list", None),
    ("get", "v1:platform-property-list", None),
    ("get", "v1:platform-user-list", None),
    ("get", "v1:platform-amenity-list", None),
    ("get", "v1:platform-activity", None),
]


@pytest.mark.parametrize(("method", "name", "_"), ENDPOINTS)
def test_business_owners_and_visitors_are_refused(
    owner: Actor, anon: APIClient, method: str, name: str, _: object
) -> None:
    response = getattr(owner.client, method)(reverse(name))
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "not_platform_admin"
    assert getattr(anon, method)(reverse(name)).status_code == 401


def test_overview_counts_every_business(admin: APIClient, owner: Actor, outsider: Actor) -> None:
    make_property(owner.organization)
    make_property(outsider.organization, verification_status="submitted")
    body = admin.get(reverse("v1:platform-overview")).json()
    assert body["businesses"] == 2
    assert body["properties"] == 2
    assert body["awaiting_verification"] == 1


class TestBusinesses:
    def test_list_search_and_detail(self, admin: APIClient, owner: Actor, outsider: Actor) -> None:
        Organization.objects.filter(pk=owner.organization.pk).update(name="Lotus Stays")
        make_property(owner.organization)
        page = admin.get(reverse("v1:platform-organization-list"), {"q": "lotus st"}).json()
        assert page["count"] == 1
        row = page["results"][0]
        assert row["properties_count"] == 1
        assert row["owners"][0]["email"] == owner.user.email
        assert {f["key"] for f in row["features"]} >= {"finance", "marketplace"}
        assert all(f["enabled"] for f in row["features"])

    def test_switching_features_off_blocks_the_module(self, admin: APIClient, owner: Actor) -> None:
        listing = make_listing(owner)
        org = owner.organization
        features = reverse("v1:platform-organization-features", args=[org.pk])
        response = admin.put(
            features, {"disabled_features": ["finance", "marketplace"]}, format="json"
        )
        assert response.status_code == 200, response.json()
        off = {f["key"] for f in response.json()["features"] if not f["enabled"]}
        assert off == {"finance", "marketplace"}
        blocked = owner.client.get(reverse("v1:expense-list"))
        assert blocked.status_code == 403
        assert blocked.json()["error"]["code"] == "feature_disabled"
        assert owner.client.get(reverse("v1:listing-list")).status_code == 403
        assert owner.client.get(reverse("v1:property-list")).status_code == 200  # core stays
        listing.refresh_from_db()
        assert listing.is_published is False
        me = owner.client.get(reverse("v1:auth-me")).json()
        assert me["memberships"][0]["organization"]["disabled_features"] == [
            "finance",
            "marketplace",
        ]
        bad = admin.put(features, {"disabled_features": ["teleport"]}, format="json")
        assert bad.status_code == 400
        admin.put(features, {"disabled_features": []}, format="json")
        assert owner.client.get(reverse("v1:expense-list")).status_code == 200
        assert AuditLog.objects.filter(action="platform.features_changed").count() == 2

    def test_suspend_and_reactivate(self, admin: APIClient, owner: Actor) -> None:
        org = owner.organization
        suspend = reverse("v1:platform-organization-suspend", args=[org.pk])
        assert admin.post(suspend, {"reason": ""}, format="json").status_code == 400
        response = admin.post(suspend, {"reason": "Unpaid subscription"}, format="json")
        assert response.json()["status_label"] == "Suspended"
        assert owner.client.get(reverse("v1:property-list")).status_code == 403
        admin.post(reverse("v1:platform-organization-reactivate", args=[org.pk]))
        assert owner.client.get(reverse("v1:property-list")).status_code == 200


class TestVerification:
    def test_queue_detail_and_decisions(self, admin: APIClient, owner: Actor) -> None:
        prop = make_property(owner.organization)
        doc_for(prop)
        owner.client.post(
            reverse("v1:property-submit-verification", args=[prop.pk]), {}, format="json"
        )
        queue = admin.get(
            reverse("v1:platform-property-list"), {"verification_status": "submitted"}
        ).json()
        assert [r["id"] for r in queue["results"]] == [str(prop.pk)]
        assert queue["results"][0]["proof_documents_count"] == 1
        assert queue["results"][0]["submitted_at"]

        detail = admin.get(reverse("v1:platform-property-detail", args=[prop.pk])).json()
        assert detail["documents"][0]["kind"] == "ownership_proof"
        doc_id = detail["documents"][0]["id"]
        download = admin.get(reverse("v1:platform-document-download", args=[doc_id]))
        assert download.status_code == 200
        assert AuditLog.objects.filter(
            action="property.document_downloaded", data__by_platform=True
        ).exists()

        decide = reverse("v1:platform-property-verification", args=[prop.pk])
        no_reason = admin.post(decide, {"decision": "changes_requested"}, format="json")
        assert no_reason.status_code == 400
        changes = admin.post(
            decide,
            {"decision": "changes_requested", "note": "The deed page 2 is missing."},
            format="json",
        )
        assert changes.json()["verification_status_label"] == "Changes needed"
        history = owner.client.get(reverse("v1:property-verification", args=[prop.pk])).json()
        assert history[0]["by"] == "PG Manager team"
        assert history[0]["note"] == "The deed page 2 is missing."
        accepted = admin.post(decide, {"decision": "verified"}, format="json")
        assert accepted.json()["verification_status"] == "verified"

    def test_owner_cannot_use_platform_download(self, owner: Actor) -> None:
        doc = doc_for(make_property(owner.organization))
        response = owner.client.get(reverse("v1:platform-document-download", args=[doc.pk]))
        assert response.status_code == 403


class TestUsersAndCatalog:
    def test_deactivate_a_user_but_not_yourself(self, admin: APIClient, owner: Actor) -> None:
        listed = admin.get(reverse("v1:platform-user-list"), {"q": str(owner.user.email)}).json()
        assert listed["results"][0]["memberships"][0]["role"] == "owner"
        off = admin.post(reverse("v1:platform-user-deactivate", args=[owner.user.pk]))
        assert off.json()["is_active"] is False
        assert owner.client.get(reverse("v1:property-list")).status_code == 401
        me = admin.get(reverse("v1:auth-me")).json()
        assert me["is_platform_admin"] is True
        self_off = admin.post(reverse("v1:platform-user-deactivate", args=[me["id"]]))
        assert self_off.status_code == 400

    def test_edit_the_amenity_catalog(self, admin: APIClient) -> None:
        catalog.sync(AmenityCategory, Amenity)
        rows = admin.get(reverse("v1:platform-amenity-list")).json()
        assert len(rows) == Amenity.objects.count()
        response = admin.patch(
            reverse("v1:platform-amenity-detail", args=["wifi"]),
            {"is_active": False, "name": "Wi-Fi internet"},
            format="json",
        )
        assert response.status_code == 200, response.json()
        wifi = Amenity.objects.get(key="wifi")
        assert (wifi.is_active, wifi.name) == (False, "Wi-Fi internet")
        assert "wifi" not in [
            a["key"]
            for c in APIClient().get(reverse("v1:amenity-catalog")).json()["categories"]
            for a in c["amenities"]
        ]
