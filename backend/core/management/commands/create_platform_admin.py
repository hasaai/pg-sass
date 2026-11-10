"""Create (or update) a PG Manager platform-team account: the people who use /platform.

    python manage.py create_platform_admin --email you@example.com --name "Your Name"

The password comes from --password or the PLATFORM_ADMIN_PASSWORD environment variable,
never from a default, so no shared password ends up in the code.
"""

from __future__ import annotations

import os
from typing import Any

from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.core.management.base import BaseCommand, CommandError, CommandParser

from apps.accounts.models import User


class Command(BaseCommand):
    help = "Create or update a platform admin (staff) account for /platform."

    def add_arguments(self, parser: CommandParser) -> None:
        parser.add_argument("--email", required=True)
        parser.add_argument("--name", default="PG Manager platform team")
        parser.add_argument("--password", default=None)
        parser.add_argument(
            "--role",
            default="platform_owner",
            choices=["platform_owner", "finance_admin", "support_agent", "verification_reviewer"],
        )

    def handle(self, *args: Any, **options: Any) -> None:
        password = options["password"] or os.environ.get("PLATFORM_ADMIN_PASSWORD")
        if not password:
            raise CommandError("Give --password or set PLATFORM_ADMIN_PASSWORD.")
        try:
            validate_password(password)
        except ValidationError as exc:
            raise CommandError(" ".join(exc.messages)) from exc
        email = User.objects.normalize_email(options["email"]).lower()
        user = User.objects.filter(email__iexact=email).first()
        created = user is None
        if user is None:
            user = User.objects.create_user(
                email=email, password=password, full_name=options["name"], is_staff=True
            )
        else:
            user.is_staff = True
            user.is_active = True
            user.set_password(password)
            user.save(update_fields=["is_staff", "is_active", "password"])
        from apps.platform.models import PlatformStaff

        PlatformStaff.objects.update_or_create(
            user=user,
            defaults={"role": options["role"], "extra_permissions": [], "removed_permissions": []},
        )
        self.stdout.write(
            self.style.SUCCESS(f"{'Created' if created else 'Updated'} platform admin {email}.")
        )
