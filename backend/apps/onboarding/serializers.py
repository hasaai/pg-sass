from __future__ import annotations

from rest_framework import serializers

from apps.onboarding.models import OwnerDocument, OwnerVerification


class SignupStartSerializer(serializers.Serializer):
    phone = serializers.CharField(max_length=20)
    accept_terms = serializers.BooleanField(default=False)
    accept_privacy = serializers.BooleanField(default=False)


class SignupFinishSerializer(SignupStartSerializer):
    code = serializers.CharField(max_length=10)
    marketing = serializers.BooleanField(default=False)


class MobileLoginStartSerializer(serializers.Serializer):
    phone = serializers.CharField(max_length=20)


class MobileLoginFinishSerializer(MobileLoginStartSerializer):
    code = serializers.CharField(max_length=10)


class CodeSentSerializer(serializers.Serializer):
    phone_masked = serializers.CharField()
    resend_in = serializers.IntegerField()


class ProfileSerializer(serializers.Serializer):
    full_name = serializers.CharField(max_length=150, allow_blank=True)
    email = serializers.CharField(max_length=254, allow_blank=True)
    business_name = serializers.CharField(max_length=150, required=False, allow_blank=True)
    marketing = serializers.BooleanField(required=False)


class ProfileViewSerializer(serializers.Serializer):
    full_name = serializers.CharField()
    email = serializers.CharField(allow_null=True)
    email_verified = serializers.BooleanField()
    phone_masked = serializers.CharField(allow_null=True)
    has_business = serializers.BooleanField()
    marketing = serializers.BooleanField()
    terms_version = serializers.CharField()
    privacy_version = serializers.CharField()


class EmailConfirmSerializer(serializers.Serializer):
    token = serializers.CharField(max_length=500)


class EmailSentSerializer(serializers.Serializer):
    sent = serializers.BooleanField()


# ---------------------------------------------------------------- owner identity check


class OwnerDocumentSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    kind = serializers.CharField()
    kind_label = serializers.CharField(source="get_kind_display")
    file_name = serializers.CharField()
    size_bytes = serializers.IntegerField()
    content_type = serializers.CharField()
    created_at = serializers.DateTimeField()


class OwnerCheckEventSerializer(serializers.Serializer):
    status = serializers.CharField()
    status_label = serializers.CharField(source="get_status_display")
    note = serializers.CharField()
    by_platform = serializers.BooleanField()
    created_at = serializers.DateTimeField()


class OwnerCheckSerializer(serializers.Serializer):
    status = serializers.CharField()
    status_label = serializers.CharField(source="get_status_display")
    id_type = serializers.CharField()
    id_last4 = serializers.CharField()
    name_on_id = serializers.CharField()
    submitted_at = serializers.DateTimeField(allow_null=True)
    decided_at = serializers.DateTimeField(allow_null=True)
    reviewer_note = serializers.CharField()
    can_edit = serializers.BooleanField()
    missing = serializers.ListField(child=serializers.CharField())
    documents = OwnerDocumentSerializer(many=True)
    events = OwnerCheckEventSerializer(many=True)


class OwnerCheckUpdateSerializer(serializers.Serializer):
    id_type = serializers.ChoiceField(
        choices=OwnerVerification.IdType.choices,
        allow_blank=True,
        required=False,
    )
    id_last4 = serializers.CharField(max_length=10, required=False, allow_blank=True)
    name_on_id = serializers.CharField(max_length=150, required=False, allow_blank=True)


class OwnerDocumentUploadSerializer(serializers.Serializer):
    kind = serializers.ChoiceField(choices=OwnerDocument.Kind.values)
    file = serializers.FileField(help_text="PDF, JPG, PNG or WebP up to 5 MB")
