from __future__ import annotations

from app.models.domain import SuggestionNarrativeInput
from app.services.suggestions_service import suggestions_service
from tests.conftest import SECOND_TEST_WALLET, TEST_WALLET


class BrokenNarrator:
    def is_configured(self) -> bool:
        return True

    def narrate(self, suggestion: SuggestionNarrativeInput):
        raise RuntimeError("forced narrator failure")


def test_swap_suggestions_contract_and_ordering(client):
    first = client.get("/api/swap-suggestions", params={"wallet": TEST_WALLET})
    second = client.get("/api/swap-suggestions", params={"wallet": TEST_WALLET})

    assert first.status_code == 200
    assert first.json() == second.json()

    body = first.json()
    assert 3 <= len(body["suggestions"]) <= 5
    assert body["totalPotentialSavingsMonthly"] == round(
        sum(item["co2eSavingsMonthly"] for item in body["suggestions"]),
        2,
    )
    assert body["suggestions"] == sorted(
        body["suggestions"],
        key=lambda item: item["currentCo2eMonthly"],
        reverse=True,
    )


def test_swap_suggestions_category_filter_backfills_to_minimum(client):
    response = client.get(
        "/api/swap-suggestions",
        params=[("wallet", TEST_WALLET), ("categories", "travel"), ("categories", "gas_fuel")],
    )
    assert response.status_code == 200
    body = response.json()
    assert len(body["suggestions"]) >= 3
    assert body["suggestions"][0]["currentCategory"] in {"travel", "gas_fuel"}


def test_swap_suggestions_falls_back_when_openai_narration_fails(client, monkeypatch):
    baseline = client.get("/api/swap-suggestions", params={"wallet": SECOND_TEST_WALLET})
    monkeypatch.setattr(suggestions_service, "_openai_narrator", BrokenNarrator())
    fallback = client.get("/api/swap-suggestions", params={"wallet": "C" * 32})

    assert baseline.status_code == 200
    assert fallback.status_code == 200
    assert [item["currentCo2eMonthly"] for item in fallback.json()["suggestions"]]
    assert fallback.json()["totalPotentialSavingsMonthly"] == round(
        sum(item["co2eSavingsMonthly"] for item in fallback.json()["suggestions"]),
        2,
    )
