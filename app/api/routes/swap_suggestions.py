"""Swap-suggestions route."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query
from pydantic import ValidationError

from contracts.python.contracts import EmissionCategory, SwapSuggestionsRequest, SwapSuggestionsResponse

from app.services.suggestions_service import suggestions_service

router = APIRouter()


def _normalize_categories(categories: list[str] | None) -> list[str] | None:
    if not categories:
        return None
    normalized: list[str] = []
    for category in categories:
        normalized.extend(part.strip() for part in category.split(",") if part.strip())
    return normalized or None


@router.get(
    "/api/swap-suggestions",
    response_model=SwapSuggestionsResponse,
    response_model_by_alias=True,
)
def swap_suggestions(
    wallet: str = Query(...),
    categories: list[str] | None = Query(default=None),
) -> SwapSuggestionsResponse:
    try:
        request = SwapSuggestionsRequest(
            wallet=wallet,
            categories=_normalize_categories(categories),
        )
    except ValidationError as exc:
        raise HTTPException(status_code=422, detail=exc.errors()) from exc
    return suggestions_service.get_swap_suggestions(request)
