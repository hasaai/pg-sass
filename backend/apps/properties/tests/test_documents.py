"""Property logo, private documents and verification (owner side)."""

from __future__ import annotations

import datetime as dt

from django.urls import reverse

from apps.properties.models import Property, PropertyDocument, VerificationEvent
from apps.properties.services import document_state
from core.models import AuditLog
from core.tests.support import Actor, assert_isolated, make_property, pdf_file, png_file


def url(name: str, pk: object, action: str | None = None) -> str:
    return reverse(f"v1:{name}-{action or 'detail'}", args=[pk])


def upload(actor: Actor, prop: Property, **fields: object) -> dict:
    data = {"kind": "ownership_proof", "file": pdf_file("deed.pdf"), **fields}
    response = actor.client.post(url("property", prop.pk, "documents"), data, format="multipart")
    assert response.status_code == 201, response.json()
    return response.json()


class TestPropertyLogo:
    def test_upload_replace_and_remove(self, owner: Actor) -> None:
        prop = make_property(owner.organization)
        logo = url("property", prop.pk, "logo")
        first = owner.client.post(logo, {"image": png_file("a.png")}, format="multipart")
        assert first.status_code == 200, first.json()
        assert first.json()["logo_url"].startswith("/media/public/logos/")
        owner.client.post(logo, {"image": png_file("b.png")}, format="multipart")
        prop.refresh_from_db()
        assert prop.logo.name.endswith(".png")
        assert owner.client.get(url("property", prop.pk)).json()["logo_url"]
        removed = owner.client.delete(logo)
        assert removed.json() == {"logo_url": None}

    def test_rejects_non_images_and_wrong_roles(
        self, owner: Actor, staff: Actor, outsider: Actor
    ) -> None:
        prop = make_property(owner.organization)
        logo = url("property", prop.pk, "logo")
        bad = owner.client.post(logo, {"image": pdf_file()}, format="multipart")
        assert bad.status_code == 400
        assert staff.client.post(logo, {"image": png_file()}, format="multipart").status_code == 403
        theirs = outsider.client.post(logo, {"image": png_file()}, format="multipart")
        assert theirs.status_code == 404


class TestBusinessLogo:
    def test_owner_sets_logo_shown_in_me(self, owner: Actor, manager: Actor) -> None:
        logo = reverse("v1:organization-current-logo")
        assert (
            manager.client.post(logo, {"image": png_file()}, format="multipart").status_code == 403
        )
        response = owner.client.post(logo, {"image": png_file()}, format="multipart")
        assert response.status_code == 200, response.json()
        assert response.json()["logo_url"]
        me = owner.client.get(reverse("v1:auth-me")).json()
        assert me["memberships"][0]["organization"]["logo_url"] == response.json()["logo_url"]
        assert me["is_platform_admin"] is False
        assert owner.client.delete(logo).json()["logo_url"] is None


class TestDocuments:
    def test_upload_list_edit_download_delete(self, owner: Actor) -> None:
        prop = make_property(owner.organization)
        doc = upload(
            owner,
            prop,
            kind="trade_license",
            title="BBMP licence",
            issued_on="2026-01-01",
            expires_on="2027-01-01",
        )
        assert doc["kind_label"] == "Trade licence"
        assert doc["display_title"] == "BBMP licence"
        assert doc["file_name"] == "deed.pdf"
        assert doc["content_type"] == "application/pdf"
        assert "file" not in doc  # no public link: download goes through the API
        listed = owner.client.get(url("property", prop.pk, "documents")).json()
        assert [d["id"] for d in listed] == [doc["id"]]

        patched = owner.client.patch(
            url("property-document", doc["id"]), {"note": "Renew in December"}, format="json"
        )
        assert patched.json()["note"] == "Renew in December"
        bad_dates = owner.client.patch(
            url("property-document", doc["id"]), {"expires_on": "2025-01-01"}, format="json"
        )
        assert bad_dates.status_code == 400

        download = owner.client.get(url("property-document", doc["id"], "download"))
        assert download.status_code == 200
        body = b"".join(download.streaming_content)  # type: ignore[attr-defined]
        assert body.startswith(b"%PDF")
        assert 'filename="deed.pdf"' in download["Content-Disposition"]
        assert AuditLog.objects.filter(action="property.document_downloaded").count() == 1

        assert owner.client.delete(url("property-document", doc["id"])).status_code == 204
        assert not PropertyDocument.objects.exists()
        assert AuditLog.objects.filter(action="property.document_deleted").count() == 1

    def test_only_documents_and_images_up_to_the_size_limit(self, owner: Actor) -> None:
        from django.core.files.uploadedfile import SimpleUploadedFile

        prop = make_property(owner.organization)
        exe = SimpleUploadedFile("x.pdf", b"MZ\x90\x00 not a pdf", "application/pdf")
        response = owner.client.post(
            url("property", prop.pk, "documents"),
            {"kind": "other", "file": exe},
            format="multipart",
        )
        assert response.status_code == 400
        assert "file" in response.json()["error"]["fields"]
        no_kind = owner.client.post(
            url("property", prop.pk, "documents"), {"file": pdf_file()}, format="multipart"
        )
        assert "kind" in no_kind.json()["error"]["fields"]

    def test_staff_cannot_see_documents(self, owner: Actor, staff: Actor) -> None:
        prop = make_property(owner.organization)
        doc = upload(owner, prop)
        assert staff.client.get(url("property", prop.pk, "documents")).status_code == 403
        assert staff.client.get(url("property-document", doc["id"], "download")).status_code == 403
        assert staff.client.delete(url("property-document", doc["id"])).status_code == 403

    def test_other_organizations_get_404(self, owner: Actor, outsider: Actor) -> None:
        prop = make_property(owner.organization)
        doc = upload(owner, prop)
        assert_isolated(
            outsider.client, url("property-document", doc["id"]), methods=("patch", "delete")
        )
        assert (
            outsider.client.get(url("property-document", doc["id"], "download")).status_code == 404
        )
        assert outsider.client.get(url("property", prop.pk, "documents")).status_code == 404

    def test_expiry_states(self) -> None:
        today = dt.date(2026, 10, 18)
        doc = PropertyDocument(expires_on=None)
        assert document_state(doc, today) == ("no_expiry", "No expiry date")
        doc.expires_on = dt.date(2026, 10, 10)
        assert document_state(doc, today) == ("expired", "Expired on 10 Oct 2026")
        doc.expires_on = dt.date(2026, 10, 19)
        assert document_state(doc, today) == ("expiring", "Expires in 1 day")
        doc.expires_on = dt.date(2027, 10, 19)
        assert document_state(doc, today)[0] == "valid"


class TestVerificationByOwner:
    def test_needs_a_proof_document(self, owner: Actor) -> None:
        prop = make_property(owner.organization)
        submit = url("property", prop.pk, "submit-verification")
        refused = owner.client.post(submit, {}, format="json")
        assert refused.status_code == 409
        assert refused.json()["error"]["code"] == "proof_missing"
        upload(owner, prop, kind="electricity_bill")
        assert owner.client.post(submit, {}, format="json").status_code == 409
        upload(owner, prop, kind="rental_agreement")
        ok = owner.client.post(submit, {"note": "New PG"}, format="json")
        assert ok.status_code == 200, ok.json()
        assert ok.json()["verification_status_label"] == "Being checked"
        again = owner.client.post(submit, {}, format="json")
        assert again.status_code == 409
        history = owner.client.get(url("property", prop.pk, "verification")).json()
        assert [(h["status"], h["note"], h["by_platform"]) for h in history] == [
            ("submitted", "New PG", False)
        ]

    def test_changing_proof_after_verification_sends_it_back(self, owner: Actor) -> None:
        prop = make_property(owner.organization, verification_status="verified")
        upload(owner, prop, kind="trade_license")
        prop.refresh_from_db()
        assert prop.verification_status == "verified"  # not a proof document
        doc = upload(owner, prop, kind="ownership_proof")
        prop.refresh_from_db()
        assert prop.verification_status == "submitted"
        assert VerificationEvent.objects.filter(property=prop, status="submitted").exists()
        Property.objects.filter(pk=prop.pk).update(verification_status="verified")
        owner.client.delete(url("property-document", doc["id"]))
        prop.refresh_from_db()
        assert prop.verification_status == "submitted"

    def test_staff_cannot_submit(self, owner: Actor, staff: Actor) -> None:
        prop = make_property(owner.organization)
        submit = url("property", prop.pk, "submit-verification")
        assert staff.client.post(submit, {}, format="json").status_code == 403
