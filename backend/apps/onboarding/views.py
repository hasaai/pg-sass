"""Owner sign-up and sign-in by mobile, profile, and email confirmation."""

from __future__ import annotations

import contextlib
from typing import Any, cast

from django.conf import settings
from django.db import transaction
from django.http import FileResponse
from django.utils.decorators import method_decorator
from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.exceptions import APIException, NotFound
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from apps.accounts.models import User
from apps.accounts.serializers import AuthResponseSerializer, MeSerializer
from apps.accounts.views import _auth_response, _PublicAuthView
from apps.onboarding import owner_checks, services
from apps.onboarding.models import OwnerDocument, OwnerVerification
from apps.onboarding.serializers import (
    CodeSentSerializer,
    EmailConfirmSerializer,
    EmailSentSerializer,
    MobileLoginFinishSerializer,
    MobileLoginStartSerializer,
    OwnerCheckSerializer,
    OwnerCheckUpdateSerializer,
    OwnerDocumentSerializer,
    OwnerDocumentUploadSerializer,
    ProfileSerializer,
    ProfileViewSerializer,
    SignupFinishSerializer,
    SignupStartSerializer,
)
from apps.verification import services as codes
from apps.verification import sms
from core.views import OrgScopedAPIView


def _sent(number: str) -> Response:
    return Response(
        CodeSentSerializer(
            # Always the full wait, so the answer never shows whether the number is known.
            {"phone_masked": sms.mask(number), "resend_in": codes.RESEND_SECONDS}
        ).data
    )


class SignupStartView(_PublicAuthView):
    """Step 1: agree to Terms and Privacy, give a mobile; a 6-digit code is sent."""

    @extend_schema(request=SignupStartSerializer, responses=CodeSentSerializer)
    def post(self, request: Request) -> Response:
        payload = SignupStartSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        data = payload.validated_data
        services.check_required_consent(data["accept_terms"], data["accept_privacy"])
        return _sent(services.start_signup(data["phone"]))


@method_decorator(transaction.non_atomic_requests, name="dispatch")
class SignupFinishView(_PublicAuthView):
    """Step 2: the right code makes the account (or signs in the one already using it)."""

    @extend_schema(request=SignupFinishSerializer, responses={201: AuthResponseSerializer})
    def post(self, request: Request) -> Response:
        payload = SignupFinishSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        data = payload.validated_data
        user, created = services.finish_signup(
            phone=data["phone"],
            code=data["code"],
            accept_terms=data["accept_terms"],
            accept_privacy=data["accept_privacy"],
            marketing=data["marketing"],
            request=request,
        )
        return _auth_response(user, status.HTTP_201_CREATED if created else status.HTTP_200_OK)


class MobileLoginStartView(_PublicAuthView):
    @extend_schema(request=MobileLoginStartSerializer, responses=CodeSentSerializer)
    def post(self, request: Request) -> Response:
        payload = MobileLoginStartSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        return _sent(services.start_mobile_login(payload.validated_data["phone"]))


@method_decorator(transaction.non_atomic_requests, name="dispatch")
class MobileLoginFinishView(_PublicAuthView):
    @extend_schema(request=MobileLoginFinishSerializer, responses=AuthResponseSerializer)
    def post(self, request: Request) -> Response:
        payload = MobileLoginFinishSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        data = payload.validated_data
        return _auth_response(services.finish_mobile_login(data["phone"], data["code"]))


class ProfileView(APIView):
    """The owner's name, email and business. Needs only a signed-in account."""

    permission_classes = [IsAuthenticated]

    def _view(self, user: User) -> Response:
        return Response(
            ProfileViewSerializer(
                {
                    "full_name": user.full_name,
                    "email": user.email,
                    "email_verified": user.email_verified_at is not None,
                    "phone_masked": sms.mask(user.phone) if user.phone else None,
                    "has_business": services.has_business(user),
                    "marketing": services.current_consent(user)["marketing"],
                    "terms_version": settings.TERMS_VERSION,
                    "privacy_version": settings.PRIVACY_VERSION,
                }
            ).data
        )

    @extend_schema(responses=ProfileViewSerializer)
    def get(self, request: Request) -> Response:
        return self._view(cast(User, request.user))

    @extend_schema(request=ProfileSerializer, responses=MeSerializer)
    def put(self, request: Request) -> Response:
        payload = ProfileSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        data = payload.validated_data
        user = services.save_profile(
            user=cast(User, request.user),
            full_name=data["full_name"],
            email=data["email"],
            business_name=data.get("business_name", ""),
            marketing=data.get("marketing"),
            request=request,
        )
        return Response(MeSerializer(user).data)


class EmailSendView(APIView):
    """Email the confirmation link again."""

    permission_classes = [IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "auth"

    @extend_schema(request=None, responses=EmailSentSerializer)
    def post(self, request: Request) -> Response:
        sent = False
        with contextlib.suppress(APIException):
            sent = services.send_email_link(cast(User, request.user))
        return Response(EmailSentSerializer({"sent": sent}).data)


class EmailConfirmView(_PublicAuthView):
    """Open the link from the email (signed in or not)."""

    @extend_schema(request=EmailConfirmSerializer, responses=EmailSentSerializer)
    def post(self, request: Request) -> Response:
        payload = EmailConfirmSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        services.confirm_email(payload.validated_data["token"])
        return Response(EmailSentSerializer({"sent": True}).data)


# ---------------------------------------------------------------- owner identity check


def _check_payload(check: OwnerVerification) -> dict[str, Any]:
    return OwnerCheckSerializer(
        {
            "status": check.status,
            "get_status_display": check.get_status_display(),
            "id_type": check.id_type,
            "id_last4": check.id_last4,
            "name_on_id": check.name_on_id,
            "submitted_at": check.submitted_at,
            "decided_at": check.decided_at,
            "reviewer_note": check.reviewer_note,
            "can_edit": check.status in owner_checks.EDITABLE,
            "missing": owner_checks.missing(check),
            "documents": list(check.documents.order_by("created_at")),
            "events": list(check.events.order_by("-created_at")),
        }
    ).data


class _OwnerCheckBase(OrgScopedAPIView):
    def _check(self, request: Request) -> OwnerVerification:
        return owner_checks.for_membership(request.membership)  # type: ignore[attr-defined]

    def _document(self, request: Request, pk: str) -> OwnerDocument:
        doc = OwnerDocument.objects.filter(
            pk=pk,
            verification=self._check(request),
            organization=request.organization,  # type: ignore[attr-defined]
        ).first()
        if doc is None:
            raise NotFound("File not found.")
        return doc


class OwnerCheckView(_OwnerCheckBase):
    """The owner's identity check: details, files, status and history. Never blocks the app."""

    permission_map = {"GET": "owner.verification", "PATCH": "owner.verification"}

    @extend_schema(responses=OwnerCheckSerializer)
    def get(self, request: Request) -> Response:
        return Response(_check_payload(self._check(request)))

    @extend_schema(request=OwnerCheckUpdateSerializer, responses=OwnerCheckSerializer)
    def patch(self, request: Request) -> Response:
        payload = OwnerCheckUpdateSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        check = owner_checks.update_details(
            self._check(request), cast(User, request.user), **payload.validated_data
        )
        return Response(_check_payload(check))


class OwnerCheckSubmitView(_OwnerCheckBase):
    permission_map = {"POST": "owner.verification"}

    @extend_schema(request=None, responses=OwnerCheckSerializer)
    def post(self, request: Request) -> Response:
        check = owner_checks.submit(self._check(request), cast(User, request.user))
        return Response(_check_payload(check))


class OwnerDocumentsView(_OwnerCheckBase):
    permission_map = {"POST": "owner.verification"}
    parser_classes = [MultiPartParser, FormParser]

    @extend_schema(
        request={"multipart/form-data": OwnerDocumentUploadSerializer},
        responses={201: OwnerDocumentSerializer},
    )
    def post(self, request: Request) -> Response:
        payload = OwnerDocumentUploadSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        doc = owner_checks.add_document(
            self._check(request),
            cast(User, request.user),
            upload=payload.validated_data["file"],
            kind=payload.validated_data["kind"],
        )
        return Response(OwnerDocumentSerializer(doc).data, status=status.HTTP_201_CREATED)


class OwnerDocumentView(_OwnerCheckBase):
    permission_map = {"DELETE": "owner.verification"}

    @extend_schema(responses={204: None})
    def delete(self, request: Request, pk: str) -> Response:
        owner_checks.remove_document(self._document(request, pk), cast(User, request.user))
        return Response(status=status.HTTP_204_NO_CONTENT)


class OwnerDocumentDownloadView(_OwnerCheckBase):
    permission_map = {"GET": "owner.verification"}

    @extend_schema(responses={(200, "application/octet-stream"): bytes})
    def get(self, request: Request, pk: str) -> FileResponse:
        doc = self._document(request, pk)
        owner_checks.log_download(doc, cast(User, request.user), by_platform=False)
        return FileResponse(doc.file.open("rb"), as_attachment=True, filename=doc.file_name)
