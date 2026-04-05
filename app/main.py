"""FastAPI entrypoint for the CarbonIQ AI backend."""

from __future__ import annotations

from fastapi import FastAPI

from app.api.routes.analyze_transactions import router as analyze_transactions_router
from app.api.routes.green_score import router as green_score_router
from app.api.routes.health import router as health_router
from app.api.routes.swap_suggestions import router as swap_suggestions_router
from app.api.routes.trigger_offset import router as trigger_offset_router


def create_app() -> FastAPI:
    app = FastAPI(title="CarbonIQ AI Backend", version="0.1.0")
    app.include_router(health_router)
    app.include_router(analyze_transactions_router)
    app.include_router(green_score_router)
    app.include_router(trigger_offset_router)
    app.include_router(swap_suggestions_router)
    return app


app = create_app()
