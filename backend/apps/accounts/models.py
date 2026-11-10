"""User accounts.

Operator staff sign in with email + password. Tenants will sign in with a phone
OTP (Phase 0, once an SMS provider is chosen), so email is optional at the
database level but at least one of email or phone must be present.
"""

from __future__ import annotations

import uuid
from typing import Any

from django.contrib.auth.base_user import AbstractBaseUser, BaseUserManager
from django.contrib.auth.models import PermissionsMixin
from django.db import models
from django.db.models import Q
from django.utils import timezone


def normalize_email_address(email: str | None) -> str | None:
    if not email:
        return None
    return email.strip().lower()


class UserManager(BaseUserManager["User"]):
    use_in_migrations = True

    def create_user(self, email: str | None, password: str | None = None, **extra: Any) -> User:
        user = self.model(email=normalize_email_address(email), **extra)
        if password:
            user.set_password(password)
        else:
            user.set_unusable_password()
        user.full_clean(exclude=["password"])
        user.save(using=self._db)
        return user

    def create_superuser(self, email: str, password: str, **extra: Any) -> User:
        extra.setdefault("is_staff", True)
        extra.setdefault("is_superuser", True)
        return self.create_user(email, password, **extra)


class User(AbstractBaseUser, PermissionsMixin):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    email = models.EmailField(unique=True, null=True, blank=True)
    phone = models.CharField(max_length=15, unique=True, null=True, blank=True)
    # Set when the user typed the SMS code sent to `phone` (apps.verification).
    phone_verified_at = models.DateTimeField(null=True, blank=True)
    # Set when the user opened the link sent to `email`; never needed to use the app.
    email_verified_at = models.DateTimeField(null=True, blank=True)
    # Empty only between a mobile sign-up and the profile step.
    full_name = models.CharField(max_length=150, blank=True)
    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)
    date_joined = models.DateTimeField(default=timezone.now)

    objects = UserManager()

    USERNAME_FIELD = "email"
    EMAIL_FIELD = "email"
    REQUIRED_FIELDS = ["full_name"]

    class Meta:
        constraints = [
            models.CheckConstraint(
                condition=Q(email__isnull=False) | Q(phone__isnull=False),
                name="user_has_email_or_phone",
            ),
        ]

    def save(self, *args: Any, **kwargs: Any) -> None:
        self.email = normalize_email_address(self.email)
        self.phone = self.phone or None
        super().save(*args, **kwargs)

    def __str__(self) -> str:
        return self.email or self.phone or str(self.id)
