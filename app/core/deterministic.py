"""Decimal helpers used to keep calculations deterministic."""

from __future__ import annotations

from decimal import Decimal, ROUND_FLOOR, ROUND_HALF_UP


def to_decimal(value: object) -> Decimal:
    return Decimal(str(value))


def round_decimal(value: Decimal, places: int = 2) -> Decimal:
    quantum = Decimal("1").scaleb(-places)
    return value.quantize(quantum, rounding=ROUND_HALF_UP)


def floor_decimal(value: Decimal) -> Decimal:
    return value.to_integral_value(rounding=ROUND_FLOOR)


def clamp_decimal(value: Decimal, minimum: Decimal | int | float, maximum: Decimal | int | float) -> Decimal:
    lower = to_decimal(minimum)
    upper = to_decimal(maximum)
    if value < lower:
        return lower
    if value > upper:
        return upper
    return value


def decimal_to_float(value: Decimal, places: int = 2) -> float:
    return float(round_decimal(value, places))
