"""Green score computation built on deterministic transaction analysis."""

from __future__ import annotations

from decimal import Decimal

from contracts.python.contracts import (
    DEFAULT_TRANSACTION_LIMIT,
    GREEN_SCORE_MAX,
    GREEN_SCORE_MIN,
    GREEN_SCORE_TIER_THRESHOLDS,
    GREEN_SCORE_WEIGHTS,
    GreenScoreBreakdown,
    GreenScoreRequest,
    GreenScoreResponse,
    GreenScoreTier,
)

from app.core.constants import CATEGORY_ORDER, ESSENTIAL_CATEGORIES, SUSTAINABILITY_POINTS
from app.core.deterministic import clamp_decimal, decimal_to_float, round_decimal, to_decimal
from app.services.emissions_service import emissions_service
from app.state.store import user_store


def clamp_green_score(score: Decimal | float | int) -> Decimal:
    return clamp_decimal(to_decimal(score), GREEN_SCORE_MIN, GREEN_SCORE_MAX)


def resolve_green_score_tier(score: Decimal | float | int) -> GreenScoreTier:
    normalized = clamp_green_score(score)
    for tier in GreenScoreTier:
        threshold = GREEN_SCORE_TIER_THRESHOLDS[tier.value]
        if to_decimal(threshold["min"]) <= normalized <= to_decimal(threshold["max"]):
            return tier
    return GreenScoreTier.EARTH_GUARDIAN


def compute_weighted_score(breakdown: GreenScoreBreakdown | dict[str, float]) -> Decimal:
    payload = breakdown.model_dump(by_alias=True) if isinstance(breakdown, GreenScoreBreakdown) else breakdown
    weighted = Decimal("0")
    for key, weight in GREEN_SCORE_WEIGHTS.items():
        weighted += to_decimal(payload[key]) * to_decimal(weight)
    return weighted


class ScoringService:
    def score_wallet(self, request: GreenScoreRequest) -> GreenScoreResponse:
        snapshot = emissions_service.get_canonical_snapshot(request.wallet)
        confirmed_offsets = user_store.list_confirmed_offsets(request.wallet)
        confirmed_offset_grams = sum((offset.co2e_grams for offset in confirmed_offsets), start=Decimal("0"))
        offset_count = len(confirmed_offsets)

        if snapshot.total_spend_usd == 0:
            transaction_efficiency = Decimal("100")
            spending_habits = Decimal("100")
            essential_spend_share = Decimal("0")
        else:
            intensity = snapshot.total_co2e_grams / snapshot.total_spend_usd
            transaction_efficiency = clamp_decimal(
                Decimal("100") * (Decimal("400") - intensity) / Decimal("325"),
                0,
                100,
            )
            weighted_points = Decimal("0")
            essential_spend = Decimal("0")
            for category in CATEGORY_ORDER:
                spend = snapshot.category_spend_totals[category]
                weighted_points += spend * SUSTAINABILITY_POINTS[category]
                if category in ESSENTIAL_CATEGORIES:
                    essential_spend += spend
            spending_habits = weighted_points / snapshot.total_spend_usd
            essential_spend_share = essential_spend / snapshot.total_spend_usd

        if snapshot.total_co2e_grams == 0:
            carbon_offsets = Decimal("100") if confirmed_offset_grams == 0 else Decimal("100")
        else:
            carbon_offsets = clamp_decimal(
                (confirmed_offset_grams / snapshot.total_co2e_grams) * Decimal("100"),
                0,
                100,
            )

        community_impact = clamp_decimal(
            Decimal("20")
            + (Decimal("50") * essential_spend_share)
            + (Decimal("30") * Decimal(min(offset_count, 3)) / Decimal("3")),
            0,
            100,
        )

        breakdown = GreenScoreBreakdown(
            transaction_efficiency=decimal_to_float(transaction_efficiency, 2),
            spending_habits=decimal_to_float(spending_habits, 2),
            carbon_offsets=decimal_to_float(carbon_offsets, 2),
            community_impact=decimal_to_float(community_impact, 2),
        )

        score = round_decimal(clamp_green_score(compute_weighted_score(breakdown)), 2)
        response = GreenScoreResponse(
            wallet=request.wallet,
            score=decimal_to_float(score, 2),
            tier=resolve_green_score_tier(score),
            breakdown=breakdown,
            rank=None,
            total_users=None,
        )
        user_store.set_score(request.wallet, response)
        return response


scoring_service = ScoringService()
