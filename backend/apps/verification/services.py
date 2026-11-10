"""Mobile verification rules: make, send and check 6-digit codes."""

from __future__ import annotations

import datetime as dt
import hashlib
import hmac
import secrets

from django.conf import settings
from django.db import transaction
from django.utils import timezone
from rest_framework import status
from rest_framework.exceptions import APIException, ValidationError

from apps.accounts.models import User
from apps.verification import sms
from apps.verification.models import PhoneCode, SmsGateway, SmsLog

CODE_MINUTES = 10
TRIES = 5
RESEND_SECONDS = 60
CODES_PER_DAY = 5


class TooSoon(APIException):
    status_code = status.HTTP_429_TOO_MANY_REQUESTS
    default_code = "too_many_codes"

    def __init__(self, detail: str, wait_seconds: int) -> None:
        super().__init__(detail=detail, code="too_many_codes")
        self.wait_seconds = wait_seconds


class SmsNotSent(APIException):
    status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    default_code = "sms_not_sent"
    default_detail = "We could not send the code right now. Try again in a minute."


def hash_code(code: str) -> str:
    return hmac.new(settings.SECRET_KEY.encode(), code.encode(), hashlib.sha256).hexdigest()


def make_code() -> str:
    # A fixed code only for automatic tests on a developer's computer.
    fixed = str(getattr(settings, "SMS_TEST_CODE", "") or "")
    if settings.DEBUG and fixed:
        return fixed
    return f"{secrets.randbelow(1_000_000):06d}"


def deliver(phone: str, code: str) -> str:
    """Try the switched-on gateways in order; return the code of the one that sent it."""
    now = timezone.now()
    usable = [
        row for row in SmsGateway.objects.filter(is_enabled=True) if sms.get(row.code).configured()
    ]
    real = [row for row in usable if row.code != SmsGateway.Code.CONSOLE]
    # The test gateway only prints codes; it is used only when no real gateway is on.
    for row in real or usable:
        gateway = sms.get(row.code)
        try:
            reply_id = gateway.send_code(phone, code)
        except sms.SmsError as err:
            SmsLog.objects.create(
                phone_masked=sms.mask(phone), gateway=row.code, ok=False, error=str(err)[:255]
            )
            SmsGateway.objects.filter(pk=row.pk).update(
                last_error_at=now, last_error=str(err)[:255]
            )
            continue
        SmsLog.objects.create(
            phone_masked=sms.mask(phone), gateway=row.code, ok=True, reply_id=reply_id
        )
        SmsGateway.objects.filter(pk=row.pk).update(last_ok_at=now)
        return row.code
    raise SmsNotSent()


def _check_limits(phone: str, user: User) -> None:
    now = timezone.now()
    latest = PhoneCode.objects.filter(user=user).first()
    if latest is not None:
        wait = RESEND_SECONDS - int((now - latest.created_at).total_seconds())
        if wait > 0:
            raise TooSoon(f"Wait {wait} seconds before asking for a new code.", wait)
    sent_today = PhoneCode.objects.filter(
        phone=phone, created_at__gte=now - dt.timedelta(days=1)
    ).count()
    if sent_today >= CODES_PER_DAY:
        raise TooSoon(
            "Too many codes for this number today. Try again tomorrow or contact support.",
            24 * 3600,
        )


def send_code(user: User, phone: str | None = None) -> PhoneCode:
    """Send a new code to `phone` (a new number) or to the user's own number."""
    target = phone or user.phone
    if not target:
        raise ValidationError({"phone": "Enter your mobile number."})
    if User.objects.filter(phone=target, phone_verified_at__isnull=False).exclude(pk=user.pk):
        raise ValidationError({"phone": "This mobile is already in use. Sign in instead."})
    _check_limits(target, user)
    code = make_code()
    with transaction.atomic():
        PhoneCode.objects.filter(user=user, used_at__isnull=True).update(cancelled=True)
        row = PhoneCode.objects.create(
            user=user,
            phone=target,
            code_hash=hash_code(code),
            expires_at=timezone.now() + dt.timedelta(minutes=CODE_MINUTES),
            tries_left=TRIES,
        )
    deliver(target, code)
    return row


def _check(row: PhoneCode | None, code: str) -> PhoneCode:
    """Count a try and raise a plain-words error unless `code` matches the live `row`."""
    if row is None or row.expires_at < timezone.now():
        raise ValidationError({"code": "This code has expired. Ask for a new one."})
    if row.tries_left == 0:
        raise ValidationError({"code": "Too many wrong tries. Ask for a new code."})
    if not hmac.compare_digest(row.code_hash, hash_code(code.strip())):
        row.tries_left -= 1
        row.save(update_fields=["tries_left", "updated_at"])
        if row.tries_left == 0:
            raise ValidationError({"code": "Too many wrong tries. Ask for a new code."})
        left = row.tries_left
        raise ValidationError(
            {"code": f"That code is not right. {left} {'try' if left == 1 else 'tries'} left."}
        )
    return row


def confirm_code(user: User, code: str) -> User:
    now = timezone.now()
    row = _check(
        PhoneCode.objects.filter(user=user, used_at__isnull=True, cancelled=False).first(), code
    )
    with transaction.atomic():
        row.used_at = now
        row.save(update_fields=["used_at", "updated_at"])
        if User.objects.filter(phone=row.phone).exclude(pk=user.pk).exists():
            raise ValidationError({"code": "This mobile is already in use. Sign in instead."})
        user.phone = row.phone
        user.phone_verified_at = now
        user.save(update_fields=["phone", "phone_verified_at"])
    return user


def _check_phone_limits(phone: str, purpose: str) -> None:
    now = timezone.now()
    latest = PhoneCode.objects.filter(phone=phone, purpose=purpose).first()
    if latest is not None:
        wait = RESEND_SECONDS - int((now - latest.created_at).total_seconds())
        if wait > 0:
            raise TooSoon(f"Wait {wait} seconds before asking for a new code.", wait)
    if (
        PhoneCode.objects.filter(phone=phone, created_at__gte=now - dt.timedelta(days=1)).count()
        >= CODES_PER_DAY
    ):
        raise TooSoon(
            "Too many codes for this number today. Try again tomorrow or contact support.",
            24 * 3600,
        )


def send_phone_code(phone: str, purpose: str = PhoneCode.Purpose.SIGNUP) -> PhoneCode:
    """Send a code to a number before anyone is signed in (sign-up or sign-in by mobile).
    Same limits as every other code: 60 seconds between codes, 5 a day per number."""
    _check_phone_limits(phone, purpose)
    code = make_code()
    with transaction.atomic():
        PhoneCode.objects.filter(phone=phone, purpose=purpose, used_at__isnull=True).update(
            cancelled=True
        )
        row = PhoneCode.objects.create(
            phone=phone,
            purpose=purpose,
            code_hash=hash_code(code),
            expires_at=timezone.now() + dt.timedelta(minutes=CODE_MINUTES),
            tries_left=TRIES,
        )
    deliver(phone, code)
    return row


def confirm_phone_code(phone: str, code: str, purpose: str = PhoneCode.Purpose.SIGNUP) -> None:
    """Check a code sent with `send_phone_code`; marks it used. Raises if wrong."""
    row = _check(
        PhoneCode.objects.filter(
            phone=phone, purpose=purpose, used_at__isnull=True, cancelled=False
        ).first(),
        code,
    )
    row.used_at = timezone.now()
    row.save(update_fields=["used_at", "updated_at"])


def phone_resend_in(phone: str, purpose: str = PhoneCode.Purpose.SIGNUP) -> int:
    latest = PhoneCode.objects.filter(phone=phone, purpose=purpose).first()
    if latest is None:
        return 0
    return max(0, RESEND_SECONDS - int((timezone.now() - latest.created_at).total_seconds()))


def resend_in(user: User) -> int:
    latest = PhoneCode.objects.filter(user=user).first()
    if latest is None:
        return 0
    return max(0, RESEND_SECONDS - int((timezone.now() - latest.created_at).total_seconds()))
