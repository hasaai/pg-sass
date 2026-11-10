"""Authentication endpoints.

The access token (15 minutes) is returned in the response body and kept in
memory by the frontend. The refresh token is only ever sent as an httpOnly,
SameSite=Strict cookie scoped to /api/v1/auth/, so page scripts cannot read it.
"""

from __future__ import annotations

import contextlib
from datetime import timedelta
from typing import Any, Literal, cast

from django.conf import settings
from django.contrib.auth import authenticate
from django.db import transaction
from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.exceptions import APIException, AuthenticationFailed
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.serializers import TokenRefreshSerializer
from rest_framework_simplejwt.tokens import RefreshToken

from apps.accounts.models import User
from apps.accounts.serializers import (
    AccessTokenSerializer,
    AuthResponseSerializer,
    LoginSerializer,
    MeSerializer,
    RegisterSerializer,
    SeekerRegisterSerializer,
)
from apps.organizations.services import create_organization_with_owner
from apps.verification.services import send_code as send_mobile_code


class InvalidCredentials(AuthenticationFailed):
    default_detail = "Email or password is incorrect."
    default_code = "invalid_credentials"


class InvalidRefreshToken(AuthenticationFailed):
    default_detail = "Your session has expired. Please sign in again."
    default_code = "invalid_refresh"


_SAMESITE = cast(Literal["Lax", "Strict"], settings.REFRESH_COOKIE_SAMESITE)
_REFRESH_LIFETIME = cast(timedelta, settings.SIMPLE_JWT["REFRESH_TOKEN_LIFETIME"])


def _set_refresh_cookie(response: Response, refresh: str) -> None:
    response.set_cookie(
        settings.REFRESH_COOKIE_NAME,
        refresh,
        max_age=int(_REFRESH_LIFETIME.total_seconds()),
        httponly=True,
        secure=settings.REFRESH_COOKIE_SECURE,
        samesite=_SAMESITE,
        path=settings.REFRESH_COOKIE_PATH,
    )


def _clear_refresh_cookie(response: Response) -> None:
    response.delete_cookie(
        settings.REFRESH_COOKIE_NAME,
        path=settings.REFRESH_COOKIE_PATH,
        samesite=_SAMESITE,
    )


def _auth_response(user: User, http_status: int = status.HTTP_200_OK) -> Response:
    refresh = RefreshToken.for_user(user)
    response = Response(
        {"access": str(refresh.access_token), "user": MeSerializer(user).data},
        status=http_status,
    )
    _set_refresh_cookie(response, str(refresh))
    return response


class _PublicAuthView(APIView):
    authentication_classes: list[Any] = []
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "auth"

    def get_authenticate_header(self, request: Request) -> str:
        # Without this DRF turns our 401s into 403s, because these views have no
        # authentication classes to name a WWW-Authenticate scheme.
        return 'Bearer realm="api"'


class RegisterView(_PublicAuthView):
    """Create an operator account, its organization and the owner membership."""

    @extend_schema(request=RegisterSerializer, responses={201: AuthResponseSerializer})
    def post(self, request: Request) -> Response:
        serializer = RegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        with transaction.atomic():
            user = User.objects.create_user(
                email=data["email"],
                password=data["password"],
                full_name=data["full_name"],
                phone=data["phone"],
            )
            create_organization_with_owner(
                owner=user,
                name=data["organization_name"],
                contact_phone=data.get("contact_phone", "") or data["phone"],
            )
        # The account exists even if the SMS fails; the code screen offers "Resend".
        with contextlib.suppress(APIException):
            send_mobile_code(user)
        return _auth_response(user, status.HTTP_201_CREATED)


class SeekerRegisterView(_PublicAuthView):
    """Create an account for someone looking for a PG (no organization)."""

    @extend_schema(request=SeekerRegisterSerializer, responses={201: AuthResponseSerializer})
    def post(self, request: Request) -> Response:
        serializer = SeekerRegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        user = User.objects.create_user(
            email=data["email"],
            password=data["password"],
            full_name=data["full_name"],
            phone=data["phone"],
        )
        return _auth_response(user, status.HTTP_201_CREATED)


class LoginView(_PublicAuthView):
    @extend_schema(request=LoginSerializer, responses=AuthResponseSerializer)
    def post(self, request: Request) -> Response:
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = authenticate(
            request,
            email=serializer.validated_data["email"].strip().lower(),
            password=serializer.validated_data["password"],
        )
        if user is None:
            raise InvalidCredentials()
        return _auth_response(cast(User, user))


class RefreshView(_PublicAuthView):
    @extend_schema(request=None, responses=AccessTokenSerializer)
    def post(self, request: Request) -> Response:
        token = request.COOKIES.get(settings.REFRESH_COOKIE_NAME)
        if not token:
            raise InvalidRefreshToken()
        serializer = TokenRefreshSerializer(data={"refresh": token})
        try:
            serializer.is_valid(raise_exception=True)
        except TokenError as exc:
            raise InvalidRefreshToken() from exc
        except AuthenticationFailed as exc:  # user deleted or deactivated
            raise InvalidRefreshToken() from exc
        response = Response({"access": serializer.validated_data["access"]})
        new_refresh = serializer.validated_data.get("refresh")
        if new_refresh:
            _set_refresh_cookie(response, new_refresh)
        return response


class LogoutView(_PublicAuthView):
    @extend_schema(request=None, responses={204: None})
    def post(self, request: Request) -> Response:
        token = request.COOKIES.get(settings.REFRESH_COOKIE_NAME)
        if token:
            with contextlib.suppress(TokenError):  # already invalid: nothing to revoke
                RefreshToken(token).blacklist()  # type: ignore[arg-type]
        response = Response(status=status.HTTP_204_NO_CONTENT)
        _clear_refresh_cookie(response)
        return response


class MeView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(responses=MeSerializer)
    def get(self, request: Request) -> Response:
        return Response(MeSerializer(request.user).data)
