"""Paying for a plan online: Razorpay and Cashfree (test mode), never calling them for real."""

import base64
import hashlib
import hmac
import json
from typing import Any

import pytest
from django.test import override_settings
from django.urls import reverse
from django.utils import timezone

from apps.organizations.models import Role
from apps.subscriptions import gateways, services
from apps.subscriptions.models import PaymentGateway, PlanPayment, Subscription, SubscriptionEvent
from core.tests.support import Actor, make_actor, make_platform_user

KEYS = {
    "RAZORPAY_KEY_ID": "rzp_test_abc",
    "RAZORPAY_KEY_SECRET": "rzp-secret",
    "RAZORPAY_WEBHOOK_SECRET": "rzp-hook",
    "CASHFREE_APP_ID": "cf-app",
    "CASHFREE_SECRET_KEY": "cf-secret",
    "CASHFREE_ENV": "sandbox",
}
CHECKOUT = reverse("v1:plan-checkout")
CONFIRM = reverse("v1:plan-confirm")


@pytest.fixture(autouse=True)
def gateway_keys() -> Any:
    with override_settings(**KEYS):
        yield


@pytest.fixture
def calls(monkeypatch: pytest.MonkeyPatch) -> list[tuple[str, str, dict[str, Any] | None]]:
    seen: list[tuple[str, str, dict[str, Any] | None]] = []

    def fake(method: str, url: str, headers: dict[str, str], body: Any = None) -> dict[str, Any]:
        seen.append((method, url, body))
        if "razorpay" in url:
            return {"id": "order_RZP1", "amount": body["amount"]}
        if method == "POST":
            return {"payment_session_id": "session_CF1", "order_id": body["order_id"]}
        return {"order_status": "PAID", "cf_order_id": 777}

    monkeypatch.setattr(gateways, "_request", fake)
    return seen


def rzp_signature(order_id: str, payment_id: str) -> str:
    return hmac.new(b"rzp-secret", f"{order_id}|{payment_id}".encode(), hashlib.sha256).hexdigest()


def start(
    owner: Actor, gateway: str = "razorpay", plan: str = "basic", period: str = "month"
) -> dict:
    response = owner.client.post(CHECKOUT, {"plan": plan, "period": period, "gateway": gateway})
    assert response.status_code == 201, response.json()
    return response.json()


class TestRazorpay:
    def test_checkout_creates_an_order_in_paise(self, owner: Actor, calls: list) -> None:
        body = start(owner)
        assert body["payment"]["amount"] == 49900
        assert body["payment"]["status"] == "created"
        assert body["payment"]["test_mode"] is True
        assert body["checkout"]["key_id"] == "rzp_test_abc"
        assert body["checkout"]["order_id"] == "order_RZP1"
        assert calls[0][2]["amount"] == 49900

    def test_good_signature_starts_the_plan(self, owner: Actor, calls: list) -> None:
        body = start(owner, period="year")
        response = owner.client.post(
            CONFIRM,
            {
                "payment": body["payment"]["id"],
                "result": {
                    "razorpay_order_id": "order_RZP1",
                    "razorpay_payment_id": "pay_1",
                    "razorpay_signature": rzp_signature("order_RZP1", "pay_1"),
                },
            },
            format="json",
        )
        assert response.status_code == 200, response.json()
        assert response.json()["status"] == "paid"
        sub = Subscription.objects.get(organization=owner.organization)
        today = timezone.localdate()
        assert (sub.plan.key, sub.status) == ("basic", "active")
        assert sub.ends_on == today.replace(year=today.year + 1)

    def test_bad_signature_is_refused(self, owner: Actor, calls: list) -> None:
        body = start(owner)
        response = owner.client.post(
            CONFIRM,
            {
                "payment": body["payment"]["id"],
                "result": {
                    "razorpay_order_id": "order_RZP1",
                    "razorpay_payment_id": "pay_1",
                    "razorpay_signature": "forged",
                },
            },
            format="json",
        )
        assert response.status_code == 400
        assert response.json()["error"]["code"] == "payment_not_verified"
        assert Subscription.objects.get(organization=owner.organization).plan.key == "pro"

    def test_webhook_applies_once(self, owner: Actor, calls: list, anon: Any) -> None:
        body = start(owner)
        event = json.dumps(
            {
                "event": "payment.captured",
                "payload": {"payment": {"entity": {"id": "pay_9", "order_id": "order_RZP1"}}},
            }
        ).encode()
        sig = hmac.new(b"rzp-hook", event, hashlib.sha256).hexdigest()
        url = reverse("v1:payment-webhook", args=["razorpay"])
        for _ in range(2):
            response = anon.post(
                url, event, content_type="application/json", HTTP_X_RAZORPAY_SIGNATURE=sig
            )
            assert response.status_code == 200
        payment = PlanPayment.objects.get(pk=body["payment"]["id"])
        assert (payment.status, payment.gateway_payment_id) == ("paid", "pay_9")
        sub = Subscription.objects.get(organization=owner.organization)
        assert sub.plan.key == "basic"
        assert (
            SubscriptionEvent.objects.filter(organization=owner.organization, kind="paid").count()
            == 1
        )

    def test_webhook_with_bad_signature(self, anon: Any) -> None:
        response = anon.post(
            reverse("v1:payment-webhook", args=["razorpay"]),
            b"{}",
            content_type="application/json",
            HTTP_X_RAZORPAY_SIGNATURE="nope",
        )
        assert response.status_code == 400


class TestCashfree:
    def test_checkout_and_confirm(self, owner: Actor, calls: list) -> None:
        body = start(owner, gateway="cashfree", plan="pro")
        assert body["checkout"]["payment_session_id"] == "session_CF1"
        assert body["checkout"]["mode"] == "sandbox"
        method, url, sent = calls[0]
        assert url == "https://sandbox.cashfree.com/pg/orders"
        assert sent["order_amount"] == 1499.0
        assert sent["order_meta"]["return_url"].endswith(
            f"/app/plan?payment={body['payment']['id']}"
        )
        response = owner.client.post(CONFIRM, {"payment": body["payment"]["id"]}, format="json")
        assert response.status_code == 200, response.json()
        assert response.json()["gateway_payment_id"] == "777"
        assert Subscription.objects.get(organization=owner.organization).status == "active"

    def test_webhook(self, owner: Actor, calls: list, anon: Any) -> None:
        body = start(owner, gateway="cashfree")
        order_id = body["checkout"]["order_id"]
        event = json.dumps(
            {
                "data": {
                    "order": {"order_id": order_id},
                    "payment": {"payment_status": "SUCCESS", "cf_payment_id": 55},
                }
            }
        ).encode()
        ts = "1760000000"
        sig = base64.b64encode(
            hmac.new(b"cf-secret", ts.encode() + event, hashlib.sha256).digest()
        ).decode()
        response = anon.post(
            reverse("v1:payment-webhook", args=["cashfree"]),
            event,
            content_type="application/json",
            HTTP_X_WEBHOOK_SIGNATURE=sig,
            HTTP_X_WEBHOOK_TIMESTAMP=ts,
        )
        assert response.status_code == 200
        assert PlanPayment.objects.get(pk=body["payment"]["id"]).status == "paid"


class TestCheckoutRules:
    def test_free_plan_cannot_be_paid_for(self, owner: Actor, calls: list) -> None:
        response = owner.client.post(
            CHECKOUT, {"plan": "free", "period": "month", "gateway": "razorpay"}
        )
        assert response.status_code == 400

    def test_switched_off_gateway(self, owner: Actor, calls: list) -> None:
        PaymentGateway.objects.filter(code="cashfree").update(is_enabled=False)
        response = owner.client.post(
            CHECKOUT, {"plan": "basic", "period": "month", "gateway": "cashfree"}
        )
        assert "not available" in str(response.json()["error"]["fields"])

    def test_gateway_without_keys(self, owner: Actor, calls: list) -> None:
        with override_settings(RAZORPAY_KEY_ID=""):
            response = owner.client.post(
                CHECKOUT, {"plan": "basic", "period": "month", "gateway": "razorpay"}
            )
        assert response.status_code == 400

    def test_only_the_owner_pays(self, owner: Actor, calls: list) -> None:
        manager = make_actor(Role.MANAGER, organization=owner.organization)
        response = manager.client.post(
            CHECKOUT, {"plan": "basic", "period": "month", "gateway": "razorpay"}
        )
        assert response.status_code == 403

    def test_another_business_cannot_confirm(self, owner: Actor, calls: list) -> None:
        body = start(owner)
        other = make_actor(Role.OWNER)
        response = other.client.post(CONFIRM, {"payment": body["payment"]["id"]}, format="json")
        assert response.status_code == 404

    def test_gateways_offered_to_owners(self, owner: Actor) -> None:
        rows = owner.client.get(reverse("v1:plan-gateways")).json()
        assert [(g["code"], g["is_default"]) for g in rows] == [
            ("razorpay", True),
            ("cashfree", False),
        ]

    def test_paying_again_extends_from_the_end_date(self, owner: Actor, calls: list) -> None:
        first = PlanPayment.objects.create(
            organization=owner.organization,
            plan_id=Subscription.objects.get(organization=owner.organization).plan_id,
            period="month",
            amount=1,
            gateway="razorpay",
            gateway_order_id="o1",
        )
        services.apply_payment(first, "p1")
        end = Subscription.objects.get(organization=owner.organization).ends_on
        second = PlanPayment.objects.create(
            organization=owner.organization,
            plan=first.plan,
            period="month",
            amount=1,
            gateway="razorpay",
            gateway_order_id="o2",
        )
        services.apply_payment(second, "p2")
        assert Subscription.objects.get(
            organization=owner.organization
        ).ends_on == services.add_months(end, 1)


class TestPlatformGateways:
    def client(self) -> Any:
        from rest_framework.test import APIClient

        c = APIClient()
        c.force_authenticate(make_platform_user())
        return c

    def test_list_shows_test_mode_and_paytm_reason(self) -> None:
        rows = {g["code"]: g for g in self.client().get(reverse("v1:platform-gateway-list")).json()}
        assert rows["razorpay"]["configured"] and rows["razorpay"]["test_mode"]
        assert "one more library" in rows["paytm"]["unavailable_reason"]

    def test_cannot_switch_on_a_gateway_without_keys(self) -> None:
        response = self.client().patch(
            reverse("v1:platform-gateway-detail", args=["paytm"]),
            {"is_enabled": True},
            format="json",
        )
        assert response.status_code == 400

    def test_one_default(self) -> None:
        self.client().patch(
            reverse("v1:platform-gateway-detail", args=["cashfree"]),
            {"is_default": True},
            format="json",
        )
        assert list(
            PaymentGateway.objects.filter(is_default=True).values_list("code", flat=True)
        ) == ["cashfree"]

    def test_payments_list(self, owner: Actor, calls: list) -> None:
        start(owner)
        rows = self.client().get(reverse("v1:platform-payment-list")).json()["results"]
        assert rows[0]["business"] == owner.organization.name
        assert rows[0]["status_label"] == "Not paid yet"


def test_certificate_problem_is_explained(monkeypatch: pytest.MonkeyPatch) -> None:
    import ssl
    import urllib.error
    import urllib.request

    def broken(*args: Any, **kwargs: Any) -> Any:
        raise urllib.error.URLError(ssl.SSLCertVerificationError("certificate verify failed"))

    monkeypatch.setattr(urllib.request, "urlopen", broken)
    with pytest.raises(gateways.GatewayError) as err:
        gateways._request("POST", "https://api.razorpay.com/v1/orders", {}, {})
    assert "Install Certificates.command" in str(err.value.detail)
