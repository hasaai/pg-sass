"""One error format for every API failure.

{"error": {"code": "validation_error", "message": "...", "fields": {...}}}
"""

from __future__ import annotations

from typing import Any

from django.core.exceptions import PermissionDenied as DjangoPermissionDenied
from django.db.models import ProtectedError, RestrictedError
from django.http import Http404
from rest_framework.exceptions import APIException, ValidationError
from rest_framework.response import Response
from rest_framework.views import exception_handler


def api_exception_handler(exc: Exception, context: dict[str, Any]) -> Response | None:
    if isinstance(exc, ProtectedError | RestrictedError):
        return Response(
            {
                "error": {
                    "code": "in_use",
                    "message": "This record is still in use and cannot be deleted.",
                    "fields": {},
                }
            },
            status=409,
        )
    response = exception_handler(exc, context)
    if response is None:
        return None  # unhandled -> Django returns a 500 and Sentry/logs capture it

    if isinstance(exc, ValidationError):
        data = response.data
        fields = data if isinstance(data, dict) else {"non_field_errors": data}
        response.data = {
            "error": {"code": "validation_error", "message": "Invalid input.", "fields": fields}
        }
        return response

    code = "error"
    message = "Request failed."
    if isinstance(exc, Http404):
        code, message = "not_found", "Not found."
    elif isinstance(exc, DjangoPermissionDenied):
        code, message = "permission_denied", "You do not have permission to perform this action."
    elif isinstance(exc, APIException):
        codes = exc.get_codes()
        code = codes if isinstance(codes, str) else exc.default_code
        detail = exc.detail
        message = str(detail) if not isinstance(detail, dict | list) else str(exc.default_detail)
    response.data = {"error": {"code": code, "message": message, "fields": {}}}
    return response
