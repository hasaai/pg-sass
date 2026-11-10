"""Safe file uploads: size limit, type check by content, random file names."""

from __future__ import annotations

import uuid
from pathlib import PurePath
from typing import Any

from django.conf import settings
from django.core.files.uploadedfile import UploadedFile
from rest_framework import serializers

IMAGE_TYPES = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}
DOCUMENT_TYPES = {**IMAGE_TYPES, "application/pdf": ".pdf"}

_SIGNATURES = {
    b"\xff\xd8\xff": "image/jpeg",
    b"\x89PNG\r\n\x1a\n": "image/png",
    b"%PDF-": "application/pdf",
}


def sniff_type(upload: UploadedFile) -> str | None:
    """Detect the real file type from its first bytes (never trust the file name)."""
    head = upload.read(16)
    upload.seek(0)
    if head[:4] == b"RIFF" and head[8:12] == b"WEBP":
        return "image/webp"
    for signature, kind in _SIGNATURES.items():
        if head.startswith(signature):
            return kind
    return None


def validate_upload(upload: UploadedFile, allowed: dict[str, str]) -> str:
    if upload.size is not None and upload.size > settings.MAX_UPLOAD_BYTES:
        limit = settings.MAX_UPLOAD_BYTES // (1024 * 1024)
        raise serializers.ValidationError(f"Files must be {limit} MB or smaller.")
    kind = sniff_type(upload)
    if kind not in allowed:
        names = ", ".join(sorted({ext.strip(".").upper() for ext in allowed.values()}))
        raise serializers.ValidationError(f"Upload a {names} file.")
    return kind


def listing_photo_path(instance: Any, filename: str) -> str:
    ext = PurePath(filename).suffix.lower()[:6]
    return f"public/listings/{instance.organization_id}/{uuid.uuid4().hex}{ext}"


def property_photo_path(instance: Any, filename: str) -> str:
    ext = PurePath(filename).suffix.lower()[:6]
    return f"public/properties/{instance.organization_id}/{uuid.uuid4().hex}{ext}"


def agreement_path(instance: Any, filename: str) -> str:
    ext = PurePath(filename).suffix.lower()[:6]
    return f"private/agreements/{instance.organization_id}/{uuid.uuid4().hex}{ext}"


def organization_logo_path(instance: Any, filename: str) -> str:
    ext = PurePath(filename).suffix.lower()[:6]
    return f"public/logos/{instance.pk}/{uuid.uuid4().hex}{ext}"


def property_logo_path(instance: Any, filename: str) -> str:
    ext = PurePath(filename).suffix.lower()[:6]
    return f"public/logos/{instance.organization_id}/property-{uuid.uuid4().hex}{ext}"


def property_document_path(instance: Any, filename: str) -> str:
    ext = PurePath(filename).suffix.lower()[:6]
    return f"private/property-documents/{instance.organization_id}/{uuid.uuid4().hex}{ext}"


def owner_document_path(instance: Any, filename: str) -> str:
    """Owner identity documents: private, random names, one folder per business."""
    name = f"{uuid.uuid4().hex}{_safe_ext(instance)}"
    return f"private/owner-documents/{instance.organization_id}/{name}"


def _safe_ext(instance: Any) -> str:
    # The extension comes from the detected file type, never from the uploaded name.
    return DOCUMENT_TYPES.get(getattr(instance, "content_type", ""), "")
