"""Narration helpers for swap suggestion phrasing."""

from __future__ import annotations

import json

import httpx

from app.core.config import settings
from app.models.domain import SuggestionNarrativeInput, SuggestionNarrativeText


class TemplateSuggestionNarrator:
    def narrate(self, suggestion: SuggestionNarrativeInput) -> SuggestionNarrativeText:
        return SuggestionNarrativeText(
            current_description=suggestion.current_description,
            alternative_description=suggestion.alternative_description,
        )


class OpenAISuggestionNarrator:
    def __init__(self) -> None:
        self._base_url = settings.openai_base_url.rstrip("/")
        self._api_key = settings.openai_api_key
        self._model = settings.openai_model
        self._timeout = settings.request_timeout_seconds

    def is_configured(self) -> bool:
        return settings.use_openai_narrator and bool(self._api_key)

    def narrate(self, suggestion: SuggestionNarrativeInput) -> SuggestionNarrativeText:
        prompt = (
            "Rewrite the two descriptions below so they sound natural and concise. "
            "Do not change any numbers, category meaning, or difficulty. "
            "Return strict JSON with keys currentDescription and alternativeDescription.\n"
            f"category: {suggestion.current_category.value}\n"
            f"current: {suggestion.current_description}\n"
            f"alternative: {suggestion.alternative_description}\n"
            f"currentCo2eMonthly: {suggestion.current_co2e_monthly}\n"
            f"alternativeCo2eMonthly: {suggestion.alternative_co2e_monthly}\n"
            f"co2eSavingsMonthly: {suggestion.co2e_savings_monthly}\n"
            f"priceDifferenceUsd: {suggestion.price_difference_usd}\n"
            f"difficulty: {suggestion.difficulty.value}\n"
        )
        response = httpx.post(
            f"{self._base_url}/responses",
            headers={
                "Authorization": f"Bearer {self._api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": self._model,
                "input": prompt,
                "max_output_tokens": 120,
            },
            timeout=self._timeout,
        )
        response.raise_for_status()
        payload = response.json()

        output_parts: list[str] = []
        for item in payload.get("output", []):
            if item.get("type") != "message":
                continue
            for content_item in item.get("content", []):
                if content_item.get("type") in {"output_text", "text"} and "text" in content_item:
                    output_parts.append(content_item["text"])
        if not output_parts:
            raise ValueError("OpenAI narrator returned no text output")

        parsed = json.loads("".join(output_parts).strip())
        return SuggestionNarrativeText(
            current_description=parsed["currentDescription"],
            alternative_description=parsed["alternativeDescription"],
        )


template_narrator = TemplateSuggestionNarrator()
openai_narrator = OpenAISuggestionNarrator()
