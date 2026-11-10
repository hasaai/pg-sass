"""PG owner sign-up: consent, mobile code, profile and email confirmation.

Order (approved 2 Nov 2026): agree to Terms and Privacy -> mobile -> 6-digit code -> account
is made -> profile (name, email, optional business name) -> business is made -> dashboard.
Nothing here ever blocks the app after the mobile is confirmed: email confirmation is
tracked but not required.
"""

from __future__ import annotations

from typing import Any

from django.conf import settings
from django.core import signing
from django.db import transaction
from django.utils import timezone
from rest_framework import status
from rest_framework.exceptions import APIException, ValidationError

from apps.accounts.models import User, normalize_email_address
from apps.onboarding.models import ConsentRecord
from apps.organizations.models import Membership
from apps.organizations.services import create_organization_with_owner
from apps.verification import services as codes
from apps.verification.models import PhoneCode
from core import notify
from core.validators import normalize_indian_mobile

EMAIL_SALT = "onboarding.email-confirm"


class AccountSwitchedOff(APIException):
    status_code = status.HTTP_403_FORBIDDEN
    default_code = "account_inactive"
    default_detail = "This account is switched off. Contact PG Manager support."


# ---------------------------------------------------------------- consent


def _client(request: Any) -> dict[str, Any]:
    if request is None:
        return {"ip_address": None, "user_agent": ""}
    forwarded = request.META.get("HTTP_X_FORWARDED_FOR", "")
    ip = forwarded.split(",")[0].strip() or request.META.get("REMOTE_ADDR") or None
    return {"ip_address": ip, "user_agent": request.META.get("HTTP_USER_AGENT", "")[:255]}


def check_required_consent(accept_terms: bool, accept_privacy: bool) -> None:
    errors = {}
    if not accept_terms:
        errors["accept_terms"] = "Tick to agree to the Terms and Conditions."
    if not accept_privacy:
        errors["accept_privacy"] = "Tick to agree to the Privacy Policy."
    if errors:
        raise ValidationError(errors)


def record_consent(
    user: User, *, accept_terms: bool, accept_privacy: bool, marketing: bool, request: Any = None
) -> None:
    client = _client(request)
    rows = [
        (ConsentRecord.Kind.TERMS, accept_terms, settings.TERMS_VERSION),
        (ConsentRecord.Kind.PRIVACY, accept_privacy, settings.PRIVACY_VERSION),
        (ConsentRecord.Kind.MARKETING, marketing, ""),
    ]
    ConsentRecord.objects.bulk_create(
        ConsentRecord(user=user, kind=kind, accepted=ok, version=version, **client)
        for kind, ok, version in rows
    )


def set_marketing(user: User, accepted: bool, request: Any = None) -> None:
    ConsentRecord.objects.create(
        user=user, kind=ConsentRecord.Kind.MARKETING, accepted=accepted, **_client(request)
    )


def current_consent(user: User) -> dict[str, bool]:
    latest: dict[str, bool] = {}
    for row in ConsentRecord.objects.filter(user=user).order_by("created_at"):
        latest[row.kind] = row.accepted
    return {kind: latest.get(kind, False) for kind in ConsentRecord.Kind.values}


# ---------------------------------------------------------------- mobile sign-up / sign-in


def start_signup(phone: str) -> str:
    """Send a code to the number. The answer is the same whether or not an account already
    uses it, so nobody can find out which numbers are registered."""
    number = normalize_indian_mobile(phone)
    codes.send_phone_code(number, PhoneCode.Purpose.SIGNUP)
    return number


def finish_signup(
    *,
    phone: str,
    code: str,
    accept_terms: bool,
    accept_privacy: bool,
    marketing: bool,
    request: Any = None,
) -> tuple[User, bool]:
    """Check the code; return (user, created). An existing account with this number is
    simply signed in (and its mobile marked confirmed)."""
    check_required_consent(accept_terms, accept_privacy)
    number = normalize_indian_mobile(phone)
    codes.confirm_phone_code(number, code, PhoneCode.Purpose.SIGNUP)
    now = timezone.now()
    with transaction.atomic():
        user = User.objects.select_for_update().filter(phone=number).first()
        created = user is None
        if user is None:
            user = User.objects.create_user(
                email=None, phone=number, full_name="", phone_verified_at=now
            )
        elif not user.is_active:
            raise AccountSwitchedOff()
        elif user.phone_verified_at is None:
            user.phone_verified_at = now
            user.save(update_fields=["phone_verified_at"])
        record_consent(
            user,
            accept_terms=accept_terms,
            accept_privacy=accept_privacy,
            marketing=marketing,
            request=request,
        )
    return user, created


def start_mobile_login(phone: str) -> str:
    """Sign-in by mobile: a code is sent only to a number with an active account, but the
    answer is always the same."""
    number = normalize_indian_mobile(phone)
    if User.objects.filter(phone=number, is_active=True).exists():
        codes.send_phone_code(number, PhoneCode.Purpose.SIGNUP)
    return number


def finish_mobile_login(phone: str, code: str) -> User:
    number = normalize_indian_mobile(phone)
    codes.confirm_phone_code(number, code, PhoneCode.Purpose.SIGNUP)
    user = User.objects.filter(phone=number).first()
    if user is None:  # cannot happen: no code is sent to unknown numbers
        raise ValidationError({"code": "This code has expired. Ask for a new one."})
    if not user.is_active:
        raise AccountSwitchedOff()
    if user.phone_verified_at is None:
        user.phone_verified_at = timezone.now()
        user.save(update_fields=["phone_verified_at"])
    return user


# ---------------------------------------------------------------- profile


def has_business(user: User) -> bool:
    return Membership.objects.filter(user=user, is_active=True).exists()


@transaction.atomic
def save_profile(
    *,
    user: User,
    full_name: str,
    email: str,
    business_name: str = "",
    marketing: bool | None = None,
    request: Any = None,
) -> User:
    """Name and email (both needed), and the business on first save. A changed email is
    confirmed again (a link is emailed); the app keeps working meanwhile."""
    name = full_name.strip()
    if not name:
        raise ValidationError({"full_name": "Enter your name."})
    address = normalize_email_address(email) or ""
    if not address:
        raise ValidationError({"email": "Enter your email address."})
    if User.objects.filter(email=address).exclude(pk=user.pk).exists():
        raise ValidationError(
            {"email": "Another account uses this email. Sign in with it instead."}
        )
    email_changed = address != (user.email or "")
    user.full_name = name
    user.email = address
    if email_changed:
        user.email_verified_at = None
    user.save(update_fields=["full_name", "email", "email_verified_at"])
    if not has_business(user):
        create_organization_with_owner(
            owner=user,
            name=business_name.strip() or f"{name}'s PG",
            contact_phone=user.phone or "",
        )
    if marketing is not None and current_consent(user)["marketing"] != marketing:
        set_marketing(user, marketing, request)
    if email_changed:
        transaction.on_commit(lambda: send_email_link(user))
    return user


# ---------------------------------------------------------------- email confirmation


def email_link(user: User) -> str:
    token = signing.dumps({"u": str(user.pk), "e": user.email}, salt=EMAIL_SALT, compress=True)
    return f"{settings.APP_BASE_URL.rstrip('/')}/confirm-email?token={token}"


def send_email_link(user: User) -> bool:
    if not user.email or user.email_verified_at is not None:
        return False
    hours = settings.EMAIL_LINK_HOURS
    body = (
        f"Hi {user.full_name or 'there'},\n\n"
        f"Please confirm your email for PG Manager by opening this link:\n{email_link(user)}\n\n"
        f"The link works for {hours} hours. If you did not sign up, you can ignore this email."
    )
    return notify.email(user.email, "Confirm your email for PG Manager", body)


def confirm_email(token: str) -> User:
    bad = ValidationError({"token": "This link is not valid. Ask for a new one from your account."})
    try:
        data = signing.loads(token, salt=EMAIL_SALT, max_age=settings.EMAIL_LINK_HOURS * 3600)
    except signing.SignatureExpired as exc:
        raise ValidationError(
            {"token": "This link has expired. Ask for a new one from your account."}
        ) from exc
    except signing.BadSignature as exc:
        raise bad from exc
    user = User.objects.filter(pk=data.get("u")).first()
    if user is None:
        raise bad
    if (user.email or "") != data.get("e"):
        raise ValidationError(
            {"token": "This link is for an email you have since changed. Use the newest email."}
        )
    if user.email_verified_at is None:
        user.email_verified_at = timezone.now()
        user.save(update_fields=["email_verified_at"])
    return user
