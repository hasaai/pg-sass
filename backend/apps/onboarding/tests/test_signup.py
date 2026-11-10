"""Owner sign-up by mobile, consent, profile and email confirmation.

No SMS is sent for real: the code is fixed with SMS_TEST_CODE (DEBUG) and the console
gateway only prints it."""

from __future__ import annotations

import re
from typing import Any

import pytest
from django.core import mail, signing
from django.test import override_settings
from django.urls import reverse
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.onboarding import services
from apps.onboarding.models import ConsentRecord
from apps.organizations.models import Membership
from apps.verification.models import PhoneCode
from core.tests.support import Actor, make_user

START = reverse("v1:signup-start")
FINISH = reverse("v1:signup-finish")
PROFILE = reverse("v1:onboarding-profile")
LOGIN_START = reverse("v1:login-mobile-start")
LOGIN_FINISH = reverse("v1:login-mobile-finish")
CODE = "246810"
AGREED = {"accept_terms": True, "accept_privacy": True}

pytestmark = pytest.mark.django_db(transaction=True)  # wrong tries must survive the error


SENT: list[tuple[str, str]] = []


@pytest.fixture(autouse=True)
def fixed_code(monkeypatch: pytest.MonkeyPatch) -> Any:
    """Fixed code, and delivery recorded instead of calling a gateway."""
    from apps.verification import services as codes

    SENT.clear()

    def record(phone: str, code: str) -> str:
        SENT.append((phone, code))
        return "test"

    monkeypatch.setattr(codes, "deliver", record)
    with override_settings(DEBUG=True, SMS_TEST_CODE=CODE):
        yield


def sign_up(client: APIClient, phone: str = "9845012345", **extra: Any) -> Any:
    assert client.post(START, {"phone": phone, **AGREED}, format="json").status_code == 200
    return client.post(FINISH, {"phone": phone, "code": CODE, **AGREED, **extra}, format="json")


def signed_in(response: Any) -> APIClient:
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {response.json()['access']}")
    return client


class TestStart:
    def test_terms_and_privacy_are_required(self, anon: APIClient) -> None:
        response = anon.post(START, {"phone": "9845012345"}, format="json")
        assert response.status_code == 400
        fields = response.json()["error"]["fields"]
        assert set(fields) == {"accept_terms", "accept_privacy"}
        assert not PhoneCode.objects.exists()

    def test_sends_a_code_without_making_an_account(self, anon: APIClient) -> None:
        response = anon.post(START, {"phone": "98450 12345", **AGREED}, format="json")
        assert response.json() == {"phone_masked": "98xxxxx345", "resend_in": 60}
        assert PhoneCode.objects.get().user is None
        assert not User.objects.exists()
        assert SENT == [("9845012345", CODE)]

    def test_same_answer_for_a_number_already_in_use(self, anon: APIClient) -> None:
        make_user(phone="9845012345")
        response = anon.post(START, {"phone": "9845012345", **AGREED}, format="json")
        assert response.json() == {"phone_masked": "98xxxxx345", "resend_in": 60}

    def test_bad_number_and_resend_wait(self, anon: APIClient) -> None:
        bad = anon.post(START, {"phone": "12345", **AGREED}, format="json")
        assert bad.status_code == 400
        anon.post(START, {"phone": "9845012345", **AGREED}, format="json")
        again = anon.post(START, {"phone": "9845012345", **AGREED}, format="json")
        assert again.status_code == 429


class TestFinish:
    def test_right_code_makes_the_account_and_records_consent(self, anon: APIClient) -> None:
        response = sign_up(anon, marketing=True)
        assert response.status_code == 201
        user = User.objects.get(phone="9845012345")
        assert user.phone_verified_at is not None
        assert user.email is None and user.full_name == ""
        assert response.json()["user"]["memberships"] == []
        kinds = {(c.kind, c.accepted, c.version) for c in ConsentRecord.objects.all()}
        assert kinds == {
            ("terms", True, "2026-11-draft"),
            ("privacy", True, "2026-11-draft"),
            ("marketing", True, ""),
        }
        assert {c.ip_address for c in ConsentRecord.objects.all()} == {"127.0.0.1"}

    def test_wrong_code_counts_down_and_makes_nothing(self, anon: APIClient) -> None:
        anon.post(START, {"phone": "9845012345", **AGREED}, format="json")
        wrong = anon.post(
            FINISH, {"phone": "9845012345", "code": "111111", **AGREED}, format="json"
        )
        assert wrong.json()["error"]["fields"]["code"] == "That code is not right. 4 tries left."
        assert not User.objects.exists()

    def test_code_cannot_be_used_twice(self, anon: APIClient) -> None:
        assert sign_up(anon).status_code == 201
        again = anon.post(FINISH, {"phone": "9845012345", "code": CODE, **AGREED}, format="json")
        assert again.status_code == 400

    def test_existing_account_is_signed_in_not_duplicated(
        self, anon: APIClient, owner: Actor
    ) -> None:
        owner.user.phone = "9845012345"
        owner.user.save()
        response = sign_up(anon)
        assert response.status_code == 200
        assert User.objects.filter(phone="9845012345").count() == 1
        assert response.json()["user"]["id"] == str(owner.user.pk)

    def test_switched_off_account_cannot_sign_in(self, anon: APIClient) -> None:
        make_user(phone="9845012345", is_active=False)
        response = sign_up(anon)
        assert response.status_code == 403
        assert response.json()["error"]["code"] == "account_inactive"


class TestProfile:
    def test_profile_makes_the_business_and_emails_a_link(self, anon: APIClient) -> None:
        client = signed_in(sign_up(anon))
        response = client.put(
            PROFILE,
            {"full_name": "Asha Rao", "email": "Asha@Example.com", "business_name": ""},
            format="json",
        )
        assert response.status_code == 200, response.json()
        body = response.json()
        assert body["email"] == "asha@example.com"
        assert body["email_verified"] is False
        [membership] = body["memberships"]
        assert membership["role"] == "owner"
        assert membership["organization"]["name"] == "Asha Rao's PG"
        assert len(mail.outbox) == 1
        assert "/confirm-email?token=" in mail.outbox[0].body

    def test_business_name_and_marketing_change(self, anon: APIClient) -> None:
        client = signed_in(sign_up(anon))
        client.put(
            PROFILE,
            {"full_name": "Asha", "email": "a@example.com", "business_name": "Lotus Stays"},
            format="json",
        )
        assert Membership.objects.get().organization.name == "Lotus Stays"
        client.put(
            PROFILE,
            {"full_name": "Asha", "email": "a@example.com", "marketing": True},
            format="json",
        )
        assert client.get(PROFILE).json()["marketing"] is True
        assert Membership.objects.count() == 1  # saving again never makes a second business
        assert len(mail.outbox) == 1  # same email: no new link

    def test_name_and_email_are_needed_and_email_unique(self, anon: APIClient) -> None:
        make_user(email="taken@example.com", phone="9000000001")
        client = signed_in(sign_up(anon))
        missing = client.put(PROFILE, {"full_name": " ", "email": ""}, format="json")
        assert missing.status_code == 400
        taken = client.put(
            PROFILE, {"full_name": "Asha", "email": "taken@example.com"}, format="json"
        )
        assert "Another account uses this email" in taken.json()["error"]["fields"]["email"]

    def test_needs_sign_in(self, anon: APIClient) -> None:
        assert anon.get(PROFILE).status_code == 401


class TestEmail:
    def _owner(self, anon: APIClient) -> tuple[APIClient, User]:
        client = signed_in(sign_up(anon))
        client.put(PROFILE, {"full_name": "Asha", "email": "a@example.com"}, format="json")
        return client, User.objects.get(phone="9845012345")

    def test_link_confirms_once(self, anon: APIClient) -> None:
        client, user = self._owner(anon)
        found = re.search(r"token=(\S+)", str(mail.outbox[0].body))
        assert found is not None
        token = found.group(1)
        ok = anon.post(reverse("v1:email-confirm"), {"token": token}, format="json")
        assert ok.status_code == 200
        user.refresh_from_db()
        assert user.email_verified_at is not None
        # A confirmed email gets no more links
        assert client.post(reverse("v1:email-send")).json() == {"sent": False}

    def test_tampered_expired_and_old_email_links(self, anon: APIClient) -> None:
        client, user = self._owner(anon)
        bad = anon.post(reverse("v1:email-confirm"), {"token": "nope"}, format="json")
        assert bad.status_code == 400
        old_link = services.email_link(user)
        client.put(PROFILE, {"full_name": "Asha", "email": "new@example.com"}, format="json")
        old = anon.post(
            reverse("v1:email-confirm"), {"token": old_link.split("token=")[1]}, format="json"
        )
        assert "changed" in old.json()["error"]["fields"]["token"]
        with override_settings(EMAIL_LINK_HOURS=0):
            token = signing.dumps(
                {"u": str(user.pk), "e": "new@example.com"}, salt=services.EMAIL_SALT
            )
            import time

            time.sleep(1)
            expired = anon.post(reverse("v1:email-confirm"), {"token": token}, format="json")
        assert "expired" in expired.json()["error"]["fields"]["token"]

    def test_unconfirmed_email_never_blocks_the_app(self, anon: APIClient) -> None:
        client, _ = self._owner(anon)
        for name in ("v1:property-list", "v1:tenant-list", "v1:report-dashboard"):
            assert client.get(reverse(name)).status_code == 200, name


class TestMobileLogin:
    def test_signs_in_with_a_code(self, anon: APIClient, owner: Actor) -> None:
        owner.user.phone = "9845012345"
        owner.user.save()
        start = anon.post(LOGIN_START, {"phone": "9845012345"}, format="json")
        assert start.status_code == 200
        response = anon.post(LOGIN_FINISH, {"phone": "9845012345", "code": CODE}, format="json")
        assert response.status_code == 200
        assert response.json()["user"]["id"] == str(owner.user.pk)

    def test_unknown_number_gets_the_same_answer_and_no_sms(self, anon: APIClient) -> None:
        start = anon.post(LOGIN_START, {"phone": "9845099999"}, format="json")
        assert start.json() == {"phone_masked": "98xxxxx999", "resend_in": 60}
        assert not PhoneCode.objects.exists()
        assert SENT == []
        finish = anon.post(LOGIN_FINISH, {"phone": "9845099999", "code": CODE}, format="json")
        assert finish.status_code == 400
