"""Mobile codes at sign-up, the lock on business screens, and the SMS gateways.

No gateway is ever called for real: `sms._request` or `send_code` is replaced."""

import datetime as dt
from typing import Any

import pytest
from django.test import override_settings
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.verification import services, sms
from apps.verification.models import PhoneCode, SmsGateway, SmsLog
from core.tests.support import Actor, make_platform_user, make_user

REGISTER = reverse("v1:auth-register")
SEND = reverse("v1:mobile-send-code")
CONFIRM = reverse("v1:mobile-confirm")
STATUS = reverse("v1:mobile-status")
GATEWAYS = reverse("v1:platform-sms-gateway-list")


@pytest.fixture(autouse=True)
def fixed_code() -> Any:
    with override_settings(DEBUG=True, SMS_TEST_CODE="246810"):
        yield


def sign_up(anon: APIClient, phone: str = "9845012345") -> APIClient:
    response = anon.post(
        REGISTER,
        {
            "full_name": "Asha Rao",
            "email": f"asha{phone}@example.com",
            "password": "Str0ng-Passphrase!",
            "phone": phone,
            "organization_name": "Asha PG",
        },
    )
    assert response.status_code == 201, response.json()
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {response.json()['access']}")
    return client


def age_codes(seconds: int = 61) -> None:
    PhoneCode.objects.update(created_at=timezone.now() - dt.timedelta(seconds=seconds))


class TestSignUp:
    def test_sends_a_code_and_locks_business_screens(self, anon: APIClient) -> None:
        client = sign_up(anon)
        row = PhoneCode.objects.get()
        assert row.code_hash == services.hash_code("246810")
        assert row.code_hash != "246810"
        me = client.get(reverse("v1:auth-me")).json()
        assert me["phone"] == "9845012345" and me["phone_verified"] is False
        blocked = client.get(reverse("v1:property-list"))
        assert blocked.status_code == 403
        assert blocked.json()["error"]["code"] == "phone_not_verified"
        assert SmsLog.objects.get().gateway == "console"

    def test_right_code_opens_the_app(self, anon: APIClient) -> None:
        client = sign_up(anon)
        response = client.post(CONFIRM, {"code": "246810"})
        assert response.status_code == 200, response.json()
        assert response.json()["phone_verified"] is True
        assert client.get(reverse("v1:property-list")).status_code == 200

    def test_mobile_is_required_and_unique(self, anon: APIClient) -> None:
        sign_up(anon)
        response = anon.post(
            REGISTER,
            {
                "full_name": "B",
                "email": "b@example.com",
                "password": "Str0ng-Passphrase!",
                "phone": "+91 98450 12345",
                "organization_name": "B PG",
            },
        )
        assert response.status_code == 400
        assert "already exists" in str(response.json()["error"]["fields"]["phone"])

    def test_sign_up_still_works_when_sms_fails(self, anon: APIClient) -> None:
        SmsGateway.objects.update(is_enabled=False)
        client = sign_up(anon)
        assert client.get(STATUS).json()["phone_verified"] is False


class TestCodes:
    # A real transaction, as on the server: the error answer must not undo the counted try.
    @pytest.mark.django_db(transaction=True)
    def test_wrong_code_counts_down_then_stops(self, anon: APIClient) -> None:
        client = sign_up(anon)
        first = client.post(CONFIRM, {"code": "111111"})
        assert first.status_code == 400
        assert first.json()["error"]["fields"]["code"] == "That code is not right. 4 tries left."
        for _ in range(4):
            last = client.post(CONFIRM, {"code": "111111"})
        assert "Too many wrong tries" in str(last.json()["error"]["fields"])
        assert client.post(CONFIRM, {"code": "246810"}).status_code == 400

    def test_expired_code(self, anon: APIClient) -> None:
        client = sign_up(anon)
        PhoneCode.objects.update(expires_at=timezone.now() - dt.timedelta(seconds=1))
        response = client.post(CONFIRM, {"code": "246810"})
        assert "expired" in str(response.json()["error"]["fields"])

    def test_resend_waits_60_seconds_and_cancels_the_old_code(self, anon: APIClient) -> None:
        client = sign_up(anon)
        too_soon = client.post(SEND, {})
        assert too_soon.status_code == 429
        assert "Wait" in too_soon.json()["error"]["message"]
        age_codes()
        assert client.post(SEND, {}).status_code == 200
        assert PhoneCode.objects.filter(cancelled=True).count() == 1

    def test_five_codes_a_day_per_number(self, anon: APIClient) -> None:
        client = sign_up(anon)
        for _ in range(4):
            age_codes()
            assert client.post(SEND, {}).status_code == 200
        age_codes()
        response = client.post(SEND, {})
        assert response.status_code == 429
        assert "today" in response.json()["error"]["message"]

    def test_change_number_before_confirming(self, anon: APIClient) -> None:
        client = sign_up(anon)
        age_codes()
        sent = client.post(SEND, {"phone": "9900011122"})
        assert sent.json() == {"phone_masked": "99xxxxx122", "resend_in": 60}
        client.post(CONFIRM, {"code": "246810"})
        assert User.objects.get(email="asha9845012345@example.com").phone == "9900011122"

    def test_number_of_another_confirmed_account_is_refused(self, anon: APIClient) -> None:
        make_user(phone="9900011122")
        client = sign_up(anon)
        age_codes()
        response = client.post(SEND, {"phone": "9900011122"})
        assert response.status_code == 400
        assert "already in use" in str(response.json()["error"]["fields"])

    def test_bad_code_format(self, anon: APIClient) -> None:
        client = sign_up(anon)
        response = client.post(CONFIRM, {"code": "12ab"})
        assert response.json()["error"]["fields"]["code"] == ["Enter the 6-digit code."]

    def test_needs_sign_in(self, anon: APIClient) -> None:
        assert anon.post(SEND, {}).status_code == 401


class TestGateways:
    def test_fallback_to_the_next_gateway(self, monkeypatch: pytest.MonkeyPatch) -> None:
        sent: list[str] = []

        def fail(phone: str, code: str) -> str:
            raise sms.SmsError("Refused (401). Invalid key")

        def ok(phone: str, code: str) -> str:
            sent.append(code)
            return "req-1"

        monkeypatch.setattr(sms.GATEWAYS["twofactor"], "send_code", fail)
        monkeypatch.setattr(sms.GATEWAYS["twofactor"], "configured", lambda: True)
        monkeypatch.setattr(sms.GATEWAYS["fast2sms"], "send_code", ok)
        monkeypatch.setattr(sms.GATEWAYS["fast2sms"], "configured", lambda: True)
        SmsGateway.objects.filter(code="console").update(is_enabled=False)
        SmsGateway.objects.exclude(code="console").update(is_enabled=True)
        assert services.deliver("9845012345", "123456") == "fast2sms"
        assert sent == ["123456"]
        logs = list(SmsLog.objects.order_by("created_at").values_list("gateway", "ok"))
        assert logs == [("twofactor", False), ("fast2sms", True)]
        assert SmsGateway.objects.get(code="twofactor").last_error.startswith("Refused (401)")

    def test_all_fail(self) -> None:
        SmsGateway.objects.update(is_enabled=False)
        with pytest.raises(services.SmsNotSent):
            services.deliver("9845012345", "123456")

    def test_test_gateway_is_off_on_the_live_server(self) -> None:
        with override_settings(DEBUG=False):
            assert not sms.get("console").configured()
            assert services.make_code() != "246810"  # random; the fixed code needs DEBUG

    @override_settings(TWOFACTOR_API_KEY="k/1", TWOFACTOR_TEMPLATE="PGLOGIN")
    def test_twofactor_request(self, monkeypatch: pytest.MonkeyPatch) -> None:
        seen: list[tuple[str, str]] = []

        def fake(
            method: str, url: str, headers: dict[str, str], body: Any = None
        ) -> dict[str, Any]:
            seen.append((method, url))
            return {"Status": "Success", "Details": "sess-9"}

        monkeypatch.setattr(sms, "_request", fake)
        assert sms.get("twofactor").send_code("9845012345", "123456") == "sess-9"
        assert seen == [("GET", "https://2factor.in/API/V1/k%2F1/SMS/919845012345/123456/PGLOGIN")]

    @override_settings(APITXT_AUTH_KEY="apitxt-key-123", APITXT_TEMPLATE_ID="42")
    def test_apitxt_request(self, monkeypatch: pytest.MonkeyPatch) -> None:
        seen: list[tuple[str, str, Any, bool]] = []

        def fake(
            method: str, url: str, headers: dict[str, str], body: Any = None, form: bool = False
        ) -> dict[str, Any]:
            seen.append((method, url, body, form))
            return {
                "status": "success",
                "message": "Sms OTP Sent Successfully",
                "data": {"request_id": "SMS-OTP-A1B2C3D4", "mobile": "919845012345"},
            }

        monkeypatch.setattr(sms, "_request", fake)
        assert sms.get("apitxt").send_code("9845012345", "123456") == "SMS-OTP-A1B2C3D4"
        assert seen == [
            (
                "POST",
                "https://apitxt.com/api/sendOTP",
                {
                    "authkey": "apitxt-key-123",
                    "mobile": "919845012345",
                    "otp": "123456",
                    "channel": "sms",
                    "country": "91",
                    "template_id": "42",
                },
                True,
            )
        ]

    @override_settings(APITXT_AUTH_KEY="apitxt-key-123")
    def test_apitxt_refusal_and_default_order(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setattr(
            sms, "_request", lambda *a, **k: {"status": "error", "message": "Invalid Auth Key"}
        )
        with pytest.raises(sms.SmsError, match="Invalid Auth Key"):
            sms.get("apitxt").send_code("9845012345", "123456")
        # Default line-up: APITxT first, so with its key set it sends before anything else.
        monkeypatch.setattr(sms.GATEWAYS["apitxt"], "send_code", lambda p, c: "SMS-OTP-1")
        assert services.deliver("9845012345", "123456") == "apitxt"

    @override_settings(APITXT_TEMPLATE_ID="Your OTP is {otp}")
    def test_apitxt_warns_about_message_text(self) -> None:
        assert any("number" in w for w in sms.get("apitxt").warnings())

    @override_settings(TWOFACTOR_API_KEY="k")
    def test_twofactor_refusal(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setattr(
            sms, "_request", lambda *a, **k: {"Status": "Error", "Details": "Invalid API Key"}
        )
        with pytest.raises(sms.SmsError, match="Invalid API Key"):
            sms.get("twofactor").send_code("9845012345", "123456")

    @override_settings(
        FAST2SMS_API_KEY="f-key", FAST2SMS_SENDER_ID="PGMNGR", FAST2SMS_MESSAGE_ID="171"
    )
    def test_fast2sms_dlt_route(self, monkeypatch: pytest.MonkeyPatch) -> None:
        seen: list[Any] = []

        def fake(
            method: str, url: str, headers: dict[str, str], body: Any = None
        ) -> dict[str, Any]:
            seen.append((url, headers, body))
            return {"return": True, "request_id": "r-7", "message": ["Message sent successfully"]}

        monkeypatch.setattr(sms, "_request", fake)
        assert sms.get("fast2sms").send_code("9845012345", "123456") == "r-7"
        url, headers, body = seen[0]
        assert url == "https://www.fast2sms.com/dev/bulkV2"
        assert headers == {"Authorization": "f-key"}
        assert body == {
            "route": "dlt",
            "sender_id": "PGMNGR",
            "message": "171",
            "variables_values": "123456",
            "numbers": "9845012345",
        }

    @override_settings(FAST2SMS_API_KEY="f-key", FAST2SMS_OTP_ID="otp-1")
    def test_fast2sms_otp_route(self, monkeypatch: pytest.MonkeyPatch) -> None:
        seen: list[Any] = []

        def fake(
            method: str, url: str, headers: dict[str, str], body: Any = None
        ) -> dict[str, Any]:
            seen.append((url, body))
            return {"return": True, "request_id": "r-8"}

        monkeypatch.setattr(sms, "_request", fake)
        sms.get("fast2sms").send_code("9845012345", "123456")
        assert seen[0][0] == "https://www.fast2sms.com/dev/otp/send"
        assert seen[0][1]["otp"] == "123456" and seen[0][1]["otp_id"] == "otp-1"

    @override_settings(FAST2SMS_API_KEY="f-key")
    def test_fast2sms_needs_a_template(self) -> None:
        gateway = sms.get("fast2sms")
        assert not gateway.configured()
        assert "FAST2SMS_OTP_ID" in gateway.unavailable_reason()


class TestPlatformPage:
    def admin(self) -> APIClient:
        client = APIClient()
        client.force_authenticate(make_platform_user())
        return client

    def test_list_shows_what_each_gateway_needs(self) -> None:
        rows = {g["code"]: g for g in self.admin().get(GATEWAYS).json()}
        assert [r for r in rows] == ["apitxt", "console", "twofactor", "fast2sms"]
        # APITxT is the default: first and switched on, but sends nothing until its key is set.
        assert rows["apitxt"]["is_enabled"] is True
        assert rows["apitxt"]["configured"] is False
        assert rows["console"]["configured"] is True
        two = rows["twofactor"]
        assert two["configured"] is False
        assert two["settings_needed"][0] == {
            "env": "TWOFACTOR_API_KEY",
            "label": "API key",
            "required": True,
            "secret": True,
            "hint": "2Factor dashboard, API key",
            "is_set": False,
            "set_in": "",
            "display": "",
        }
        assert "TWOFACTOR_API_KEY" in two["unavailable_reason"]

    @override_settings(TWOFACTOR_API_KEY="secret-key-123")
    def test_keys_are_never_returned(self) -> None:
        body = str(self.admin().get(GATEWAYS).json())
        assert "secret-key-123" not in body

    def test_cannot_switch_on_without_keys(self) -> None:
        response = self.admin().patch(
            reverse("v1:platform-sms-gateway-detail", args=["fast2sms"]),
            {"is_enabled": True},
            format="json",
        )
        assert response.status_code == 400

    @override_settings(TWOFACTOR_API_KEY="k")
    def test_switch_on_and_reorder(self) -> None:
        admin = self.admin()
        url = reverse("v1:platform-sms-gateway-detail", args=["twofactor"])
        response = admin.patch(url, {"is_enabled": True, "position": 0}, format="json")
        assert response.status_code == 200, response.json()
        assert SmsGateway.objects.get(code="twofactor").is_enabled

    def test_test_send_reports_the_gateway_reply(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setattr(sms.GATEWAYS["console"], "send_code", lambda p, c: "console")
        response = self.admin().post(
            reverse("v1:platform-sms-gateway-test", args=["console"]), {"phone": "9845012345"}
        )
        assert response.json() == {"ok": True, "reply_id": "console", "error": ""}
        log = self.admin().get(reverse("v1:platform-sms-log-list")).json()["results"][0]
        assert (log["phone_masked"], log["is_test"]) == ("98xxxxx345", True)

    def test_owners_cannot_open_it(self, owner: Actor) -> None:
        assert owner.client.get(GATEWAYS).status_code == 403


class TestPortalKeys:
    def admin(self) -> APIClient:
        client = APIClient()
        client.force_authenticate(make_platform_user())
        return client

    def url(self, code: str = "twofactor") -> str:
        return reverse("v1:platform-sms-gateway-detail", args=[code])

    def test_typed_key_is_encrypted_and_wins_over_env(self) -> None:
        admin = self.admin()
        with override_settings(TWOFACTOR_API_KEY="env-key-0000"):
            response = admin.patch(
                self.url(),
                {"set_credentials": {"TWOFACTOR_API_KEY": "portal-key-123456"}, "is_enabled": True},
                format="json",
            )
            assert response.status_code == 200, response.json()
            row = SmsGateway.objects.get(code="twofactor")
            assert "portal-key" not in row.credentials  # stored encrypted
            assert sms.get("twofactor")._value("TWOFACTOR_API_KEY") == "portal-key-123456"
            field = response.json()["settings_needed"][0]
            assert (field["set_in"], field["display"]) == (
                "portal",
                "ending \u20263456 (17 characters)",
            )
            assert "portal-key-123456" not in str(response.json())
            # An empty value removes the typed key; the .env one is used again.
            admin.patch(self.url(), {"set_credentials": {"TWOFACTOR_API_KEY": ""}}, format="json")
            assert sms.get("twofactor").source("TWOFACTOR_API_KEY") == "env"

    def test_switch_on_after_typing_keys(self) -> None:
        response = self.admin().patch(
            self.url("fast2sms"),
            {
                "set_credentials": {"FAST2SMS_API_KEY": "f" * 40, "FAST2SMS_OTP_ID": "1234"},
                "is_enabled": True,
            },
            format="json",
        )
        assert response.status_code == 200, response.json()
        assert response.json()["configured"] is True

    def test_unknown_setting_is_refused(self) -> None:
        response = self.admin().patch(
            self.url(), {"set_credentials": {"FAST2SMS_API_KEY": "x"}}, format="json"
        )
        assert response.status_code == 400

    @override_settings(
        TWOFACTOR_API_KEY="abc", TWOFACTOR_TEMPLATE="Your OTP for PG Manager is XXXX"
    )
    def test_warnings_for_placeholder_key_and_message_text(self) -> None:
        warnings = sms.get("twofactor").warnings()
        assert any("placeholder" in w for w in warnings)
        assert any("message text" in w for w in warnings)

    @override_settings(TWOFACTOR_API_KEY="real-key-123456")
    def test_test_gateway_is_skipped_when_a_real_one_is_on(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setattr(sms.GATEWAYS["twofactor"], "send_code", lambda p, c: "sess-1")
        SmsGateway.objects.filter(code="twofactor").update(is_enabled=True)
        assert services.deliver("9845012345", "123456") == "twofactor"

    def test_secret_box_round_trip(self) -> None:
        from core.secret_box import seal, unseal

        token = seal({"A": "1"})
        assert unseal(token) == {"A": "1"}
        assert unseal("not-a-token") == {}
        assert seal({}) == ""
