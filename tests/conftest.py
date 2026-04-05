from __future__ import annotations

import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.main import app
from app.state.store import user_store


TEST_WALLET = "A" * 32
SECOND_TEST_WALLET = "B" * 32


@pytest.fixture(autouse=True)
def reset_store():
    user_store.reset()
    yield
    user_store.reset()


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)
