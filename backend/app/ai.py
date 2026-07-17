import logging

from fastapi import HTTPException, status
from openai import (
    APIConnectionError,
    APIError,
    AsyncOpenAI,
    AuthenticationError,
    RateLimitError,
)

from app.config import settings

logger = logging.getLogger(__name__)

_client: AsyncOpenAI | None = None


def _get_client() -> AsyncOpenAI:
    global _client
    if _client is None:
        _client = AsyncOpenAI(api_key=settings.openai_api_key, timeout=30.0)
    return _client


def _model_name() -> str:
    return settings.model.split("/", 1)[-1]


async def call_openai(prompt: str) -> str:
    try:
        response = await _get_client().chat.completions.create(
            model=_model_name(),
            messages=[{"role": "user", "content": prompt}],
        )
    except (AuthenticationError, RateLimitError, APIConnectionError, APIError) as exc:
        logger.exception("OpenAI request failed")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="AI service error",
        ) from exc

    answer = response.choices[0].message.content
    if not answer:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Empty AI response",
        )
    return answer
