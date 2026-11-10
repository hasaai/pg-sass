"""Safe parsing of query-string filters (bad input is a 400, never a 500)."""

from __future__ import annotations

import datetime as dt
import uuid

from rest_framework.exceptions import ValidationError
from rest_framework.request import Request


def uuid_param(request: Request, name: str) -> uuid.UUID | None:
    raw = request.query_params.get(name)
    if not raw:
        return None
    try:
        return uuid.UUID(raw)
    except ValueError as exc:
        raise ValidationError({name: "Must be a valid id."}) from exc


def choice_param(request: Request, name: str, choices: list[str]) -> str | None:
    raw = request.query_params.get(name)
    if not raw:
        return None
    if raw not in choices:
        raise ValidationError({name: f"Must be one of: {', '.join(choices)}."})
    return raw


def month_param(request: Request, name: str = "period") -> dt.date | None:
    """Parse YYYY-MM into the first day of that month."""
    raw = request.query_params.get(name)
    if not raw:
        return None
    try:
        return dt.datetime.strptime(raw, "%Y-%m").date()
    except ValueError as exc:
        raise ValidationError({name: "Use the format YYYY-MM."}) from exc


def int_param(request: Request, name: str) -> int | None:
    raw = request.query_params.get(name)
    if not raw:
        return None
    try:
        return int(raw)
    except ValueError as exc:
        raise ValidationError({name: "Must be a whole number."}) from exc
