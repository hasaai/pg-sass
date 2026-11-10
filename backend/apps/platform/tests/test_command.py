import pytest
from django.core.management import CommandError, call_command

from apps.accounts.models import User


def test_creates_and_updates_a_platform_admin() -> None:
    call_command("create_platform_admin", email="Team@Example.com", password="Strong-Pass-2026!")
    user = User.objects.get(email="team@example.com")
    assert user.is_staff and not user.is_superuser
    assert user.check_password("Strong-Pass-2026!")
    call_command("create_platform_admin", email="team@example.com", password="Another-Pass-2026!")
    user.refresh_from_db()
    assert user.check_password("Another-Pass-2026!")


def test_needs_a_strong_password(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("PLATFORM_ADMIN_PASSWORD", raising=False)
    with pytest.raises(CommandError, match="PLATFORM_ADMIN_PASSWORD"):
        call_command("create_platform_admin", email="a@example.com")
    with pytest.raises(CommandError):
        call_command("create_platform_admin", email="a@example.com", password="123")
