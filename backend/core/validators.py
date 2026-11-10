from __future__ import annotations

import re

from rest_framework import serializers

_PHONE = re.compile(r"^(?:\+?91)?([6-9]\d{9})$")


def normalize_indian_mobile(value: str) -> str:
    """Accept 98xxxxxxxx, +9198xxxxxxxx or 9198xxxxxxxx (spaces/dashes ignored)."""
    digits = re.sub(r"[\s-]", "", value or "")
    match = _PHONE.match(digits)
    if not match:
        raise serializers.ValidationError("Enter a valid 10-digit Indian mobile number.")
    return match.group(1)
