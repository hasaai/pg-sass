from __future__ import annotations

from typing import Any, cast

from django.db import transaction
from django.db.models import QuerySet
from django.shortcuts import get_object_or_404
from django.utils.decorators import method_decorator
from drf_spectacular.utils import OpenApiParameter, extend_schema, extend_schema_view
from rest_framework import mixins, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from apps.accounts.models import User
from apps.accounts.serializers import MeSerializer
from apps.platform.permissions import IsPlatformAdmin
from apps.verification import services, sms
from apps.verification.models import SmsGateway, SmsLog
from apps.verification.serializers import (
    ConfirmCodeSerializer,
    MobileStatusSerializer,
    SendCodeSerializer,
    SentSerializer,
    SmsGatewaySerializer,
    SmsLogSerializer,
    TestSmsResultSerializer,
    TestSmsSerializer,
)
from core.pagination import NumberedPagination
from core.params import choice_param
from core.secret_box import seal, unseal

PLATFORM = [IsAuthenticated, IsPlatformAdmin]


class _UserView(APIView):
    permission_classes = [IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "auth"


class MobileStatusView(_UserView):
    @extend_schema(responses=MobileStatusSerializer)
    def get(self, request: Request) -> Response:
        user = cast(User, request.user)
        return Response(
            MobileStatusSerializer(
                {
                    "phone": user.phone,
                    "phone_masked": sms.mask(user.phone) if user.phone else None,
                    "phone_verified": user.phone_verified_at is not None,
                    "resend_in": services.resend_in(user),
                }
            ).data
        )


class SendCodeView(_UserView):
    """Send a 6-digit code to the user's mobile, or to a new number they typed."""

    @extend_schema(request=SendCodeSerializer, responses=SentSerializer)
    def post(self, request: Request) -> Response:
        payload = SendCodeSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        user = cast(User, request.user)
        row = services.send_code(user, payload.validated_data.get("phone") or None)
        return Response(
            SentSerializer(
                {"phone_masked": sms.mask(row.phone), "resend_in": services.RESEND_SECONDS}
            ).data
        )


@method_decorator(transaction.non_atomic_requests, name="dispatch")
class ConfirmCodeView(_UserView):
    """Check the code. Not one request-wide transaction: a wrong try must be counted even
    though the answer is an error (which would otherwise roll the count back)."""

    @extend_schema(request=ConfirmCodeSerializer, responses=MeSerializer)
    def post(self, request: Request) -> Response:
        payload = ConfirmCodeSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        user = services.confirm_code(cast(User, request.user), payload.validated_data["code"])
        return Response(MeSerializer(user).data)


# ---------------------------------------------------------------- platform admin


class SmsGatewayViewSet(mixins.ListModelMixin, mixins.UpdateModelMixin, viewsets.GenericViewSet):
    permission_classes = PLATFORM
    platform_permission_map = {"*": "p.sms.manage"}
    serializer_class = SmsGatewaySerializer
    pagination_class = None
    lookup_field = "code"
    http_method_names = ["get", "patch", "post", "head", "options"]
    queryset = SmsGateway.objects.all()

    def perform_update(self, serializer: Any) -> None:
        row: SmsGateway = serializer.instance
        gateway = sms.get(row.code)
        typed = serializer.validated_data.pop("set_credentials", None)
        if typed is not None:
            allowed = {f.env for f in gateway.fields}
            unknown = sorted(set(typed) - allowed)
            if unknown:
                raise ValidationError(
                    {"set_credentials": f"{gateway.name} has no {', '.join(unknown)}."}
                )
            values = unseal(row.credentials)
            for env, value in typed.items():
                if value:
                    values[env] = value
                else:
                    values.pop(env, None)
            row.credentials = seal(values)
            row.save(update_fields=["credentials", "updated_at"])
        if serializer.validated_data.get("is_enabled") and not gateway.configured():
            raise ValidationError({"is_enabled": gateway.unavailable_reason()})
        serializer.save()

    @extend_schema(request=TestSmsSerializer, responses=TestSmsResultSerializer)
    @action(detail=True, methods=["post"])
    def test(self, request: Request, code: str | None = None) -> Response:
        row = get_object_or_404(SmsGateway, code=code)
        payload = TestSmsSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        phone = payload.validated_data["phone"]
        gateway = sms.get(row.code)
        if not gateway.configured():
            raise ValidationError({"phone": gateway.unavailable_reason()})
        try:
            reply_id, error, ok = gateway.send_code(phone, "123456"), "", True
        except sms.SmsError as err:
            reply_id, error, ok = "", str(err)[:255], False
        SmsLog.objects.create(
            phone_masked=sms.mask(phone),
            gateway=row.code,
            ok=ok,
            reply_id=reply_id,
            error=error,
            is_test=True,
        )
        return Response(
            TestSmsResultSerializer({"ok": ok, "reply_id": reply_id, "error": error}).data
        )


@extend_schema_view(
    list=extend_schema(
        parameters=[
            OpenApiParameter("gateway", str, required=False, enum=SmsGateway.Code.values),
            OpenApiParameter("ok", str, required=False, enum=["true", "false"]),
        ]
    )
)
class SmsLogViewSet(mixins.ListModelMixin, viewsets.GenericViewSet):
    permission_classes = PLATFORM
    platform_permission_map = {"*": "p.sms.manage"}
    serializer_class = SmsLogSerializer
    pagination_class = NumberedPagination

    def get_queryset(self) -> QuerySet[SmsLog]:
        rows = SmsLog.objects.all()
        gateway = choice_param(self.request, "gateway", SmsGateway.Code.values)
        ok = choice_param(self.request, "ok", ["true", "false"])
        if gateway:
            rows = rows.filter(gateway=gateway)
        if ok:
            rows = rows.filter(ok=ok == "true")
        return rows.order_by("-created_at")
