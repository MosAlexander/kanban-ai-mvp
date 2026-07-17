# Схема БД и стратегия персистентности

Проектный документ Части 5. Реализация — в Части 6.

## Сущности и связи

```
User (1) ────< (N) Board (1) ────< (N) Column (1) ────< (N) Card
  │
  └────< (N) ChatMessage
```

- `User 1—N Board` — в MVP всегда 1 доска, схема готова к N в будущем.
- `Board 1—N Column` — упорядочены по `position` ASC.
- `Column 1—N Card` — упорядочены по `position` ASC.
- `User 1—N ChatMessage` — история чата с ИИ (Часть 9).

Формальная форма строк каждой таблицы — в [schema.json](schema.json).

## Выбор ORM: SQLModel

- Единая декларация модели даёт и SQLAlchemy 2.0 (для БД), и Pydantic (для валидации/сериализации FastAPI) — не нужно писать два параллельных класса на каждую сущность.
- Нативная поддержка FastAPI в качестве response/body-моделей.
- Автор — Sebastián Ramírez (автор FastAPI), стек согласован по конвенциям.
- Использует SQLAlchemy 2.0 под капотом — при необходимости всегда доступен низкоуровневый API.

Драйвер SQLite: асинхронный `aiosqlite` через SQLAlchemy `create_async_engine` (согласно PLAN.md, Часть 6). FastAPI-роуты объявляются как `async def` и получают `AsyncSession` через dependency; сессии не смешиваются с sync-API.

## Автосоздание БД

- Файл БД: `./data/pm.db` (том уже смонтирован в [docker-compose.yml](../docker-compose.yml#L8-L9): `./data:/app/data`).
- При старте FastAPI: если файла нет, `SQLModel.metadata.create_all(engine)` создаёт все таблицы, затем выполняется seed.
- Если файл есть — ничего не делаем, поднимаемся на существующей БД.
- Миграций (Alembic) в MVP нет: схема фиксируется в Части 5, дальнейшие изменения предполагают ручное удаление `data/pm.db`. Для продакшна это, разумеется, недостаточно — но выходит за рамки MVP.

## Seed при первом создании

Выполняется один раз при создании БД:

1. `User(username="пользователь", password_hash=NULL)` — id 1.
2. `Board(user_id=1, title="My Board")` — id 1.
3. 5 колонок с шагом 1000:
   - Backlog (position 1000)
   - Discovery (position 2000)
   - In Progress (position 3000)
   - Review (position 4000)
   - Done (position 5000)
4. 8 демо-карточек — те же тексты, что в [frontend/src/lib/kanban.ts:18-72](../frontend/src/lib/kanban.ts#L18-L72), с сохранением исходного распределения по колонкам. Позиции внутри колонки — с шагом 1000 (первая 1000, вторая 2000).

Seed идемпотентен по условию «файла БД не было» — при существующем файле не запускается.

## Стратегия упорядочивания

`position INTEGER` с шагом 1000 (не FLOAT, не строковые ключи).

- Вставка между двумя элементами `(pos_a, pos_b)` — новое значение `(pos_a + pos_b) / 2`. При шаге 1000 это позволяет ~10 вставок между парой без коллизий (10, 5, 2, 1, ...).
- При достижении соседей на расстоянии 1 — ремап колонки: `UPDATE ... SET position = row_number * 1000 ORDER BY position` в одной транзакции. Для MVP допустимо и достаточно.
- Дешевле, чем FLOAT (нет накопления погрешности) и проще, чем LexoRank/фракционные строки.
- Уникальность `(parent_id, position)` не enforce-им — при коллизиях сортировка стабилизируется вторичным ключом `id ASC`.

## Foreign keys и индексы

- FK: `Board.user_id -> User.id`, `Column.board_id -> Board.id`, `Card.column_id -> Column.id`, `ChatMessage.user_id -> User.id`.
- `ON DELETE`: в MVP не удаляем ни пользователя, ни доску, поэтому оставляем поведение по умолчанию (`NO ACTION`). При удалении карточки/колонки — обычный `DELETE` из соответствующей таблицы; каскады не требуются.
- SQLite по умолчанию не enforce-ит FK — включаем `PRAGMA foreign_keys = ON` в event-листенере на `engine.connect`.

Индексы:
- `User.username` — UNIQUE (нужен для будущего логина по username и предотвращения дублей seed).
- `Board.user_id` — для будущего `GET /api/board` по нескольким доскам на пользователя.
- Composite `Column(board_id, position)` — покрывает основной запрос «все колонки доски в порядке».
- Composite `Card(column_id, position)` — то же для карточек колонки.
- Composite `ChatMessage(user_id, created_at)` — история пользователя в хронологии (Часть 9).

Первичные ключи индексированы автоматически.

## Маппинг БД <-> API

Формат ответа `GET /api/board` — `BoardResponse` в [schema.json](schema.json), совпадает 1-в-1 с TS-типом `BoardData` во [frontend/src/lib/kanban.ts:13-16](../frontend/src/lib/kanban.ts#L13-L16).

Ключевое правило маппинга:
- В БД `id` — `INTEGER PRIMARY KEY`.
- В JSON-ответе `id` — `str(int_id)`. Фронт уже работает со строковыми id (`"col-backlog"`, `"card-1"`), после Части 6 они станут просто `"1"`, `"2"`, ... — компонентам всё равно, они трактуют id как непрозрачные строки.
- `Card.position` и `Column.position` наружу **не** выставляются: порядок передаётся через порядок массивов `columns[]` и `columns[i].cardIds[]`. Это соответствует существующей фронт-модели без изменений.
- Метки времени (`created_at`, `updated_at`) в ответе `GET /api/board` тоже не выставляются в MVP — фронт их не показывает. Хранятся исключительно для отладки и будущей optimistic concurrency.

## Обновление `updated_at`

Только на `Column` и `Card` (единственные мутабельные сущности).

- Установка при insert: `default_factory=lambda: datetime.now(UTC)`.
- Обновление при update: явное присвоение в роутере перед `session.commit()` (простой и явный путь; SQLAlchemy `onupdate` тоже возможен, но добавляет магию).

`User`, `Board`, `ChatMessage` — только `created_at`.

## Что не входит в MVP

- Мягкое удаление / архив карточек — обычный `DELETE`.
- Права/роли — единственный юзер, всё принадлежит ему.
- Аудит-лог изменений — есть только `updated_at`.
- Полнотекстовый поиск по карточкам.
- Alembic-миграции.
