"""Settings for the automated test suite."""

import os
import tempfile
from pathlib import Path

# Tests never need a real secret. Real environments must set DJANGO_SECRET_KEY.
os.environ.setdefault("DJANGO_SECRET_KEY", "test-only-not-secret-padded-to-a-safe-length-for-hs256")

from .base import *

DEBUG = False
PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]  # fast, tests only
REFRESH_COOKIE_SECURE = False
REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"] = {
    "auth": "1000/min",
    "enquiry": "1000/min",
    "public_form": "1000/min",
}
EMAIL_BACKEND = "django.core.mail.backends.locmem.EmailBackend"
MEDIA_ROOT = Path(tempfile.mkdtemp(prefix="pgsaas-test-media-"))
LISTINGS_REQUIRE_VERIFICATION = True
CACHES = {"default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache"}}
