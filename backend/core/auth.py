from __future__ import annotations

from typing import Any

from drf_spectacular.contrib.rest_framework_simplejwt import SimpleJWTScheme
from rest_framework.request import Request
from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.exceptions import AuthenticationFailed, InvalidToken


class OptionalJWTAuthentication(JWTAuthentication):
    """For public pages: a valid token identifies the visitor, a bad one is simply ignored."""

    def authenticate(self, request: Request) -> Any:
        try:
            return super().authenticate(request)
        except (InvalidToken, AuthenticationFailed):
            return None


class OptionalJWTScheme(SimpleJWTScheme):
    """Documents public endpoints as "JWT optional" in the OpenAPI schema."""

    target_class = "core.auth.OptionalJWTAuthentication"
    name = "optionalJwtAuth"  # a distinct component; same Bearer format as jwtAuth
