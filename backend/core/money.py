"""Money is stored as integer paise. Helpers keep rounding in one place."""

from __future__ import annotations

from fractions import Fraction


def prorate(amount_paise: int, days_used: int, days_in_period: int) -> int:
    """Pro-rate an amount by days, rounding half up to the nearest paisa."""
    if days_in_period <= 0:
        raise ValueError("days_in_period must be positive")
    days_used = max(0, min(days_used, days_in_period))
    exact = Fraction(amount_paise * days_used, days_in_period)
    return int(exact + Fraction(1, 2))


def format_inr(paise: int) -> str:
    """₹1,23,456 or ₹12,500.50 (Indian digit grouping), for messages and emails."""
    rupees, rem = divmod(abs(paise), 100)
    digits = str(rupees)
    if len(digits) > 3:
        head, tail = digits[:-3], digits[-3:]
        groups: list[str] = []
        while len(head) > 2:
            groups.insert(0, head[-2:])
            head = head[:-2]
        if head:
            groups.insert(0, head)
        digits = ",".join(groups) + "," + tail
    sign = "-" if paise < 0 else ""
    return f"{sign}₹{digits}" + (f".{rem:02d}" if rem else "")
