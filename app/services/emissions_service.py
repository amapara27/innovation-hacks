"""Deterministic transaction analysis and emissions estimation."""

from __future__ import annotations

from decimal import Decimal

from contracts.python.contracts import (
    AnalyzeTransactionsRequest,
    AnalyzeTransactionsResponse,
    AnalyzedTransaction,
    DEFAULT_TRANSACTION_LIMIT,
    EmissionCategory,
)

from app.core.constants import (
    CATEGORY_ORDER,
    EMISSION_FACTORS,
    KEYWORD_CATEGORY_MAP,
    MCC_CATEGORY_MAP,
    REFERENCE_ANALYZED_AT,
)
from app.core.deterministic import decimal_to_float, round_decimal
from app.models.domain import AnalysisSnapshot, RawTransaction
from app.services.transaction_provider import transaction_provider
from app.state.store import user_store


class EmissionsService:
    def _get_raw_ledger(self, wallet: str, plaid_access_token: str | None = None) -> list[RawTransaction]:
        return user_store.get_or_create_ledger(
            wallet,
            lambda: transaction_provider.get_transactions(wallet, plaid_access_token),
        )

    def classify_transaction(self, raw_transaction: RawTransaction) -> EmissionCategory:
        if raw_transaction.mcc_code and raw_transaction.mcc_code in MCC_CATEGORY_MAP:
            return MCC_CATEGORY_MAP[raw_transaction.mcc_code]

        lowered = raw_transaction.description.lower()
        for keywords, category in KEYWORD_CATEGORY_MAP:
            if any(keyword in lowered for keyword in keywords):
                return category
        return EmissionCategory.OTHER

    def _build_snapshot(
        self,
        wallet: str,
        limit: int,
        plaid_access_token: str | None = None,
    ) -> AnalysisSnapshot:
        ledger = self._get_raw_ledger(wallet, plaid_access_token)
        selected = ledger[:limit]

        category_breakdown = {category: Decimal("0") for category in CATEGORY_ORDER}
        category_spend = {category: Decimal("0") for category in CATEGORY_ORDER}
        analyzed_transactions: list[AnalyzedTransaction] = []
        total_spend = Decimal("0")
        total_co2e = Decimal("0")

        for raw_transaction in selected:
            category = self.classify_transaction(raw_transaction)
            emission_factor = EMISSION_FACTORS[category]
            co2e_grams = round_decimal(raw_transaction.amount_usd * emission_factor, 2)

            analyzed_transactions.append(
                AnalyzedTransaction(
                    transaction_id=raw_transaction.transaction_id,
                    description=raw_transaction.description,
                    amount_usd=decimal_to_float(raw_transaction.amount_usd, 2),
                    mcc_code=raw_transaction.mcc_code,
                    category=category,
                    co2e_grams=decimal_to_float(co2e_grams, 2),
                    emission_factor=decimal_to_float(emission_factor, 2),
                    date=raw_transaction.date,
                )
            )

            total_spend += raw_transaction.amount_usd
            total_co2e += co2e_grams
            category_spend[category] += raw_transaction.amount_usd
            category_breakdown[category] += co2e_grams

        response = AnalyzeTransactionsResponse(
            wallet=wallet,
            transaction_count=len(analyzed_transactions),
            total_co2e_grams=decimal_to_float(total_co2e, 2),
            category_breakdown={category: decimal_to_float(category_breakdown[category], 2) for category in CATEGORY_ORDER},
            transactions=analyzed_transactions,
            analyzed_at=REFERENCE_ANALYZED_AT,
        )

        return AnalysisSnapshot(
            response=response,
            total_spend_usd=round_decimal(total_spend, 2),
            total_co2e_grams=round_decimal(total_co2e, 2),
            category_spend_totals={category: round_decimal(category_spend[category], 2) for category in CATEGORY_ORDER},
            category_emission_totals={category: round_decimal(category_breakdown[category], 2) for category in CATEGORY_ORDER},
        )

    def analyze_transactions(self, request: AnalyzeTransactionsRequest) -> AnalyzeTransactionsResponse:
        cached = user_store.get_cached_analysis(request.wallet, request.limit)
        if cached:
            return cached

        snapshot = self._build_snapshot(
            wallet=request.wallet,
            limit=request.limit,
            plaid_access_token=request.plaid_access_token,
        )
        user_store.set_cached_analysis(request.wallet, request.limit, snapshot.response)
        return snapshot.response

    def get_canonical_snapshot(self, wallet: str) -> AnalysisSnapshot:
        return self._build_snapshot(wallet=wallet, limit=DEFAULT_TRANSACTION_LIMIT)


emissions_service = EmissionsService()
