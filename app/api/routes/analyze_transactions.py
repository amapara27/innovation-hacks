"""Analyze-transactions route."""

from __future__ import annotations

from fastapi import APIRouter

from contracts.python.contracts import AnalyzeTransactionsRequest, AnalyzeTransactionsResponse

from app.services.emissions_service import emissions_service

router = APIRouter()


@router.post(
    "/api/analyze-transactions",
    response_model=AnalyzeTransactionsResponse,
    response_model_by_alias=True,
)
def analyze_transactions(request: AnalyzeTransactionsRequest) -> AnalyzeTransactionsResponse:
    return emissions_service.analyze_transactions(request)
