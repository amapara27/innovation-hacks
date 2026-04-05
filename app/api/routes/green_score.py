"""Green-score route."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query
from pydantic import ValidationError

from contracts.python.contracts import GreenScoreRequest, GreenScoreResponse

from app.services.scoring_service import scoring_service

router = APIRouter()


@router.get(
    "/api/green-score",
    response_model=GreenScoreResponse,
    response_model_by_alias=True,
    response_model_exclude_none=True,
)
def green_score(wallet: str = Query(...)) -> GreenScoreResponse:
    try:
        request = GreenScoreRequest(wallet=wallet)
    except ValidationError as exc:
        raise HTTPException(status_code=422, detail=exc.errors()) from exc
    return scoring_service.score_wallet(request)
