"""Health endpoint for the AI backend."""

from __future__ import annotations

from fastapi import APIRouter

from app.core.constants import REFERENCE_ANALYZED_AT

router = APIRouter()


@router.get("/api/health")
def health() -> dict[str, str]:
    return {
        "status": "ok",
        "service": "carboniq-ai-backend",
        "timestamp": REFERENCE_ANALYZED_AT,
    }
