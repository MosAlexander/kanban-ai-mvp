from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest

from app import ai as ai_module
from app.chat import (
    AiResponse,
    CreateCardAction,
    DeleteCardAction,
    EditCardAction,
    MoveCardAction,
    RenameColumnAction,
)


def _mock_parse(monkeypatch, ai_response: AiResponse) -> MagicMock:
    client = MagicMock()
    client.chat.completions.parse = AsyncMock(
        return_value=SimpleNamespace(
            choices=[
                SimpleNamespace(
                    message=SimpleNamespace(parsed=ai_response, refusal=None)
                )
            ]
        )
    )
    monkeypatch.setattr(ai_module, "_client", client)
    return client


def test_chat_no_actions_returns_reply(auth_client, monkeypatch):
    _mock_parse(monkeypatch, AiResponse(reply="Всё в порядке.", actions=[]))
    r = auth_client.post("/api/chat", json={"message": "Привет"})
    assert r.status_code == 200
    body = r.json()
    assert body["reply"] == "Всё в порядке."
    assert body["actions"] == []


def test_chat_create_card_action_creates_in_db(auth_client, monkeypatch):
    _mock_parse(
        monkeypatch,
        AiResponse(
            reply="Создал карту.",
            actions=[
                CreateCardAction(
                    type="create_card",
                    column_id="1",
                    title="Купить молоко",
                    details="2%, 1 литр",
                )
            ],
        ),
    )
    r = auth_client.post("/api/chat", json={"message": "создай карту молоко"})
    assert r.status_code == 200
    board = auth_client.get("/api/board").json()
    backlog = next(c for c in board["columns"] if c["title"] == "Backlog")
    new_id = backlog["cardIds"][-1]
    assert board["cards"][new_id]["title"] == "Купить молоко"
    assert board["cards"][new_id]["details"] == "2%, 1 литр"


def test_chat_edit_card_action_updates_db(auth_client, monkeypatch):
    _mock_parse(
        monkeypatch,
        AiResponse(
            reply="Обновил заголовок.",
            actions=[
                EditCardAction(
                    type="edit_card",
                    card_id="1",
                    title="Новый заголовок",
                    details=None,
                )
            ],
        ),
    )
    r = auth_client.post("/api/chat", json={"message": "переименуй карту 1"})
    assert r.status_code == 200
    board = auth_client.get("/api/board").json()
    assert board["cards"]["1"]["title"] == "Новый заголовок"


def test_chat_move_card_action_updates_db(auth_client, monkeypatch):
    _mock_parse(
        monkeypatch,
        AiResponse(
            reply="Переместил.",
            actions=[
                MoveCardAction(
                    type="move_card",
                    card_id="2",
                    column_id="5",
                    position=0,
                )
            ],
        ),
    )
    r = auth_client.post("/api/chat", json={"message": "переместь"})
    assert r.status_code == 200
    board = auth_client.get("/api/board").json()
    done = next(c for c in board["columns"] if c["title"] == "Done")
    assert done["cardIds"][0] == "2"


def test_chat_delete_card_action_removes_from_db(auth_client, monkeypatch):
    _mock_parse(
        monkeypatch,
        AiResponse(
            reply="Удалил.",
            actions=[DeleteCardAction(type="delete_card", card_id="1")],
        ),
    )
    r = auth_client.post("/api/chat", json={"message": "удали карту 1"})
    assert r.status_code == 200
    board = auth_client.get("/api/board").json()
    assert "1" not in board["cards"]


def test_chat_rename_column_action_updates_db(auth_client, monkeypatch):
    _mock_parse(
        monkeypatch,
        AiResponse(
            reply="Переименовал.",
            actions=[
                RenameColumnAction(
                    type="rename_column", column_id="1", title="Icebox"
                )
            ],
        ),
    )
    r = auth_client.post("/api/chat", json={"message": "переименуй Backlog в Icebox"})
    assert r.status_code == 200
    board = auth_client.get("/api/board").json()
    assert board["columns"][0]["title"] == "Icebox"


def test_chat_invalid_column_id_rollback(auth_client, monkeypatch):
    _mock_parse(
        monkeypatch,
        AiResponse(
            reply="Создал.",
            actions=[
                CreateCardAction(
                    type="create_card",
                    column_id="9999",
                    title="Fantom",
                    details="",
                )
            ],
        ),
    )
    r = auth_client.post("/api/chat", json={"message": "создай"})
    assert r.status_code == 200
    body = r.json()
    assert "[Действия не применены" in body["reply"]
    assert body["actions"] == []
    board = auth_client.get("/api/board").json()
    assert all("Fantom" != c["title"] for c in board["cards"].values())


def test_chat_invalid_card_id_rollback(auth_client, monkeypatch):
    _mock_parse(
        monkeypatch,
        AiResponse(
            reply="Обновил.",
            actions=[
                EditCardAction(
                    type="edit_card", card_id="9999", title="Ghost", details=None
                )
            ],
        ),
    )
    r = auth_client.post("/api/chat", json={"message": "обнови"})
    assert r.status_code == 200
    body = r.json()
    assert "[Действия не применены" in body["reply"]
    assert body["actions"] == []


def test_chat_multiple_actions_all_or_nothing(auth_client, monkeypatch):
    _mock_parse(
        monkeypatch,
        AiResponse(
            reply="Создал две карты.",
            actions=[
                CreateCardAction(
                    type="create_card", column_id="1", title="First", details=""
                ),
                CreateCardAction(
                    type="create_card",
                    column_id="9999",
                    title="Second",
                    details="",
                ),
            ],
        ),
    )
    r = auth_client.post("/api/chat", json={"message": "две карты"})
    assert r.status_code == 200
    body = r.json()
    assert body["actions"] == []
    board = auth_client.get("/api/board").json()
    titles = [c["title"] for c in board["cards"].values()]
    assert "First" not in titles
    assert "Second" not in titles


def test_chat_saves_user_and_assistant_history(auth_client, monkeypatch):
    _mock_parse(monkeypatch, AiResponse(reply="Ответ ИИ", actions=[]))
    auth_client.post("/api/chat", json={"message": "Вопрос пользователя"})
    history = auth_client.get("/api/chat/history").json()
    assert len(history) == 2
    assert history[0]["role"] == "user"
    assert history[0]["content"] == "Вопрос пользователя"
    assert history[1]["role"] == "assistant"
    assert history[1]["content"] == "Ответ ИИ"


def test_chat_system_prompt_contains_board_snapshot(auth_client, monkeypatch):
    client = _mock_parse(monkeypatch, AiResponse(reply="ok", actions=[]))
    auth_client.post("/api/chat", json={"message": "hi"})
    messages = client.chat.completions.parse.call_args.kwargs["messages"]
    assert messages[0]["role"] == "system"
    system = messages[0]["content"]
    assert "Backlog" in system
    assert "Discovery" in system
    assert "Align roadmap themes" in system
    assert messages[-1] == {"role": "user", "content": "hi"}


def test_chat_history_included_in_next_prompt(auth_client, monkeypatch):
    _mock_parse(monkeypatch, AiResponse(reply="first", actions=[]))
    auth_client.post("/api/chat", json={"message": "one"})
    client2 = _mock_parse(monkeypatch, AiResponse(reply="second", actions=[]))
    auth_client.post("/api/chat", json={"message": "two"})
    second_messages = client2.chat.completions.parse.call_args.kwargs["messages"]
    contents = [m["content"] for m in second_messages]
    assert "one" in contents
    assert "first" in contents
    assert second_messages[-1] == {"role": "user", "content": "two"}


def test_chat_history_get_empty_by_default(auth_client):
    r = auth_client.get("/api/chat/history")
    assert r.status_code == 200
    assert r.json() == []


def test_chat_history_delete_clears_history(auth_client, monkeypatch):
    _mock_parse(monkeypatch, AiResponse(reply="ok", actions=[]))
    auth_client.post("/api/chat", json={"message": "hello"})
    assert len(auth_client.get("/api/chat/history").json()) == 2
    r = auth_client.delete("/api/chat/history")
    assert r.status_code == 204
    assert auth_client.get("/api/chat/history").json() == []


def test_chat_without_session_returns_401(client):
    r = client.post("/api/chat", json={"message": "hi"})
    assert r.status_code == 401


def test_chat_history_get_without_session_returns_401(client):
    r = client.get("/api/chat/history")
    assert r.status_code == 401


def test_chat_history_delete_without_session_returns_401(client):
    r = client.delete("/api/chat/history")
    assert r.status_code == 401


def test_chat_empty_message_returns_422(auth_client):
    r = auth_client.post("/api/chat", json={"message": ""})
    assert r.status_code == 422


def test_chat_message_too_long_returns_422(auth_client):
    r = auth_client.post("/api/chat", json={"message": "x" * 5000})
    assert r.status_code == 422


@pytest.mark.live
def test_live_chat_creates_milk_card_in_backlog(auth_client):
    r = auth_client.post(
        "/api/chat",
        json={
            "message": "Создай новую карточку 'купить молоко' в колонке Backlog."
        },
    )
    assert r.status_code == 200, r.text
    body = r.json()
    board = auth_client.get("/api/board").json()
    backlog = next(c for c in board["columns"] if c["title"] == "Backlog")
    titles = [board["cards"][cid]["title"].lower() for cid in backlog["cardIds"]]
    assert any("молок" in t for t in titles), (body, titles)
