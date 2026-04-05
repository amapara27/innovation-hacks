from __future__ import annotations

from contracts.python.contracts import EmissionCategory

from tests.conftest import TEST_WALLET


def test_analyze_transactions_contract_and_determinism(client):
    payload = {"wallet": TEST_WALLET, "limit": 5}

    first = client.post("/api/analyze-transactions", json=payload)
    second = client.post("/api/analyze-transactions", json=payload)

    assert first.status_code == 200
    assert second.status_code == 200
    assert first.json() == second.json()

    body = first.json()
    assert body["wallet"] == TEST_WALLET
    assert body["transactionCount"] == 5
    assert body["analyzedAt"] == "2026-01-31T12:00:00Z"
    assert set(body["categoryBreakdown"].keys()) == {category.value for category in EmissionCategory}
    assert round(sum(tx["co2eGrams"] for tx in body["transactions"]), 2) == body["totalCo2eGrams"]
    assert all("transactionId" in tx for tx in body["transactions"])
    assert all(tx["category"] in {category.value for category in EmissionCategory} for tx in body["transactions"])


def test_analyze_transactions_validation_failure(client):
    response = client.post("/api/analyze-transactions", json={"wallet": TEST_WALLET, "limit": 101})
    assert response.status_code == 422
