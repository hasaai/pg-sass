"""The SMS gateways the platform portal lists. APITxT (default) and the test gateway start on."""

from __future__ import annotations

from typing import Any

GATEWAYS = [
    # APITxT is the default: first in line and on (it sends only once its key is set).
    {"code": "apitxt", "position": 0, "is_enabled": True},
    {"code": "console", "position": 1, "is_enabled": True},
    {"code": "twofactor", "position": 2, "is_enabled": False},
    {"code": "fast2sms", "position": 3, "is_enabled": False},
]


def ensure_gateways(model: Any) -> None:
    for row in GATEWAYS:
        model.objects.get_or_create(code=row["code"], defaults=row)
