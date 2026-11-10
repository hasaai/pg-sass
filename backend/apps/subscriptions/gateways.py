"""Payment gateways for plan payments. Each gateway creates an order, checks a finished
payment, and checks webhooks. Keys come only from settings (environment variables).

No gateway SDK is used: the APIs are called with the standard library (urllib, hmac), so no
dependency is added. Paytm needs AES for its checksum, which the standard library lacks, so
it is listed but not available until a crypto library is approved.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import logging
import ssl
import urllib.error
import urllib.request
from typing import TYPE_CHECKING, Any

from django.conf import settings
from rest_framework import status
from rest_framework.exceptions import APIException

if TYPE_CHECKING:
    from apps.subscriptions.models import PlanPayment

TIMEOUT_SECONDS = 15
log = logging.getLogger(__name__)

CERTIFICATE_HELP = (
    "The server cannot check the payment gateway's security certificate. On a Mac with "
    "Python from python.org, open the Python folder in Applications and run "
    "'Install Certificates.command', then restart the backend."
)


class GatewayError(APIException):
    status_code = status.HTTP_502_BAD_GATEWAY
    default_code = "gateway_error"

    def __init__(self, detail: str) -> None:
        super().__init__(detail=detail, code="gateway_error")


class PaymentNotVerified(APIException):
    status_code = status.HTTP_400_BAD_REQUEST
    default_code = "payment_not_verified"

    def __init__(self, detail: str = "We could not confirm this payment.") -> None:
        super().__init__(detail=detail, code="payment_not_verified")


def _request(
    method: str, url: str, headers: dict[str, str], body: dict[str, Any] | None = None
) -> dict[str, Any]:
    """JSON over HTTPS. Replaced in tests; no gateway is ever called from the test suite."""
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(  # noqa: S310 - fixed https gateway URLs only
        url, data=data, method=method, headers={"Content-Type": "application/json", **headers}
    )
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT_SECONDS) as resp:  # noqa: S310
            return dict(json.loads(resp.read().decode() or "{}"))
    except urllib.error.HTTPError as err:
        log.warning("Gateway %s %s refused: HTTP %s", method, url, err.code)
        try:
            message = json.loads(err.read().decode()).get("error", {})
            text = message.get("description") if isinstance(message, dict) else str(message)
        except Exception:
            text = ""
        raise GatewayError(f"The payment gateway refused the request ({err.code}). {text}") from err
    except (urllib.error.URLError, TimeoutError) as err:
        reason = getattr(err, "reason", err)
        log.warning("Gateway %s %s not reached: %r", method, url, reason)
        if isinstance(reason, ssl.SSLCertVerificationError):
            raise GatewayError(CERTIFICATE_HELP) from err
        raise GatewayError("The payment gateway could not be reached. Try again.") from err


def _hmac_hex(secret: str, message: bytes) -> str:
    return hmac.new(secret.encode(), message, hashlib.sha256).hexdigest()


class Gateway:
    code = ""
    name = ""
    unavailable_reason = ""

    def configured(self) -> bool:
        raise NotImplementedError

    def test_mode(self) -> bool:
        raise NotImplementedError

    def create_order(
        self, payment: PlanPayment, customer: dict[str, str]
    ) -> tuple[str, dict[str, Any]]:
        """Return (gateway order id, data the browser needs to open the payment window)."""
        raise NotImplementedError

    def confirm(self, payment: PlanPayment, data: dict[str, Any]) -> str:
        """Check a finished payment; return the gateway payment id or raise."""
        raise NotImplementedError

    def webhook(self, body: bytes, headers: dict[str, str]) -> tuple[str, str] | None:
        """Check a webhook; return (order id, payment id) for a successful payment, else None."""
        raise NotImplementedError


class Razorpay(Gateway):
    code = "razorpay"
    name = "Razorpay"
    api = "https://api.razorpay.com/v1"

    def configured(self) -> bool:
        return bool(settings.RAZORPAY_KEY_ID and settings.RAZORPAY_KEY_SECRET)

    def test_mode(self) -> bool:
        return str(settings.RAZORPAY_KEY_ID).startswith("rzp_test_")

    def _auth(self) -> dict[str, str]:
        token = base64.b64encode(
            f"{settings.RAZORPAY_KEY_ID}:{settings.RAZORPAY_KEY_SECRET}".encode()
        ).decode()
        return {"Authorization": f"Basic {token}"}

    def create_order(
        self, payment: PlanPayment, customer: dict[str, str]
    ) -> tuple[str, dict[str, Any]]:
        order = _request(
            "POST",
            f"{self.api}/orders",
            self._auth(),
            {
                "amount": payment.amount,
                "currency": "INR",
                "receipt": str(payment.pk)[:40],
                "notes": {"business": str(payment.organization_id), "plan": payment.plan.key},
            },
        )
        order_id = str(order.get("id", ""))
        if not order_id:
            raise GatewayError("Razorpay did not return an order.")
        return order_id, {
            "key_id": settings.RAZORPAY_KEY_ID,
            "order_id": order_id,
            "amount": payment.amount,
            "currency": "INR",
            "name": "PG Manager",
            "description": f"{payment.plan.name} plan, {payment.get_period_display()}",
            "prefill": {"name": customer.get("name", ""), "email": customer.get("email", "")},
        }

    def confirm(self, payment: PlanPayment, data: dict[str, Any]) -> str:
        order_id = str(data.get("razorpay_order_id", ""))
        payment_id = str(data.get("razorpay_payment_id", ""))
        signature = str(data.get("razorpay_signature", ""))
        if order_id != payment.gateway_order_id or not payment_id or not signature:
            raise PaymentNotVerified()
        expected = _hmac_hex(settings.RAZORPAY_KEY_SECRET, f"{order_id}|{payment_id}".encode())
        if not hmac.compare_digest(expected, signature):
            raise PaymentNotVerified("The payment signature does not match.")
        return payment_id

    def webhook(self, body: bytes, headers: dict[str, str]) -> tuple[str, str] | None:
        secret = settings.RAZORPAY_WEBHOOK_SECRET
        signature = headers.get("x-razorpay-signature", "")
        if not secret or not hmac.compare_digest(_hmac_hex(secret, body), signature):
            raise PaymentNotVerified("Webhook signature does not match.")
        event = json.loads(body.decode() or "{}")
        if event.get("event") not in ("payment.captured", "order.paid"):
            return None
        entity = event.get("payload", {}).get("payment", {}).get("entity", {})
        if entity.get("order_id") and entity.get("id"):
            return str(entity["order_id"]), str(entity["id"])
        return None


class Cashfree(Gateway):
    code = "cashfree"
    name = "Cashfree"
    version = "2023-08-01"

    def configured(self) -> bool:
        return bool(settings.CASHFREE_APP_ID and settings.CASHFREE_SECRET_KEY)

    def test_mode(self) -> bool:
        return settings.CASHFREE_ENV != "production"

    @property
    def api(self) -> str:
        host = "sandbox.cashfree.com" if self.test_mode() else "api.cashfree.com"
        return f"https://{host}/pg"

    def _headers(self) -> dict[str, str]:
        return {
            "x-client-id": settings.CASHFREE_APP_ID,
            "x-client-secret": settings.CASHFREE_SECRET_KEY,
            "x-api-version": self.version,
        }

    def create_order(
        self, payment: PlanPayment, customer: dict[str, str]
    ) -> tuple[str, dict[str, Any]]:
        order_id = f"plan_{payment.pk.hex}"
        base = str(settings.APP_BASE_URL).rstrip("/")
        order = _request(
            "POST",
            f"{self.api}/orders",
            self._headers(),
            {
                "order_id": order_id,
                "order_amount": round(payment.amount / 100, 2),
                "order_currency": "INR",
                "customer_details": {
                    "customer_id": str(payment.organization_id).replace("-", "")[:50],
                    "customer_name": customer.get("name", "")[:100],
                    "customer_email": customer.get("email", ""),
                    "customer_phone": customer.get("phone") or "9999999999",
                },
                "order_meta": {"return_url": f"{base}/app/plan?payment={payment.pk}"},
                "order_note": f"{payment.plan.name} plan, {payment.get_period_display()}",
            },
        )
        session = str(order.get("payment_session_id", ""))
        if not session:
            raise GatewayError("Cashfree did not return a payment session.")
        return order_id, {
            "payment_session_id": session,
            "mode": "sandbox" if self.test_mode() else "production",
            "order_id": order_id,
        }

    def confirm(self, payment: PlanPayment, data: dict[str, Any]) -> str:
        order = _request("GET", f"{self.api}/orders/{payment.gateway_order_id}", self._headers())
        if order.get("order_status") != "PAID":
            raise PaymentNotVerified("Cashfree says this order is not paid yet.")
        return str(order.get("cf_order_id") or payment.gateway_order_id)

    def webhook(self, body: bytes, headers: dict[str, str]) -> tuple[str, str] | None:
        timestamp = headers.get("x-webhook-timestamp", "")
        signature = headers.get("x-webhook-signature", "")
        expected = base64.b64encode(
            hmac.new(
                settings.CASHFREE_SECRET_KEY.encode(), timestamp.encode() + body, hashlib.sha256
            ).digest()
        ).decode()
        if not settings.CASHFREE_SECRET_KEY or not hmac.compare_digest(expected, signature):
            raise PaymentNotVerified("Webhook signature does not match.")
        event = json.loads(body.decode() or "{}")
        data = event.get("data", {})
        if data.get("payment", {}).get("payment_status") != "SUCCESS":
            return None
        order_id = data.get("order", {}).get("order_id")
        payment_id = data.get("payment", {}).get("cf_payment_id")
        if order_id:
            return str(order_id), str(payment_id or order_id)
        return None


class Paytm(Gateway):
    code = "paytm"
    name = "Paytm"
    unavailable_reason = (
        "Paytm needs one more library (for its encrypted checksum). Ask the developer to "
        "switch it on."
    )

    def configured(self) -> bool:
        return False

    def test_mode(self) -> bool:
        return True


GATEWAYS: dict[str, Gateway] = {g.code: g for g in (Razorpay(), Cashfree(), Paytm())}


def get(code: str) -> Gateway:
    gateway = GATEWAYS.get(code)
    if gateway is None:
        raise GatewayError("Unknown payment gateway.")
    return gateway
