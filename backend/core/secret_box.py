"""Encrypt small secrets (gateway API keys) before they are saved in the database.

Uses Fernet from the `cryptography` library. The key is SECRETS_KEY from the environment, or,
when that is empty, one derived from DJANGO_SECRET_KEY (changing that key then makes saved
secrets unreadable: they read as empty and must be typed again).
"""

from __future__ import annotations

import base64
import hashlib
import json

from cryptography.fernet import Fernet, InvalidToken
from django.conf import settings


def _fernet() -> Fernet:
    key = str(getattr(settings, "SECRETS_KEY", "") or "")
    if key:
        return Fernet(key.encode())
    digest = hashlib.sha256(b"pg-saas secrets:" + settings.SECRET_KEY.encode()).digest()
    return Fernet(base64.urlsafe_b64encode(digest))


def seal(values: dict[str, str]) -> str:
    if not values:
        return ""
    return _fernet().encrypt(json.dumps(values, sort_keys=True).encode()).decode()


def unseal(token: str) -> dict[str, str]:
    if not token:
        return {}
    try:
        data = json.loads(_fernet().decrypt(token.encode()))
    except (InvalidToken, ValueError):
        return {}
    return {str(k): str(v) for k, v in data.items()} if isinstance(data, dict) else {}
