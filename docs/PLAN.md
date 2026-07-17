# Основные этапы проекта

Ниже — детальный план всех 10 частей. Для каждой части: цель, чек-лист подэтапов, тесты и критерии успеха. Агент отмечает подэтапы `[x]` по мере выполнения. Часть считается завершённой только когда все её критерии успеха достигнуты и пользователь подтвердил переход к следующей.

Согласованные ключевые решения:
- Аутентификация: HTTP-only cookie-сессия на стороне FastAPI (`SessionMiddleware`), защищает все API-endpoints и готова к multi-user в будущем.
- Docker: единый контейнер, multi-stage build (node для сборки NextJS -> python для рантайма). FastAPI обслуживает статику NextJS и API.
- NextJS: статический экспорт (`output: 'export'`).
- Модель ИИ: `openai/gpt-5-mini` через прямой вызов OpenAI API.

---

## Часть 1: Планирование

**Цель:** дополнить PLAN.md подробным чек-листом, создать `frontend/AGENTS.md`, получить утверждение пользователя.

**Подэтапы:**
- [x] Прочитать CLAUDE.md, PLAN.md, изучить структуру проекта
- [x] Провести обзор существующего фронтенда (структура, зависимости, тесты, модель данных)
- [x] Согласовать с пользователем ключевые решения (аутентификация, Docker, статический экспорт, модель ИИ)
- [x] Обновить `docs/PLAN.md` подробным планом всех 10 частей
- [x] Создать `frontend/AGENTS.md` с описанием существующего кода
- [x] Получить явное утверждение пользователя на план

**Критерии успеха:**
- Пользователь явно утвердил план
- Для каждой части в PLAN.md есть проверяемый чек-лист подэтапов, тесты и критерии
- `frontend/AGENTS.md` точно отражает актуальное состояние фронтенда

---

## Часть 2: Создание структуры проекта

**Цель:** настроить Docker-инфраструктуру, каркас FastAPI в `backend/`, скрипты запуска/остановки. Контейнер должен обслуживать статический HTML "hello world" и один API-endpoint для проверки работоспособности.

**Подэтапы:**
- [x] Создать `backend/pyproject.toml` с зависимостями (`fastapi`, `uvicorn[standard]`) под `uv`
- [x] Создать `backend/app/__init__.py` и `backend/app/main.py` с минимальным FastAPI-приложением
- [x] Endpoint `GET /api/health` -> `{"status": "ok"}`
- [x] Настроить FastAPI обслуживать статику из `./static/` по `/`
- [x] Создать `static/index.html` с "hello world" (временный, будет заменён в Части 3)
- [x] Создать `Dockerfile` (python:3.12-slim + uv) — копирует `backend/` и `static/`, запускает `uvicorn app.main:app --host 0.0.0.0 --port 8000`
- [x] Создать `docker-compose.yml` (порт 8000, монтирование `.env`, том для SQLite-файла)
- [x] Создать `.dockerignore`
- [x] Скрипты Linux/Mac: `scripts/start.sh`, `scripts/stop.sh`
- [x] Скрипты Windows: `scripts/start.ps1`, `scripts/stop.ps1`
- [x] Тесты: `backend/tests/test_health.py` (pytest + `httpx.AsyncClient` или `TestClient`)
- [x] Обновить `backend/AGENTS.md` (заменить заглушку)
- [x] Обновить `scripts/AGENTS.md` (заменить заглушку)

**Тесты:**
- Unit: `pytest backend/tests` — `GET /api/health` возвращает `200` и `{"status": "ok"}`
- Integration (ручной): `docker compose up` -> `curl http://localhost:8000/` возвращает HTML "hello world"; `curl http://localhost:8000/api/health` возвращает JSON
- Скрипты запуска/остановки успешно поднимают/тушат контейнер на текущей платформе

**Критерии успеха:**
- `docker compose up --build` собирает и запускает контейнер без ошибок
- `GET /` возвращает статический HTML
- `GET /api/health` возвращает `{"status": "ok"}`
- Скрипты работают на Windows (минимум) и содержат корректный код для Mac/Linux

---

## Часть 3: Добавление фронтенда

**Цель:** статически собрать NextJS и включить в контейнер так, чтобы FastAPI отдавал доску Kanban по `/`. Обеспечить unit- и integration-тесты.

**Подэтапы:**
- [x] Добавить `output: 'export'` (и, при необходимости, `images: { unoptimized: true }`) в `frontend/next.config.ts`
- [x] Убедиться, что `npm run build` создаёт `frontend/out/` с рабочей статикой Kanban
- [x] Перевести `Dockerfile` в multi-stage:
  - Stage 1 (`node:20-slim`): `npm ci` -> `npm run build` -> артефакт `/app/out`
  - Stage 2 (`python:3.12-slim` + `uv`): копирует `backend/` и `out/` -> запуск uvicorn
- [x] Настроить FastAPI обслуживать `frontend/out` через `StaticFiles(html=True)`, с fallback на `index.html` для SPA-роутов
- [x] Убрать временный `static/index.html` "hello world"
- [x] Все существующие 6 unit + 3 e2e тестов фронтенда продолжают проходить
- [x] Backend pytest: `test_serves_index.py` — `GET /` возвращает HTML, в теле есть маркер доски (например, заголовок колонки)
- [x] Playwright: добавить конфиг/сценарий против контейнера (`baseURL http://localhost:8000`)

**Тесты:**
- Frontend unit: `cd frontend && npm run test:unit` (6 тестов зелёные)
- Backend unit: `pytest backend/tests` (health + serve-index)
- E2E: Playwright против запущенного контейнера — открытие доски, отображение всех 5 колонок и sample-карточек, drag-and-drop работает

**Критерии успеха:**
- `npm run build` создаёт корректный статический бандл
- `docker compose up` обслуживает доску Kanban по `http://localhost:8000/`
- Drag-and-drop работает в собранной версии
- Все тесты (unit + e2e) зелёные

---

## Часть 4: Добавление фиктивного входа пользователя

**Цель:** при первом обращении к `/` требовать вход с учётными данными `пользователь`/`пароль`. После входа виден канбан. Возможность выйти. Полное тестирование.

**Подэтапы (backend):**
- [x] Добавить `starlette.middleware.sessions.SessionMiddleware` с `SECRET_KEY` из `.env`
- [x] `POST /api/session` — принимает `{username, password}`, сверяет с hardcoded, ставит `request.session["user_id"] = 1`, возвращает `{authenticated: true}` или `401`
- [x] `DELETE /api/session` — `request.session.clear()`, `204`
- [x] `GET /api/session` — `{authenticated: bool}` (без пароля)
- [x] FastAPI-dependency `current_user(request)` -> `int | 401` — используется во всех защищённых роутах
- [x] `SECRET_KEY` и hardcoded creds — через `pydantic-settings` (`backend/app/config.py`)

**Подэтапы (frontend):**
- [x] Страница `/login` (`src/app/login/page.tsx`) с формой (username, password, кнопка "Войти")
- [x] `src/lib/api.ts` — fetch-хелпер с `credentials: 'include'` и обработкой ошибок
- [x] Клиентский guard: `AuthProvider` в `src/app/layout.tsx` — при монтировании `GET /api/session`, редирект на `/login` если не аутентифицирован
- [x] Кнопка "Выйти" в шапке — `DELETE /api/session` -> редирект на `/login`
- [x] Unit-тест login-страницы (успешный вход, ошибка неверных данных)

**Тесты:**
- Backend pytest:
  - `POST /api/session` с корректными данными -> `200`, ставит cookie
  - `POST /api/session` с некорректными -> `401`
  - `GET /api/session` без cookie -> `{authenticated: false}`
  - `GET /api/session` с cookie -> `{authenticated: true}`
  - `DELETE /api/session` очищает сессию
  - `GET` любого защищённого роута (например, будущего `/api/board`) без cookie -> `401`
- Frontend unit: форма логина отправляет POST, обрабатывает ошибку, редиректит после успеха
- E2E: unauth -> редирект на `/login`; успешный вход -> доска; logout -> редирект на `/login`

**Критерии успеха:**
- Некорректные учётные данные показывают понятную ошибку
- Корректные (`пользователь`/`пароль`) открывают доску
- Cookie: `HttpOnly`, `SameSite=Lax`, `Secure=false` для локального dev
- После выхода `/` снова требует логин
- Все API-endpoints (кроме `/api/session` и статики) защищены

---

## Часть 5: Моделирование базы данных

**Цель:** предложить схему БД для канбана в JSON, задокументировать подход в `docs/`, получить утверждение пользователя.

**Подэтапы:**
- [x] Определить сущности: `User`, `Board`, `Column`, `Card`, `ChatMessage` (последняя — для Части 9)
- [x] Определить отношения: `User 1—N Board` (в MVP всегда 1), `Board 1—N Column` (упорядоченные), `Column 1—N Card` (упорядоченные), `User 1—N ChatMessage`
- [x] Поля с учётом фронтенд-модели (`id`, `title`, `details`, `position`, `created_at`, `updated_at`)
- [x] Сохранить схему в `docs/schema.json` (валидный JSON Schema)
- [x] Создать `docs/DATABASE.md` с описанием:
  - выбор ORM (рекомендация: SQLModel — сочетание SQLAlchemy 2.0 + Pydantic, минимум бойлерплейта)
  - стратегия автосоздания при отсутствии файла (`SQLModel.metadata.create_all`)
  - стратегия упорядочивания (рекомендация: `position INTEGER` с шагом 1000 для дешёвых вставок между)
  - foreign keys, индексы (`user_id`, `column_id`, `position`)
  - миграции (для MVP не нужны — schema.create_all при старте)
- [x] Получить утверждение пользователя на схему и подход

**Критерии успеха:**
- `docs/schema.json` — валидный JSON Schema
- `docs/DATABASE.md` описывает выбор ORM, стратегию порядка, автосоздание
- Пользователь явно утвердил схему

---

## Часть 6: Бэкенд (API канбана)

**Цель:** реализовать API-роуты чтения и модификации канбана для аутентифицированного пользователя. БД создаётся при отсутствии файла. Тщательные unit-тесты.

**Подэтапы:**
- [x] Добавить `sqlmodel` и `aiosqlite` в `backend/pyproject.toml`
- [x] `backend/app/models.py` — SQLModel-классы `User`, `Board`, `Column`, `Card`, `ChatMessage`
- [x] `backend/app/db.py` — engine, session, `create_all()` при старте если файла БД нет
- [x] Seed при старте: если файла БД нет — создать пользователя `пользователь` + доску "My Board" + 5 колонок (Backlog/Discovery/In Progress/Review/Done) + 8 демо-карточек из `frontend/src/lib/kanban.ts`
- [x] `GET /api/board` -> вся доска в формате фронтенда `{columns, cards}`
- [x] `PATCH /api/board/columns/{column_id}` -> переименование `{title}`
- [x] `POST /api/board/columns/{column_id}/cards` -> `{title, details}` -> создание карточки
- [x] `PATCH /api/board/cards/{card_id}` -> `{title?, details?}` -> редактирование
- [x] `DELETE /api/board/cards/{card_id}`
- [x] `PATCH /api/board/cards/{card_id}/position` -> `{column_id, position}` -> перемещение (position — 0-based индекс в целевой колонке; целевая колонка перенумеровывается шагом 1000)
- [x] Все эндпоинты используют dependency `current_user` (401 если не аутентифицирован)
- [x] Unit-тесты для каждого endpoint (pytest + autouse tmp SQLite fixture)

**Тесты:**
- Каждый endpoint покрыт минимум одним тестом успеха + тестом 401 без сессии
- Test drop-db: удалить файл БД, поднять app, БД создалась, seed есть
- Test move-card: правильное упорядочивание в трёх сценариях (внутри колонки, между колонками, в пустую колонку)
- Валидация: неверные типы -> 422 (Pydantic)
- Формат ответа `GET /api/board` совпадает с TypeScript-типом `BoardData` фронтенда (Card, Column, cardIds, cards map)

**Критерии успеха:**
- Все CRUD-эндпоинты работают
- БД создаётся автоматически при первом запуске
- Все тесты зелёные, покрытие роутов не ниже 90%

---

## Часть 7: Фронтенд + Бэкенд

**Цель:** интегрировать фронтенд с реальным API, чтобы канбан был постоянным. Очень тщательное тестирование.

**Подэтапы:**
- [x] Расширить `frontend/src/lib/api.ts` — типизированные методы `getBoard`, `renameColumn`, `createCard`, `updateCard`, `deleteCard`, `moveCard`
- [x] Заменить `initialData` в `KanbanBoard.tsx` на загрузку через `GET /api/board` (`useEffect` + состояние `loading`/`error`)
- [x] Мутации (rename, add, delete, move) -> вызов API с optimistic update + откат при ошибке
- [x] Отображение ошибок API (inline-плашка с `role="alert"`, кнопка «Закрыть»)
- [x] Обновить существующие unit-тесты компонентов (mock `fetch`)
- [x] Обновить e2e-тесты, добавить тесты на постоянство (refresh страницы -> данные сохраняются)

**Тесты:**
- Unit фронтенда: `KanbanBoard` корректно отображает loading/error/данные
- Unit фронтенда: каждая мутация вызывает правильный endpoint с правильным телом
- E2E: перезагрузка страницы сохраняет добавленную карту
- E2E: перемещение карты сохраняется после перезагрузки
- E2E: удаление и переименование колонки сохраняются

**Критерии успеха:**
- Все изменения сохраняются в SQLite
- После F5 состояние восстанавливается
- Optimistic updates работают без визуальных рывков
- Ошибки API видны пользователю

---

## Часть 8: Подключение ИИ (базовое)

**Цель:** разрешить бэкенду делать прямой вызов OpenAI. Проверка простым тестом "2+2".

**Подэтапы:**
- [x] Добавить `openai` в `backend/pyproject.toml`
- [x] Читать `OPENAI_API_KEY` из `.env` через `pydantic-settings`
- [x] `backend/app/ai.py` — функция `call_openai(prompt: str) -> str`, использующая модель `openai/gpt-5-mini`
- [x] Endpoint `POST /api/ai/ping` — принимает `{prompt: str}`, возвращает `{answer: str}`; защищён `current_user`
- [x] pytest с моком OpenAI (`unittest.mock`) — проверить корректность запроса (модель, формат)
- [x] pytest живой (`@pytest.mark.live`, включается флагом `--live`) — `POST /api/ai/ping` с "Сколько будет 2+2?" -> в ответе содержится "4"

**Тесты:**
- Unit (mocked): правильно формируется запрос к OpenAI, модель = `gpt-5-mini`
- Integration (live, opt-in): "2+2" -> ответ содержит "4"
- Auth: без сессии -> 401
- Ошибка OpenAI (rate limit, invalid key) -> 502 с внятным сообщением

**Критерии успеха:**
- Живой тест "2+2" проходит при наличии реального ключа
- Ошибки OpenAI корректно обрабатываются

---

## Часть 9: Структурированные вызовы ИИ с контекстом канбана

**Цель:** отправлять ИИ JSON канбана + вопрос пользователя + историю переписки. Получать структурированный ответ (текст пользователю + опциональный список обновлений канбана). ИИ может создавать/редактировать/перемещать/удалять карточки. Тщательные тесты.

**Подэтапы:**
- [ ] Модель `ChatMessage` (SQLModel): `id, user_id, role, content, created_at`
- [ ] Pydantic-схема `AiResponse`: `{reply: str, actions: list[BoardAction]}`
- [ ] Варианты `BoardAction` (discriminated union): `create_card`, `edit_card`, `move_card`, `delete_card`, `rename_column`
- [ ] Использовать OpenAI Structured Outputs (`response_format=AiResponse`) для гарантии схемы
- [ ] `POST /api/chat` — принимает `{message: str}`, автоматически подгружает историю пользователя из БД, возвращает `AiResponse`
- [ ] Внутри: загрузить текущий board -> составить system prompt с board JSON и правилами -> вызвать OpenAI -> применить `actions` к БД в одной транзакции -> сохранить user- и assistant-сообщения -> вернуть `AiResponse`
- [ ] `GET /api/chat/history` -> история сообщений пользователя
- [ ] `DELETE /api/chat/history` -> очистить историю
- [ ] Логировать все действия ИИ (Python logging)
- [ ] Unit-тесты на каждый вариант `BoardAction` (мок ответа OpenAI, проверка изменений в БД)
- [ ] Integration-тест (live): "создай карту 'купить молоко' в Backlog" -> карта появляется в БД

**Тесты:**
- Unit (mocked): каждый `action_type` корректно применяется к БД
- Unit: невалидный `action` (несуществующий `column_id`) -> транзакция откатывается, возвращается ошибка в `reply`
- Integration (live): реальный запрос выполняет действие в БД
- Sanity: `system prompt` содержит актуальный snapshot board (проверка через мок)
- История: user- и assistant-сообщения сохраняются в правильном порядке

**Критерии успеха:**
- ИИ получает актуальный snapshot канбана в каждом запросе
- Structured Outputs гарантирует соблюдение схемы
- Действия применяются атомарно (транзакция)
- История корректно сохраняется и подгружается

---

## Часть 10: UI чат-виджета боковой панели

**Цель:** красивый чат-виджет в правой боковой панели; полноценный чат с ИИ; при действиях ИИ доска в UI обновляется автоматически.

**Подэтапы:**
- [ ] Компонент `ChatSidebar` (`src/components/ChatSidebar.tsx`) — фиксированная правая панель, коллапсируемая
- [ ] Дизайн по палитре CLAUDE.md (`--primary-blue` для акцентов, `--secondary-purple` для кнопки отправки, `--navy-dark` для заголовка)
- [ ] Список сообщений (user/assistant), автопрокрутка вниз при новом сообщении
- [ ] Поле ввода + кнопка "Отправить" (disabled во время запроса)
- [ ] Loading state ("ИИ думает…")
- [ ] Загрузка истории при монтировании (`GET /api/chat/history`)
- [ ] После ответа: если `actions` не пусты -> `refetch` board (`GET /api/board`) -> UI обновляется
- [ ] В сообщении ассистента показать краткое описание действий (например, "Создал карту 'X' в колонке 'Backlog'")
- [ ] Кнопка "Очистить историю" (`DELETE /api/chat/history`)
- [ ] Unit-тесты компонента (отправка, отображение, loading, refetch board)
- [ ] E2E: пользователь пишет "создай карту 'Тест' в Backlog" -> карта появляется на доске без ручной перезагрузки

**Тесты:**
- Unit: `ChatSidebar` рендерит историю, обрабатывает отправку, показывает loading
- Unit: после ответа с `actions.length > 0` вызывается refetch board
- E2E: полный сценарий "создать карту через ИИ" -> проверка появления карты на доске
- E2E: "переместить карту X в Done" -> карта перемещается в UI

**Критерии успеха:**
- Чат работает end-to-end
- Действия ИИ отражаются в UI без ручной перезагрузки
- Дизайн соответствует палитре CLAUDE.md
- Все тесты (unit + e2e) зелёные
- MVP готов к демонстрации: логин -> доска -> перетаскивание -> чат с ИИ, изменяющим доску
