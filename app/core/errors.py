"""Domain-specific exceptions for API business rules."""

from __future__ import annotations


class BusinessRuleError(Exception):
    """Raised when a deterministic business rule blocks request fulfillment."""
