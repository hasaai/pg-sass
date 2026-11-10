"""SMS gateways for mobile codes: APITxT, 2Factor, Fast2SMS and a test gateway that prints it.

Our app makes and checks the code; a gateway only delivers it, so every gateway follows the
same rules and the router can fall back to the next one. Keys come from the platform portal
(stored encrypted, see core.secret_box) or, if not typed there, from the environment (.env).
HTTP uses the standard library; tests replace `_request` and never call a gateway.
"""

from __future__ import annotations

import json
import logging
import sys
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from typing import Any

from django.conf import settings

log = logging.getLogger(__name__)

TIMEOUT_SECONDS = 8


class SmsError(Exception):
    """The gateway did not accept the message. The text is safe to show to platform staff."""


def mask(phone: str) -> str:
    return f"{phone[:2]}xxxxx{phone[-3:]}" if len(phone) >= 5 else "xxxxx"


def _request(
    method: str,
    url: str,
    headers: dict[str, str],
    body: dict[str, Any] | None = None,
    form: bool = False,
) -> dict[str, Any]:
    """JSON (or a form, ``form=True``) over HTTPS; the reply is JSON. Error texts never
    include the URL or body (2Factor puts the key in the URL, APITxT in the body)."""
    if body is None:
        data, kind = None, "application/json"
    elif form:
        data, kind = urllib.parse.urlencode(body).encode(), "application/x-www-form-urlencoded"
    else:
        data, kind = json.dumps(body).encode(), "application/json"
    req = urllib.request.Request(  # noqa: S310 - fixed https gateway URLs only
        url, data=data, method=method, headers={"Content-Type": kind, **headers}
    )
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT_SECONDS) as resp:  # noqa: S310
            return dict(json.loads(resp.read().decode() or "{}"))
    except urllib.error.HTTPError as err:
        try:
            reply = json.loads(err.read().decode())
        except Exception:
            reply = {}
        text = reply.get("message") or reply.get("Details") or ""
        raise SmsError(f"Refused ({err.code}). {text}".strip()) from err
    except (urllib.error.URLError, TimeoutError) as err:
        raise SmsError(f"Could not be reached ({getattr(err, 'reason', err)}).") from err
    except ValueError as err:
        raise SmsError("Sent a reply that is not JSON.") from err


@dataclass(frozen=True)
class Field:
    env: str
    label: str
    required: bool = True
    secret: bool = False
    hint: str = ""


class Gateway:
    code = ""
    name = ""
    fields: tuple[Field, ...] = ()
    help = ""

    def portal_values(self) -> dict[str, str]:
        from apps.verification.models import SmsGateway
        from core.secret_box import unseal

        row = SmsGateway.objects.filter(code=self.code).only("credentials").first()
        return unseal(row.credentials) if row else {}

    def source(self, env: str) -> str:
        """'portal', 'env' or '' (not set)."""
        if (self.portal_values().get(env) or "").strip():
            return "portal"
        return "env" if str(getattr(settings, env, "") or "").strip() else ""

    def _value(self, env: str) -> str:
        typed = (self.portal_values().get(env) or "").strip()
        return typed or str(getattr(settings, env, "") or "").strip()

    def warnings(self) -> list[str]:
        """Values that are set but look wrong (placeholders, pasted message text)."""
        found = []
        for f in self.fields:
            value = self._value(f.env)
            if f.secret and value and len(value) < 10:
                found.append(
                    f"{f.label} is only {len(value)} characters; it looks like a placeholder."
                )
        return found

    def missing(self) -> list[str]:
        return [f.env for f in self.fields if f.required and not self._value(f.env)]

    def configured(self) -> bool:
        return not self.missing()

    def unavailable_reason(self) -> str:
        missing = self.missing()
        if not missing:
            return ""
        return f"Missing {', '.join(missing)}. Press Enter keys, or add them to backend/.env."

    def send_code(self, phone: str, code: str) -> str:
        """Send the code; return the gateway's message id. Raise SmsError if refused."""
        raise NotImplementedError


class Console(Gateway):
    code = "console"
    name = "Test (Terminal)"
    help = "Prints the code in the backend Terminal. Works only on your computer (DEBUG on)."

    def configured(self) -> bool:
        return bool(settings.DEBUG)

    def unavailable_reason(self) -> str:
        return "" if settings.DEBUG else "Only for testing on your computer (DEBUG on)."

    def send_code(self, phone: str, code: str) -> str:
        print(f"\n[SMS test] Code for {phone}: {code}\n", file=sys.stderr, flush=True)
        return "console"


class ApiTxt(Gateway):
    """apitxt.com Unified OTP API: POST /api/sendOTP with our code; they fill their template."""

    code = "apitxt"
    name = "APITxT"
    fields = (
        Field("APITXT_AUTH_KEY", "Auth key", secret=True, hint="APITxT dashboard, API Keys"),
        Field(
            "APITXT_TEMPLATE_ID",
            "SMS template ID (optional)",
            required=False,
            hint="A number from SMS Templates; empty = APITxT's default OTP message",
        ),
    )
    help = (
        "apitxt.com dashboard: API Keys for the auth key. Optional: your SMS template ID "
        "(the message must contain {otp})."
    )
    URL = "https://apitxt.com/api/sendOTP"

    def warnings(self) -> list[str]:
        found = super().warnings()
        template = self._value("APITXT_TEMPLATE_ID")
        if template and not template.isdigit():
            found.append(
                "The SMS template ID should be a number from APITxT's SMS Templates page, "
                "not the message text."
            )
        return found

    def send_code(self, phone: str, code: str) -> str:
        body = {
            "authkey": self._value("APITXT_AUTH_KEY"),
            "mobile": f"91{phone}",
            "otp": code,
            "channel": "sms",
            "country": "91",
        }
        template = self._value("APITXT_TEMPLATE_ID")
        if template:
            body["template_id"] = template
        reply = _request("POST", self.URL, {"Accept": "application/json"}, body, form=True)
        if str(reply.get("status", "")).lower() != "success":
            raise SmsError(f"Refused. {reply.get('message', '')}".strip())
        data = reply.get("data")
        return str(data.get("request_id", "") if isinstance(data, dict) else "")[:120]


class TwoFactor(Gateway):
    code = "twofactor"
    name = "2Factor"
    fields = (
        Field("TWOFACTOR_API_KEY", "API key", secret=True, hint="2Factor dashboard, API key"),
        Field(
            "TWOFACTOR_TEMPLATE",
            "OTP template name (optional)",
            required=False,
            hint="The template's short name, e.g. PGLogin, not the message text",
        ),
    )
    help = "2factor.in dashboard: API key; your DLT-approved OTP template name."

    def warnings(self) -> list[str]:
        found = super().warnings()
        template = self._value("TWOFACTOR_TEMPLATE")
        if " " in template or len(template) > 30:
            found.append(
                "The template name looks like message text. Use the template's short name "
                "from 2Factor (or leave it empty to use their default)."
            )
        return found

    def send_code(self, phone: str, code: str) -> str:
        key = urllib.parse.quote(self._value("TWOFACTOR_API_KEY"), safe="")
        url = f"https://2factor.in/API/V1/{key}/SMS/91{phone}/{code}"
        template = self._value("TWOFACTOR_TEMPLATE")
        if template:
            url += "/" + urllib.parse.quote(template, safe="")
        reply = _request("GET", url, {})
        if str(reply.get("Status", "")).lower() != "success":
            raise SmsError(f"Refused. {reply.get('Details', '')}".strip())
        return str(reply.get("Details", ""))[:120]


class Fast2Sms(Gateway):
    code = "fast2sms"
    name = "Fast2SMS"
    fields = (
        Field("FAST2SMS_API_KEY", "API key", secret=True, hint="Fast2SMS dashboard, Dev API"),
        Field(
            "FAST2SMS_OTP_ID",
            "OTP template ID (OTP API)",
            required=False,
            hint="Fill this, or the two DLT fields below",
        ),
        Field("FAST2SMS_SENDER_ID", "DLT sender ID", required=False, hint="3 to 6 letters"),
        Field("FAST2SMS_MESSAGE_ID", "DLT message ID", required=False, hint="From DLT Manager"),
    )
    help = (
        "Fast2SMS dashboard: Dev API for the key. Then either the OTP template ID, "
        "or the DLT sender ID + message ID from DLT Manager."
    )

    def missing(self) -> list[str]:
        missing = super().missing()
        if self._value("FAST2SMS_OTP_ID"):
            return missing
        dlt = [e for e in ("FAST2SMS_SENDER_ID", "FAST2SMS_MESSAGE_ID") if not self._value(e)]
        return missing + (["FAST2SMS_OTP_ID or " + " + ".join(dlt)] if dlt else [])

    def send_code(self, phone: str, code: str) -> str:
        headers = {"Authorization": self._value("FAST2SMS_API_KEY")}
        if self._value("FAST2SMS_OTP_ID"):
            body: dict[str, Any] = {
                "mobile": phone,
                "otp_id": self._value("FAST2SMS_OTP_ID"),
                "otp": code,
                "otp_length": len(code),
                "otp_expiry": 10,
            }
            reply = _request("POST", "https://www.fast2sms.com/dev/otp/send", headers, body)
        else:
            body = {
                "route": "dlt",
                "sender_id": self._value("FAST2SMS_SENDER_ID"),
                "message": self._value("FAST2SMS_MESSAGE_ID"),
                "variables_values": code,
                "numbers": phone,
            }
            reply = _request("POST", "https://www.fast2sms.com/dev/bulkV2", headers, body)
        if reply.get("return") is not True:
            message = reply.get("message")
            text = ", ".join(message) if isinstance(message, list) else str(message or "")
            raise SmsError(f"Refused. {text}".strip())
        return str(reply.get("request_id", ""))[:120]


GATEWAYS: dict[str, Gateway] = {g.code: g for g in (Console(), ApiTxt(), TwoFactor(), Fast2Sms())}


def get(code: str) -> Gateway:
    return GATEWAYS[code]
