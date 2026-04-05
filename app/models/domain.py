"""Internal domain models used by the deterministic services."""

from __future__ import annotations

from dataclasses import dataclass, field
from decimal import Decimal

from contracts.python.contracts import (
    AnalyzeTransactionsResponse,
    CarbonCreditType,
    EmissionCategory,
    GreenScoreResponse,
    OffsetDecision,
    SwapDifficulty,
)


@dataclass(frozen=True)
class MerchantTemplate:
    description: str
    mcc_code: str | None
    base_amount_cents: int
    spread_cents: int


@dataclass(frozen=True)
class RawTransaction:
    transaction_id: str
    description: str
    amount_usd: Decimal
    mcc_code: str | None
    date: str


@dataclass(frozen=True)
class AnalysisSnapshot:
    response: AnalyzeTransactionsResponse
    total_spend_usd: Decimal
    total_co2e_grams: Decimal
    category_spend_totals: dict[EmissionCategory, Decimal]
    category_emission_totals: dict[EmissionCategory, Decimal]


@dataclass(frozen=True)
class ConfirmedOffsetRecord:
    co2e_grams: Decimal
    credit_type: CarbonCreditType


@dataclass(frozen=True)
class CreditProjectProfile:
    price_per_tonne_usd: Decimal
    project_name: str
    verification_standard: str


@dataclass(frozen=True)
class SuggestionRule:
    alternative_share: Decimal
    price_difference_usd: Decimal
    difficulty: SwapDifficulty
    current_description: str
    alternative_description: str


@dataclass(frozen=True)
class SuggestionNarrativeInput:
    current_category: EmissionCategory
    current_description: str
    alternative_description: str
    current_co2e_monthly: Decimal
    alternative_co2e_monthly: Decimal
    co2e_savings_monthly: Decimal
    price_difference_usd: Decimal
    difficulty: SwapDifficulty


@dataclass(frozen=True)
class SuggestionNarrativeText:
    current_description: str
    alternative_description: str


@dataclass
class UserState:
    raw_ledger: tuple[RawTransaction, ...] = ()
    analyzed_cache: dict[int, AnalyzeTransactionsResponse] = field(default_factory=dict)
    confirmed_offsets: list[ConfirmedOffsetRecord] = field(default_factory=list)
    score: GreenScoreResponse | None = None
    last_offset_decision: OffsetDecision | None = None
    narration_cache: dict[str, SuggestionNarrativeText] = field(default_factory=dict)
