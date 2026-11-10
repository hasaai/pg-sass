"""Every new business starts on the trial plan (see services.start_trial)."""

from __future__ import annotations

from typing import Any

from django.db.models.signals import post_save
from django.dispatch import receiver

from apps.organizations.models import Organization


@receiver(post_save, sender=Organization, dispatch_uid="subscriptions.start_trial")
def start_trial_for_new_business(
    sender: Any, instance: Organization, created: bool, **_: Any
) -> None:
    if created:
        from apps.subscriptions import services

        services.start_trial(instance)
