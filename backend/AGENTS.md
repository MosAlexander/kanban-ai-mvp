# backend/ — FastAPI-приложение

Обслуживает API и статические файлы (собранный NextJS-фронтенд из `../static/`).

## Стек

- Python 3.12
- FastAPI + uvicorn
- SQLModel + SQLAlchemy 2.0 async + aiosqlite (SQLite)
- Менеджер пакетов: uv
- Тесты: pytest + pytest-asyncio + `fastapi.testclient` (httpx)

## Структура

- `app/main.py` — FastAPI-приложение, lifespan (init_db), middleware, роутеры, статика
- `app/config.py` — pydantic-settings (SECRET_KEY, hardcoded creds, OPENAI_API_KEY, model)
- `app/auth.py` — dependency `current_user(request) -> int | 401`
- `app/models.py` — SQLModel-таблицы: `User`, `Board`, `Column`, `Card`, `ChatMessage`
- `app/db.py` — async engine, `async_session_maker`, `get_session` dep, `seed_board`, `init_db`
- `app/ai.py` — ленивый `AsyncOpenAI` клиент, `call_openai(prompt) -> str` (30s timeout, префикс `openai/` в `settings.model` срезается) + `call_openai_parse(messages, response_format)` для structured outputs
- `app/chat.py` — Pydantic-схемы `AiResponse` + `BoardAction` (union, `Literal`-дискриминатор в поле `type`, без pydantic `discriminator=` — OpenAI strict запрещает `oneOf`), `handle_chat` (board snapshot + история 20 → OpenAI parse → apply actions в try/except → save user+assistant messages → commit)
- `app/routers/session.py` — GET/POST/DELETE `/api/session`
- `app/routers/board.py` — все CRUD-роуты доски
- `app/routers/ai.py` — POST `/api/ai/ping`
- `app/routers/chat.py` — POST `/api/chat`, GET/DELETE `/api/chat/history`
- `tests/conftest.py` — autouse fixture `isolate_db` (tmp SQLite для каждого теста), `client`, `auth_client`, регистрация опции `--live`
- `tests/` — pytest-тесты

## Endpoints

- `GET /api/health` -> `{"status": "ok"}`
- `GET /` -> статический `index.html` из `../static/` (`StaticFiles(html=True)`)
- **Сессия (Часть 4):**
  - `GET /api/session` -> `{authenticated: bool}`
  - `POST /api/session` `{username, password}` -> 200 `{authenticated: true}` / 401
  - `DELETE /api/session` -> 204
- **Доска (Часть 6, требуют cookie-сессии, иначе 401):**
  - `GET /api/board` -> `{columns: [{id, title, cardIds}], cards: {id: {id, title, details}}}` — формат совпадает 1-в-1 с TS-типом `BoardData` фронта. Все id сериализуются как строки.
  - `PATCH /api/board/columns/{column_id}` `{title}` -> обновлённая `ColumnOut`
  - `POST /api/board/columns/{column_id}/cards` `{title, details?}` -> 201 `CardOut` (позиция = max+1000)
  - `PATCH /api/board/cards/{card_id}` `{title?, details?}` -> обновлённая `CardOut`
  - `DELETE /api/board/cards/{card_id}` -> 204
  - `PATCH /api/board/cards/{card_id}/position` `{column_id, position}` -> 204. `position` — 0-based индекс в целевой колонке. Позиции целевой колонки перенумеровываются шагом 1000.
- **ИИ (Часть 8, требуют cookie-сессии):**
  - `POST /api/ai/ping` `{prompt}` -> `{answer}`. Прямой вызов OpenAI (`gpt-5-mini`). Ошибки OpenAI (auth/rate limit/timeout/api) -> 502 `AI service error`. Пустой ответ модели -> 502 `Empty AI response`.
- **Чат с ИИ (Часть 9, требуют cookie-сессии):**
  - `POST /api/chat` `{message}` -> `AiResponse {reply, actions[]}`. Внутри: собирает snapshot доски + подтягивает историю (последние 20 сообщений), шлёт OpenAI Structured Outputs (`response_format=AiResponse`), применяет `actions` к БД, сохраняет пару user/assistant в `chat_messages`. Ошибка применения action (несуществующий id и т.п.) -> rollback изменений доски, в `reply` дописывается `[Действия не применены: <detail>]`, `actions=[]`, HTTP 200. Каждое применённое действие логируется `logger.info`.
  - `GET /api/chat/history` -> `[{role, content, created_at}, ...]` (в хронологическом порядке).
  - `DELETE /api/chat/history` -> 204, очищает историю текущего пользователя.
  - Варианты `BoardAction`: `create_card`, `edit_card`, `move_card`, `delete_card`, `rename_column` (union без pydantic `discriminator=` — OpenAI strict-mode отклоняет `oneOf`, использует `anyOf` + `Literal["<type>"]` для разведения).

## БД и seed

- Файл: `./data/pm.db` (том смонтирован в `docker-compose.yml`)
- Async URL: `sqlite+aiosqlite:///./data/pm.db`, `PRAGMA foreign_keys=ON` через event listener
- При старте (`lifespan`): если файла нет — `SQLModel.metadata.create_all` + seed (юзер `пользователь`, доска "My Board", 5 колонок Backlog/Discovery/In Progress/Review/Done, 8 демо-карточек из [frontend/src/lib/kanban.ts](../frontend/src/lib/kanban.ts)). Если файл есть — только create_all (идемпотентно). Alembic-миграций нет; изменение схемы = ручное удаление `data/pm.db`.
- Порядок: `position INTEGER` шаг 1000. Move-эндпоинт перенумеровывает целевую колонку.

## Тестовая изоляция

`tests/conftest.py` содержит autouse `isolate_db` — на каждый тест создаётся отдельный `tmp_path/test.db` и `monkeypatch`-ом подменяет `app.db.engine`, `DB_PATH`, `async_session_maker`. Поэтому:
- Тесты никогда не трогают реальный `./data/pm.db`.
- `init_db()`, `get_session` и т.п. должны читать модульные глобалы (позднее связывание), а не захватывать их в default-параметрах — иначе подмена не подействует.
- Фикстура `client` использует `with TestClient(app)` — это триггерит lifespan → init_db на подменённом engine → каждый тест видит полный seed. Фикстура `auth_client` дополнительно логинится по hardcoded creds.

## Запуск локально (без Docker)

```
cd backend
uv sync
uv run uvicorn app.main:app --reload
```

## Тесты

Внутри контейнера: `docker compose exec pm uv run --no-sync pytest -v` (59 тестов + 2 live-теста, пропускаются без `--live`).

Live-тесты OpenAI: `docker compose exec pm uv run --no-sync pytest -v --live -k live`. Требуют валидный `OPENAI_API_KEY` в `.env`. Покрывают `POST /api/ai/ping` ("2+2" -> "4") и `POST /api/chat` (ИИ создаёт карту "молоко" в Backlog).

## Запуск локально (без Docker)

```
cd backend
uv sync
uv run uvicorn app.main:app --reload
```

## Тесты

```
cd backend
uv run pytest
```

Тесты используют `fastapi.testclient.TestClient` (in-process, без сети).

## Запуск через Docker

Из корня проекта: `docker compose up --build` (см. `scripts/start.sh` или `scripts/start.ps1`).
