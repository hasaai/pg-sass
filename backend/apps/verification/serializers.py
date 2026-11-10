from __future__ import annotations

from typing import Any

from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from apps.verification import sms
from apps.verification.models import SmsGateway, SmsLog
from core.validators import normalize_indian_mobile


class SendCodeSerializer(serializers.Serializer):
    phone = serializers.CharField(max_length=20, required=False, allow_blank=True)

    def validate_phone(self, value: str) -> str:
        return normalize_indian_mobile(value) if value.strip() else ""


class SentSerializer(serializers.Serializer):
    phone_masked = serializers.CharField()
    resend_in = serializers.IntegerField()


class ConfirmCodeSerializer(serializers.Serializer):
    code = serializers.RegexField(
        r"^\s*\d{6}\s*$", error_messages={"invalid": "Enter the 6-digit code."}
    )


class MobileStatusSerializer(serializers.Serializer):
    phone = serializers.CharField(allow_null=True)
    phone_masked = serializers.CharField(allow_null=True)
    phone_verified = serializers.BooleanField()
    resend_in = serializers.IntegerField()


class GatewayFieldSerializer(serializers.Serializer):
    env = serializers.CharField()
    label = serializers.CharField()  # type: ignore[assignment]
    required = serializers.BooleanField()  # type: ignore[assignment]
    secret = serializers.BooleanField()
    hint = serializers.CharField()
    is_set = serializers.BooleanField()
    set_in = serializers.CharField(help_text="portal, env or empty")
    display = serializers.CharField(help_text="Masked for secrets; never the whole key")


def display_value(value: str, secret: bool) -> str:
    if not value:
        return ""
    if not secret:
        return value
    if len(value) <= 8:
        return f"{len(value)} characters"
    return f"ending …{value[-4:]} ({len(value)} characters)"


class SmsGatewaySerializer(serializers.ModelSerializer):
    name = serializers.CharField(source="get_code_display", read_only=True)
    configured = serializers.SerializerMethodField()
    unavailable_reason = serializers.SerializerMethodField()
    help = serializers.SerializerMethodField()
    settings_needed = serializers.SerializerMethodField()
    warnings = serializers.SerializerMethodField()
    set_credentials = serializers.DictField(
        child=serializers.CharField(allow_blank=True, trim_whitespace=True, max_length=200),
        write_only=True,
        required=False,
        help_text="{SETTING: value}; an empty value removes what was typed in the portal",
    )

    class Meta:
        model = SmsGateway
        fields = [
            "code",
            "name",
            "position",
            "is_enabled",
            "configured",
            "unavailable_reason",
            "help",
            "settings_needed",
            "warnings",
            "set_credentials",
            "last_ok_at",
            "last_error_at",
            "last_error",
        ]
        read_only_fields = [
            "code",
            "name",
            "configured",
            "unavailable_reason",
            "help",
            "settings_needed",
            "warnings",
            "last_ok_at",
            "last_error_at",
            "last_error",
        ]

    def get_warnings(self, obj: SmsGateway) -> list[str]:
        return sms.get(obj.code).warnings()

    def get_configured(self, obj: SmsGateway) -> bool:
        return sms.get(obj.code).configured()

    def get_unavailable_reason(self, obj: SmsGateway) -> str:
        return sms.get(obj.code).unavailable_reason()

    def get_help(self, obj: SmsGateway) -> str:
        return sms.get(obj.code).help

    @extend_schema_field(GatewayFieldSerializer(many=True))
    def get_settings_needed(self, obj: SmsGateway) -> list[dict[str, Any]]:
        gateway = sms.get(obj.code)
        return [
            {
                "env": f.env,
                "label": f.label,
                "required": f.required,
                "secret": f.secret,
                "hint": f.hint,
                "is_set": bool(gateway._value(f.env)),
                "set_in": gateway.source(f.env),
                "display": display_value(gateway._value(f.env), f.secret),
            }
            for f in gateway.fields
        ]


class TestSmsSerializer(serializers.Serializer):
    phone = serializers.CharField(max_length=20)

    def validate_phone(self, value: str) -> str:
        return normalize_indian_mobile(value)


class TestSmsResultSerializer(serializers.Serializer):
    ok = serializers.BooleanField()
    reply_id = serializers.CharField(allow_blank=True)
    error = serializers.CharField(allow_blank=True)


class SmsLogSerializer(serializers.ModelSerializer):
    gateway_label = serializers.CharField(source="get_gateway_display", read_only=True)

    class Meta:
        model = SmsLog
        fields = [
            "id",
            "created_at",
            "phone_masked",
            "gateway",
            "gateway_label",
            "ok",
            "reply_id",
            "error",
            "is_test",
        ]
        read_only_fields = fields
