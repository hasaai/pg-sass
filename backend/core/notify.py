"""Outgoing messages. Email today; an SMS/WhatsApp provider can be added behind the same calls."""

from __future__ import annotations

import logging

from django.conf import settings
from django.core.mail import send_mail

logger = logging.getLogger(__name__)


def email(to: str, subject: str, body: str) -> bool:
    """Send one plain-text email. Never raises: a failed email must not break the request."""
    if not to:
        return False
    try:
        send_mail(subject, body, settings.DEFAULT_FROM_EMAIL, [to], fail_silently=False)
    except Exception:  # SMTP down, bad address...
        logger.exception("Email to %s failed", to)
        return False
    return True
