"""Deterministic swap suggestions with optional narrated phrasing."""

from __future__ import annotations

from decimal import Decimal
from hashlib import sha256

from contracts.python.contracts import (
    DEFAULT_TRANSACTION_LIMIT,
    EmissionCategory,
    SwapSuggestion,
    SwapSuggestionsRequest,
    SwapSuggestionsResponse,
)

from app.core.constants import CATEGORY_ORDER, CATEGORY_ORDER_INDEX, SUGGESTION_RULES
from app.core.deterministic import decimal_to_float, round_decimal
from app.models.domain import SuggestionNarrativeInput
from app.services.emissions_service import emissions_service
from app.services.narrator_service import openai_narrator, template_narrator
from app.state.store import user_store


class SuggestionsService:
    def __init__(self) -> None:
        self._openai_narrator = openai_narrator
        self._template_narrator = template_narrator

    def _rank_categories(self, category_totals: dict[EmissionCategory, Decimal], categories: list[EmissionCategory] | None) -> list[EmissionCategory]:
        requested = categories or CATEGORY_ORDER
        ranked = sorted(
            requested,
            key=lambda category: (-category_totals[category], CATEGORY_ORDER_INDEX[category]),
        )
        if len(ranked) >= 3:
            return ranked[:5]

        seen = set(ranked)
        backfill = [
            category
            for category in sorted(
                CATEGORY_ORDER,
                key=lambda item: (-category_totals[item], CATEGORY_ORDER_INDEX[item]),
            )
            if category not in seen
        ]
        return (ranked + backfill)[:5]

    def _narrate(self, wallet: str, payload: SuggestionNarrativeInput):
        cache_key = sha256(
            (
                f"{payload.current_category.value}|{payload.current_co2e_monthly}|"
                f"{payload.alternative_co2e_monthly}|{payload.co2e_savings_monthly}|"
                f"{payload.price_difference_usd}|{payload.difficulty.value}"
            ).encode("utf-8")
        ).hexdigest()
        cached = user_store.get_narration(wallet, cache_key)
        if cached:
            return cached

        narrator = self._template_narrator
        if self._openai_narrator.is_configured():
            try:
                narrated = self._openai_narrator.narrate(payload)
            except Exception:
                narrated = narrator.narrate(payload)
        else:
            narrated = narrator.narrate(payload)
        user_store.set_narration(wallet, cache_key, narrated)
        return narrated

    def get_swap_suggestions(self, request: SwapSuggestionsRequest) -> SwapSuggestionsResponse:
        snapshot = emissions_service.get_canonical_snapshot(request.wallet)
        ranked_categories = self._rank_categories(snapshot.category_emission_totals, request.categories)

        suggestions: list[SwapSuggestion] = []
        total_savings = Decimal("0")
        for category in ranked_categories:
            rule = SUGGESTION_RULES[category]
            current_co2e = snapshot.category_emission_totals[category]
            alternative_co2e = round_decimal(current_co2e * rule.alternative_share, 2)
            savings = round_decimal(current_co2e - alternative_co2e, 2)

            narration_input = SuggestionNarrativeInput(
                current_category=category,
                current_description=rule.current_description,
                alternative_description=rule.alternative_description,
                current_co2e_monthly=current_co2e,
                alternative_co2e_monthly=alternative_co2e,
                co2e_savings_monthly=savings,
                price_difference_usd=rule.price_difference_usd,
                difficulty=rule.difficulty,
            )
            narration = self._narrate(request.wallet, narration_input)

            suggestions.append(
                SwapSuggestion(
                    current_category=category,
                    current_description=narration.current_description,
                    current_co2e_monthly=decimal_to_float(current_co2e, 2),
                    alternative_description=narration.alternative_description,
                    alternative_co2e_monthly=decimal_to_float(alternative_co2e, 2),
                    co2e_savings_monthly=decimal_to_float(savings, 2),
                    price_difference_usd=decimal_to_float(rule.price_difference_usd, 2),
                    difficulty=rule.difficulty,
                )
            )
            total_savings += savings

        return SwapSuggestionsResponse(
            wallet=request.wallet,
            suggestions=suggestions,
            total_potential_savings_monthly=decimal_to_float(total_savings, 2),
        )


suggestions_service = SuggestionsService()
