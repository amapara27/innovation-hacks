"""Trigger-offset route."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from contracts.python.contracts import TriggerOffsetRequest, TriggerOffsetResponse

from app.core.errors import BusinessRuleError
from app.services.offset_service import offset_service

router = APIRouter()


@router.post(
    "/api/trigger-offset",
    response_model=TriggerOffsetResponse,
    response_model_by_alias=True,
)
def trigger_offset(request: TriggerOffsetRequest) -> TriggerOffsetResponse:
    try:
        return offset_service.trigger_offset(request)
    except BusinessRuleError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
