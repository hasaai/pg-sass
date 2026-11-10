import datetime as dt

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from django.urls import reverse

from apps.organizations.models import Role
from apps.tenants.models import Stay
from core.tests.support import (
    Actor,
    make_actor,
    make_property,
    make_room,
    make_stay,
    make_tenant,
    pdf_file,
    png_file,
)


@pytest.fixture
def stay(owner: Actor) -> Stay:
    bed = make_room(make_property(owner.organization)).beds.first()
    return make_stay(owner, bed, make_tenant(owner.organization), dt.date(2026, 10, 1))


def test_check_in_with_terms(owner: Actor) -> None:
    bed = make_room(make_property(owner.organization)).beds.first()
    tenant = make_tenant(owner.organization)
    body = owner.client.post(
        reverse("v1:stay-list"),
        {
            "tenant": str(tenant.pk),
            "bed": str(bed.pk),
            "check_in": "2026-10-01",
            "notice_period_days": 15,
            "lock_in_months": 3,
            "agreement_end": "2027-09-30",
        },
    ).json()
    assert (body["notice_period_days"], body["lock_in_months"], body["agreement_end"]) == (
        15,
        3,
        "2027-09-30",
    )


def test_update_terms(owner: Actor, stay: Stay) -> None:
    url = reverse("v1:stay-terms", args=[stay.pk])
    assert owner.client.post(url, {"notice_period_days": 60}).json()["notice_period_days"] == 60
    assert owner.client.post(url, {"lock_in_months": 99}).status_code == 400


def test_upload_and_download_agreement(owner: Actor, stay: Stay) -> None:
    url = reverse("v1:stay-agreement", args=[stay.pk])
    assert owner.client.get(url).status_code == 404
    response = owner.client.post(url, {"file": pdf_file()}, format="multipart")
    assert response.status_code == 200, response.json()
    assert response.json()["has_agreement_file"] is True
    stay.refresh_from_db()
    assert stay.agreement_file.name.startswith(f"private/agreements/{stay.organization_id}/")
    download = owner.client.get(url)
    assert download.status_code == 200
    body = b"".join(download.streaming_content)  # type: ignore[attr-defined]
    assert body.startswith(b"%PDF")
    assert "attachment" in download["Content-Disposition"]
    # replacing it keeps one file
    old = stay.agreement_file.path
    owner.client.post(url, {"file": png_file("scan.png")}, format="multipart")
    import os

    assert not os.path.exists(old)


def test_rejects_other_file_types(owner: Actor, stay: Stay) -> None:
    url = reverse("v1:stay-agreement", args=[stay.pk])
    exe = SimpleUploadedFile("agreement.pdf", b"MZ\x90\x00 not a pdf", "application/pdf")
    response = owner.client.post(url, {"file": exe}, format="multipart")
    assert response.status_code == 400


def test_agreement_is_private(owner: Actor, outsider: Actor, stay: Stay) -> None:
    url = reverse("v1:stay-agreement", args=[stay.pk])
    owner.client.post(url, {"file": pdf_file()}, format="multipart")
    staff = make_actor(Role.STAFF, organization=owner.organization)
    assert staff.client.get(url).status_code == 403
    assert outsider.client.get(url).status_code == 404
    assert outsider.client.post(url, {"file": pdf_file()}, format="multipart").status_code == 404
    stay.refresh_from_db()
    # never served by the development media route
    from django.test import Client

    assert Client().get(f"/media/{stay.agreement_file.name}").status_code == 404
