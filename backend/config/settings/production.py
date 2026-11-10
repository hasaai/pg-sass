"""Staging and production settings. Every secret comes from the environment."""

from django.core.exceptions import ImproperlyConfigured

from config.env import env_list

from .base import *

DEBUG = False
CSRF_TRUSTED_ORIGINS = env_list("DJANGO_CSRF_TRUSTED_ORIGINS")
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SECURE_SSL_REDIRECT = True
SECURE_HSTS_SECONDS = 60 * 60 * 24 * 365
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_CONTENT_TYPE_NOSNIFF = True
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
REFRESH_COOKIE_SECURE = True

# HSTS preload is a long-term commitment to HTTPS on every subdomain; we opt in
# deliberately once the production domain is final (see docs/decisions/0002-auth-tokens.md).
SILENCED_SYSTEM_CHECKS = ["security.W021"]

if DB_ENGINE != "postgres":
    raise ImproperlyConfigured("Production must run on PostgreSQL: set DB_ENGINE=postgres.")
