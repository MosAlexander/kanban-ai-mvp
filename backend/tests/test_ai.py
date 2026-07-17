from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import httpx
import pytest
from openai import APIError

from app import ai as ai_module


def _mock_client(monkeypatch, *, answer: str = "hi", side_effect=None) -> MagicMock:
    client = MagicMock()
    if side_effect is not None:
        client.chat.completions.create = AsyncMock(side_effect=side_effect)
    else:
        client.chat.completions.create = AsyncMock(
            return_value=SimpleNamespace(
                choices=[SimpleNamespace(message=SimpleNamespace(content=answer))]
            )
        )
    monkeypatch.setattr(ai_module, "_client", client)
    return client


def test_ping_returns_answer(auth_client, monkeypatch):
    _mock_client(monkeypatch, answer="pong")
    r = auth_client.post("/api/ai/ping", json={"prompt": "hi"})
    assert r.status_code == 200
    assert r.json() == {"answer": "pong"}


def test_ping_calls_openai_with_correct_model_and_message(auth_client, monkeypatch):
    client = _mock_client(monkeypatch, answer="ok")
    auth_client.post("/api/ai/ping", json={"prompt": "hello"})
    client.chat.completions.create.assert_awaited_once_with(
        model="gpt-5-mini",
        messages=[{"role": "user", "content": "hello"}],
    )


def test_ping_without_session_returns_401(client):
    r = client.post("/api/ai/ping", json={"prompt": "hi"})
    assert r.status_code == 401


def test_ping_empty_prompt_returns_422(auth_client):
    r = auth_client.post("/api/ai/ping", json={"prompt": ""})
    assert r.status_code == 422


def test_ping_openai_error_returns_502(auth_client, monkeypatch):
    error = APIError(
        message="boom",
        request=httpx.Request("POST", "https://api.openai.com/v1/chat/completions"),
        body=None,
    )
    _mock_client(monkeypatch, side_effect=error)
    r = auth_client.post("/api/ai/ping", json={"prompt": "hi"})
    assert r.status_code == 502
    assert r.json() == {"detail": "AI service error"}


def test_ping_empty_response_returns_502(auth_client, monkeypatch):
    _mock_client(monkeypatch, answer="")
    r = auth_client.post("/api/ai/ping", json={"prompt": "hi"})
    assert r.status_code == 502
    assert r.json() == {"detail": "Empty AI response"}


@pytest.mark.live
def test_ping_live_two_plus_two(auth_client):
    r = auth_client.post(
        "/api/ai/ping",
        json={"prompt": "Сколько будет 2+2? Ответь одним числом."},
    )
    assert r.status_code == 200, r.text
    assert "4" in r.json()["answer"]
