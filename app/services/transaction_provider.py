"""Transaction provider abstraction with deterministic seeded fallback."""

from __future__ import annotations

from abc import ABC, abstractmethod
from datetime import timedelta
from hashlib import sha256

from contracts.python.contracts import MAX_TRANSACTION_LIMIT

from app.core.constants import LEDGER_END, LEDGER_INTERVAL_HOURS, MERCHANT_CATALOG
from app.core.deterministic import round_decimal, to_decimal
from app.models.domain import RawTransaction


class TransactionProvider(ABC):
    @abstractmethod
    def is_configured(self) -> bool:
        """Return whether the provider can serve live transaction data."""

    @abstractmethod
    def get_transactions(self, wallet: str, plaid_access_token: str | None = None) -> list[RawTransaction]:
        """Return canonical transactions for a wallet."""


class PlaidTransactionProvider(TransactionProvider):
    def is_configured(self) -> bool:
        return False

    def get_transactions(self, wallet: str, plaid_access_token: str | None = None) -> list[RawTransaction]:
        raise NotImplementedError("Plaid provider is not configured in hackathon mode")


class SeededTransactionProvider(TransactionProvider):
    def is_configured(self) -> bool:
        return True

    def get_transactions(self, wallet: str, plaid_access_token: str | None = None) -> list[RawTransaction]:
        digest = sha256(wallet.encode("utf-8")).digest()
        wallet_prefix = sha256(wallet.encode("utf-8")).hexdigest()[:12]
        ledger: list[RawTransaction] = []

        for index in range(MAX_TRANSACTION_LIMIT):
            catalog_index = (digest[index % 32] + digest[(index * 7) % 32] + index * 11) % len(MERCHANT_CATALOG)
            template = MERCHANT_CATALOG[catalog_index]
            spread_seed = (digest[(index + 3) % 32] << 8) + digest[(index + 17) % 32] + (index * 97)
            amount_cents = template.base_amount_cents + (spread_seed % template.spread_cents)
            amount_usd = round_decimal(to_decimal(amount_cents) / to_decimal(100), 2)
            timestamp = LEDGER_END - timedelta(hours=index * LEDGER_INTERVAL_HOURS)
            ledger.append(
                RawTransaction(
                    transaction_id=f"seeded_{wallet_prefix}_{index:03d}",
                    description=template.description,
                    amount_usd=amount_usd,
                    mcc_code=template.mcc_code,
                    date=timestamp.strftime("%Y-%m-%dT%H:%M:%SZ"),
                )
            )
        return ledger


class CompositeTransactionProvider(TransactionProvider):
    def __init__(self, seeded_provider: TransactionProvider, plaid_provider: TransactionProvider) -> None:
        self._seeded_provider = seeded_provider
        self._plaid_provider = plaid_provider

    def is_configured(self) -> bool:
        return True

    def get_transactions(self, wallet: str, plaid_access_token: str | None = None) -> list[RawTransaction]:
        if plaid_access_token and self._plaid_provider.is_configured():
            return self._plaid_provider.get_transactions(wallet, plaid_access_token)
        return self._seeded_provider.get_transactions(wallet, plaid_access_token)


transaction_provider = CompositeTransactionProvider(
    seeded_provider=SeededTransactionProvider(),
    plaid_provider=PlaidTransactionProvider(),
)
