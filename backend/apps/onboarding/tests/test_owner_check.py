"""Owner identity check, owner side: fill in, upload, send. It never blocks the app."""

from __future__ import annotations

from typing import Any

from django.core.files.uploadedfile import SimpleUploadedFile
from django.urls import reverse

from apps.onboarding.models import OwnerDocument, OwnerVerification
from core.models import AuditLog
from core.tests.support import Actor, pdf_file, png_file

CHECK = reverse("v1:owner-check")
SUBMIT = reverse("v1:owner-check-submit")
DOCS = reverse("v1:owner-check-documents")


def upload(actor: Actor, kind: str = "id_front", file: Any = None) -> Any:
    return actor.client.post(DOCS, {"kind": kind, "file": file or png_file()}, format="multipart")


def fill(actor: Actor) -> None:
    actor.client.patch(
        CHECK, {"id_type": "pan", "id_last4": "234f", "name_on_id": "Asha Rao"}, format="json"
    )
    assert upload(actor).status_code == 201


class TestOwnerSide:
    def test_starts_empty_and_lists_what_is_missing(self, owner: Actor) -> None:
        body = owner.client.get(CHECK).json()
        assert body["status"] == "not_started"
        assert body["can_edit"] is True
        assert len(body["missing"]) == 4

    def test_fill_upload_and_send(self, owner: Actor) -> None:
        fill(owner)
        body = owner.client.get(CHECK).json()
        assert body["status"] == "draft"
        assert body["id_last4"] == "234F"
        assert body["missing"] == []
        assert body["documents"][0]["kind"] == "id_front"
        sent = owner.client.post(SUBMIT)
        assert sent.status_code == 200
        assert sent.json()["status"] == "submitted"
        assert sent.json()["status_label"] == "Sent for checking"
        assert sent.json()["events"][0]["status"] == "submitted"
        assert AuditLog.objects.filter(action="owner_check.submitted").exists()

    def test_cannot_send_until_complete(self, owner: Actor) -> None:
        response = owner.client.post(SUBMIT)
        assert response.status_code == 409
        assert response.json()["error"]["code"] == "owner_check_incomplete"

    def test_last4_must_be_four_characters(self, owner: Actor) -> None:
        bad = owner.client.patch(CHECK, {"id_last4": "12"}, format="json")
        assert bad.status_code == 400
        bad_type = owner.client.patch(CHECK, {"id_type": "aadhaar_full"}, format="json")
        assert bad_type.status_code == 400

    def test_bad_file_is_refused(self, owner: Actor) -> None:
        fake = SimpleUploadedFile("id.png", b"not an image", content_type="image/png")
        assert upload(owner, file=fake).status_code == 400
        assert not OwnerDocument.objects.exists()

    def test_pdf_is_accepted_and_downloaded_with_audit(self, owner: Actor) -> None:
        doc = upload(owner, "business_registration", pdf_file()).json()
        url = reverse("v1:owner-check-document-download", args=[doc["id"]])
        response = owner.client.get(url)
        assert response.status_code == 200
        assert AuditLog.objects.filter(action="owner_check.document_downloaded").exists()

    def test_locked_after_sending(self, owner: Actor) -> None:
        fill(owner)
        owner.client.post(SUBMIT)
        doc_id = OwnerDocument.objects.get().pk
        assert owner.client.patch(CHECK, {"name_on_id": "X"}, format="json").status_code == 409
        assert upload(owner).status_code == 409
        url = reverse("v1:owner-check-document", args=[doc_id])
        assert owner.client.delete(url).status_code == 409
        assert owner.client.post(SUBMIT).status_code == 409

    def test_more_info_can_be_edited_and_sent_again(self, owner: Actor) -> None:
        fill(owner)
        owner.client.post(SUBMIT)
        OwnerVerification.objects.update(status="more_info", reviewer_note="Photo is blurred")
        assert owner.client.get(CHECK).json()["reviewer_note"] == "Photo is blurred"
        assert upload(owner, "id_back").status_code == 201
        again = owner.client.post(SUBMIT).json()
        assert again["status"] == "submitted" and again["reviewer_note"] == ""

    def test_remove_file(self, owner: Actor) -> None:
        doc = upload(owner).json()
        url = reverse("v1:owner-check-document", args=[doc["id"]])
        assert owner.client.delete(url).status_code == 204
        assert not OwnerDocument.objects.exists()

    def test_file_limit(self, owner: Actor) -> None:
        for _ in range(6):
            assert upload(owner, "other").status_code == 201
        assert upload(owner, "other").status_code == 409


class TestAccess:
    def test_only_the_owner(self, manager: Actor, staff: Actor) -> None:
        for actor in (manager, staff):
            assert actor.client.get(CHECK).status_code == 403
            assert upload(actor).status_code == 403
            assert actor.client.post(SUBMIT).status_code == 403

    def test_another_business_cannot_see_files(self, owner: Actor, outsider: Actor) -> None:
        doc = upload(owner).json()
        for name in ("v1:owner-check-document", "v1:owner-check-document-download"):
            url = reverse(name, args=[doc["id"]])
            method = outsider.client.delete if name.endswith("document") else outsider.client.get
            assert method(url).status_code == 404
        assert outsider.client.get(CHECK).json()["documents"] == []

    def test_not_verified_never_blocks_the_app(self, owner: Actor) -> None:
        fill(owner)
        owner.client.post(SUBMIT)
        for name in ("v1:property-list", "v1:tenant-list", "v1:report-dashboard"):
            assert owner.client.get(reverse(name)).status_code == 200, name
