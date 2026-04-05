"""Thread-safe in-memory state for the hackathon backend."""

from __future__ import annotations

from copy import deepcopy
from decimal import Decimal
from threading import RLock

from contracts.python.contracts import CarbonCreditType

from app.core.deterministic import to_decimal
from app.models.domain import (
    ConfirmedOffsetRecord,
    RawTransaction,
    SuggestionNarrativeText,
    UserState,
)


class InMemoryUserStore:
    def __init__(self) -> None:
        self._lock = RLock()
        self._state: dict[str, UserState] = {}

    def _get_or_create(self, wallet: str) -> UserState:
        return self._state.setdefault(wallet, UserState())

    def get_or_create_ledger(self, wallet: str, factory: callable) -> list[RawTransaction]:
        with self._lock:
            state = self._get_or_create(wallet)
            if not state.raw_ledger:
                state.raw_ledger = tuple(factory())
            return list(state.raw_ledger)

    def get_cached_analysis(self, wallet: str, limit: int):
        with self._lock:
            cached = self._get_or_create(wallet).analyzed_cache.get(limit)
            return cached.model_copy(deep=True) if cached else None

    def set_cached_analysis(self, wallet: str, limit: int, response) -> None:
        with self._lock:
            self._get_or_create(wallet).analyzed_cache[limit] = response.model_copy(deep=True)

    def list_confirmed_offsets(self, wallet: str) -> list[ConfirmedOffsetRecord]:
        with self._lock:
            return deepcopy(self._get_or_create(wallet).confirmed_offsets)

    def add_confirmed_offset(self, wallet: str, co2e_grams: Decimal | float | int, credit_type: CarbonCreditType) -> None:
        with self._lock:
            self._get_or_create(wallet).confirmed_offsets.append(
                ConfirmedOffsetRecord(co2e_grams=to_decimal(co2e_grams), credit_type=credit_type)
            )

    def set_score(self, wallet: str, score) -> None:
        with self._lock:
            self._get_or_create(wallet).score = score.model_copy(deep=True)

    def set_last_offset_decision(self, wallet: str, decision) -> None:
        with self._lock:
            self._get_or_create(wallet).last_offset_decision = decision.model_copy(deep=True)

    def get_narration(self, wallet: str, key: str) -> SuggestionNarrativeText | None:
        with self._lock:
            return deepcopy(self._get_or_create(wallet).narration_cache.get(key))

    def set_narration(self, wallet: str, key: str, narration: SuggestionNarrativeText) -> None:
        with self._lock:
            self._get_or_create(wallet).narration_cache[key] = deepcopy(narration)

    def reset(self) -> None:
        with self._lock:
            self._state.clear()


user_store = InMemoryUserStore()
