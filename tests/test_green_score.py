from __future__ import annotations

import pytest

from contracts.python.contracts import GREEN_SCORE_WEIGHTS, GreenScoreTier

from app.services.scoring_service import clamp_green_score, compute_weighted_score, resolve_green_score_tier
from tests.conftest import TEST_WALLET


def test_green_score_endpoint_contract_and_determinism(client):
    first = client.get("/api/green-score", params={"wallet": TEST_WALLET})
    second = client.get("/api/green-score", params={"wallet": TEST_WALLET})

    assert first.status_code == 200
    assert first.json() == second.json()

    body = first.json()
    assert "rank" not in body
    assert "totalUsers" not in body
    assert "spendingHabits" in body["breakdown"]
    assert "stakingHistory" not in body["breakdown"]
    assert 0 <= body["score"] <= 100
    assert body["tier"] in {tier.value for tier in GreenScoreTier}


@pytest.mark.parametrize(
    ("score", "expected_tier"),
    [
        (24, GreenScoreTier.SEEDLING),
        (25, GreenScoreTier.SPROUT),
        (49, GreenScoreTier.SPROUT),
        (50, GreenScoreTier.TREE),
        (74, GreenScoreTier.TREE),
        (75, GreenScoreTier.FOREST),
        (89, GreenScoreTier.FOREST),
        (90, GreenScoreTier.EARTH_GUARDIAN),
    ],
)
def test_green_score_tier_edges(score, expected_tier):
    assert resolve_green_score_tier(score) == expected_tier


def test_weighted_score_uses_shared_weights():
    breakdown = {
        "transactionEfficiency": 80,
        "spendingHabits": 70,
        "carbonOffsets": 60,
        "communityImpact": 50,
    }
    expected = (
        breakdown["transactionEfficiency"] * GREEN_SCORE_WEIGHTS["transactionEfficiency"]
        + breakdown["spendingHabits"] * GREEN_SCORE_WEIGHTS["spendingHabits"]
        + breakdown["carbonOffsets"] * GREEN_SCORE_WEIGHTS["carbonOffsets"]
        + breakdown["communityImpact"] * GREEN_SCORE_WEIGHTS["communityImpact"]
    )
    assert float(compute_weighted_score(breakdown)) == expected


def test_green_score_clamps_bounds():
    assert float(clamp_green_score(-3)) == 0
    assert float(clamp_green_score(101)) == 100
