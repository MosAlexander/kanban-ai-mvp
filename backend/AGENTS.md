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
- `app/routers/session.py` — GET/POST/DELETE `/api/session`
- `app/routers/board.py` — все CRUD-роуты доски
- `tests/conftest.py` — autouse fixture `isolate_db` (tmp SQLite для каждого теста), `client`, `auth_client`
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

Внутри контейнера: `docker compose exec pm uv run --no-sync pytest -v` (34 теста).

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
