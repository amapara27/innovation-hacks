from __future__ import annotations

from contracts.python.contracts import CarbonCreditType

from app.state.store import user_store
from tests.conftest import TEST_WALLET


def test_trigger_offset_happy_path_and_determinism(client):
    payload = {"wallet": TEST_WALLET, "budgetUsd": 10}

    first = client.post("/api/trigger-offset", json=payload)
    second = client.post("/api/trigger-offset", json=payload)

    assert first.status_code == 200
    assert first.json() == second.json()

    body = first.json()
    assert body["status"] == "pending"
    assert body["toucanTxHash"] is None
    expected_cost = round(
        body["decision"]["pricePerTonneUsd"] * body["decision"]["co2eGrams"] / 1_000_000,
        2,
    )
    assert body["decision"]["costUsd"] == expected_cost


def test_trigger_offset_honors_affordable_preference(client):
    response = client.post(
        "/api/trigger-offset",
        json={
            "wallet": TEST_WALLET,
            "budgetUsd": 15,
            "preferredCreditType": CarbonCreditType.DIRECT_AIR_CAPTURE.value,
        },
    )

    assert response.status_code == 200
    assert response.json()["decision"]["creditType"] == CarbonCreditType.DIRECT_AIR_CAPTURE.value


def test_trigger_offset_rejects_insufficient_budget(client):
    response = client.post(
        "/api/trigger-offset",
        json={"wallet": TEST_WALLET, "budgetUsd": 0.000001},
    )
    assert response.status_code == 422


def test_trigger_offset_rejects_when_no_outstanding_emissions(client):
    analysis = client.post("/api/analyze-transactions", json={"wallet": TEST_WALLET, "limit": 20}).json()
    user_store.add_confirmed_offset(
        TEST_WALLET,
        analysis["totalCo2eGrams"],
        CarbonCreditType.FORESTRY,
    )

    response = client.post("/api/trigger-offset", json={"wallet": TEST_WALLET, "budgetUsd": 5})
    assert response.status_code == 422
