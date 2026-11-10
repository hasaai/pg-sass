"""Local development settings. Values come from backend/.env (see .env.example)."""

from config.env import env_bool

from .base import *

DEBUG = True
REFRESH_COOKIE_SECURE = False
# Your own listings show on the local marketplace without platform verification.
LISTINGS_REQUIRE_VERIFICATION = env_bool("LISTINGS_REQUIRE_VERIFICATION", default=False)
