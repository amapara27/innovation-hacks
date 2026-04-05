"""Deterministic offset decision engine."""

from __future__ import annotations

from decimal import Decimal

from contracts.python.contracts import (
    DEFAULT_TRANSACTION_LIMIT,
    OffsetDecision,
    OffsetStatus,
    TriggerOffsetRequest,
    TriggerOffsetResponse,
)

from app.core.constants import CATEGORY_ORDER, CATEGORY_ORDER_INDEX, CREDIT_PROFILES, DOMINANT_CATEGORY_CREDIT_MAP
from app.core.deterministic import decimal_to_float, floor_decimal, round_decimal, to_decimal
from app.core.errors import BusinessRuleError
from app.services.emissions_service import emissions_service
from app.state.store import user_store


class OffsetService:
    def _select_dominant_category(self, category_totals: dict) -> object:
        ranked = sorted(
            CATEGORY_ORDER,
            key=lambda category: (-category_totals[category], CATEGORY_ORDER_INDEX[category]),
        )
        return ranked[0]

    def trigger_offset(self, request: TriggerOffsetRequest) -> TriggerOffsetResponse:
        snapshot = emissions_service.get_canonical_snapshot(request.wallet)
        confirmed_offsets = user_store.list_confirmed_offsets(request.wallet)
        confirmed_offset_grams = sum((offset.co2e_grams for offset in confirmed_offsets), start=Decimal("0"))
        outstanding_grams = snapshot.total_co2e_grams - confirmed_offset_grams
        if outstanding_grams < Decimal("1"):
            raise BusinessRuleError("No outstanding emissions remain to offset for this wallet.")

        dominant_category = self._select_dominant_category(snapshot.category_emission_totals)
        selected_credit_type = (
            request.preferred_credit_type
            if request.preferred_credit_type is not None
            else DOMINANT_CATEGORY_CREDIT_MAP[dominant_category]
        )
        selected_profile = CREDIT_PROFILES[selected_credit_type]
        budget_usd = to_decimal(request.budget_usd)
        affordable_grams = floor_decimal((budget_usd / selected_profile.price_per_tonne_usd) * Decimal("1000000"))

        if request.preferred_credit_type is None and affordable_grams < 1:
            raise BusinessRuleError("The provided budget cannot purchase at least 1 gram of the selected credit.")
        if request.preferred_credit_type is not None and affordable_grams < 1:
            fallback_credit_type = DOMINANT_CATEGORY_CREDIT_MAP[dominant_category]
            fallback_profile = CREDIT_PROFILES[fallback_credit_type]
            fallback_affordable_grams = floor_decimal((budget_usd / fallback_profile.price_per_tonne_usd) * Decimal("1000000"))
            if fallback_affordable_grams < 1:
                raise BusinessRuleError("The provided budget cannot purchase at least 1 gram of carbon credits.")
            selected_credit_type = fallback_credit_type
            selected_profile = fallback_profile
            affordable_grams = fallback_affordable_grams

        co2e_grams = min(outstanding_grams, affordable_grams)
        if co2e_grams < 1:
            raise BusinessRuleError("The provided budget cannot purchase at least 1 gram of carbon credits.")

        cost_usd = round_decimal(
            selected_profile.price_per_tonne_usd * co2e_grams / Decimal("1000000"),
            2,
        )
        decision = OffsetDecision(
            credit_type=selected_credit_type,
            co2e_grams=decimal_to_float(co2e_grams, 2),
            cost_usd=decimal_to_float(cost_usd, 2),
            price_per_tonne_usd=decimal_to_float(selected_profile.price_per_tonne_usd, 2),
            project_name=selected_profile.project_name,
            verification_standard=selected_profile.verification_standard,
        )
        user_store.set_last_offset_decision(request.wallet, decision)
        return TriggerOffsetResponse(
            wallet=request.wallet,
            decision=decision,
            status=OffsetStatus.PENDING,
            toucan_tx_hash=None,
        )


offset_service = OffsetService()
