# frontend/ — существующий код

Демонстрационная фронтенд-версия доски Kanban. Работает автономно с мок-данными, без бэкенда, без аутентификации, без персистентности. Точка отсчёта для интеграции с FastAPI + SQLite + ИИ.

## Стек

- NextJS 16 (App Router)
- React 19, TypeScript 5
- Tailwind CSS v4 (через `@tailwindcss/postcss`)
- `@dnd-kit` (`core`, `sortable`, `utilities`) — drag-and-drop
- `clsx` — условные className
- Тесты: Vitest + `@testing-library/react` (unit), Playwright (e2e)

## Структура

```
frontend/
├─ src/
│  ├─ app/
│  │  ├─ layout.tsx         # корневой layout, шрифты (Space Grotesk, Manrope), метаданные
│  │  ├─ page.tsx           # главная — рендерит <KanbanBoard />
│  │  ├─ globals.css        # CSS-переменные с палитрой CLAUDE.md
│  │  └─ favicon.ico
│  ├─ components/
│  │  ├─ KanbanBoard.tsx        # контейнер: <DndContext>, всё состояние, все хэндлеры
│  │  ├─ KanbanBoard.test.tsx   # 3 unit-теста (рендер, переименование, add/remove card)
│  │  ├─ KanbanColumn.tsx       # колонка (droppable + inline-редактирование заголовка)
│  │  ├─ KanbanCard.tsx         # карточка (sortable draggable)
│  │  ├─ KanbanCardPreview.tsx  # ghost во время перетаскивания
│  │  └─ NewCardForm.tsx        # форма добавления карточки
│  ├─ lib/
│  │  ├─ kanban.ts       # типы (Card, Column, BoardData), initialData, moveCard(), createId()
│  │  └─ kanban.test.ts  # 3 unit-теста логики move
│  └─ test/
│     ├─ setup.ts        # инициализация @testing-library/jest-dom
│     └─ vitest.d.ts
├─ tests/                # Playwright e2e
│  └─ kanban.spec.ts     # 3 сценария (загрузка, добавление, перетаскивание)
├─ public/
├─ package.json
├─ next.config.ts        # ПУСТОЙ (см. "Что отсутствует")
├─ playwright.config.ts  # baseURL http://127.0.0.1:3000, Chromium
├─ vitest.config.ts      # jsdom
├─ tsconfig.json
├─ postcss.config.mjs    # @tailwindcss/postcss
└─ eslint.config.mjs
```

Нет каталогов `contexts/`, `hooks/`, `services/`, `utils/`. Всё состояние живёт локально в `KanbanBoard.tsx`.

## Модель данных

`src/lib/kanban.ts`:

```ts
type Card = { id: string; title: string; details: string };
type Column = { id: string; title: string; cardIds: string[] };
type BoardData = { columns: Column[]; cards: Record<string, Card> };
```

Модель совпадает 1-в-1 с ответом `GET /api/board` (Часть 6). Все id — строки: бэкенд отдаёт `str(int_id)` (`"1"`, `"2"`, ...).

Основные функции:
- `moveCard(columns, activeCardId, overId, overIsColumn)` — переупорядочивание внутри колонки, перемещение между колонками, drop в пустую колонку. Явный флаг `overIsColumn` — потому что id колонки и карточки после Части 7 могут совпадать (оба — просто целые в виде строк), автоопределение по значению больше не работает.
- `findCardLocation(columns, cardId)` — возвращает `{ columnId, position }` (0-based индекс) для нужного вызова `PATCH /api/board/cards/{id}/position`.

`initialData` и `createId` удалены — данные приходят с бэкенда, id назначает БД.

## Состояние и интеграция с API (Часть 7)

Всё локально в `src/components/KanbanBoard.tsx`:

```ts
const [board, setBoard] = useState<BoardData | null>(null);
const [loadError, setLoadError] = useState<string | null>(null);
const [mutationError, setMutationError] = useState<string | null>(null);
const [activeCardId, setActiveCardId] = useState<string | null>(null);
```

- На монтировании `GET /api/board` (`useEffect`). До ответа — плашка «Загрузка доски…» (`role="status"`). На ошибке — плашка `loadError`.
- Каждая мутация делает **optimistic update**: сохраняет snapshot, применяет изменение к состоянию, шлёт запрос. При ошибке — `setBoard(snapshot)` + плашка `mutationError` (`role="alert"`, с кнопкой «Закрыть»).
- Добавление карточки: сначала кладём временную карточку с id `tmp-<timestamp>`, после `POST` заменяем на реальный id из ответа сервера.
- Переименование колонки: fires `onBlur` (не по каждому нажатию) — иначе был бы PATCH на каждый символ.
- Перемещение: после локального `moveCard` находим итоговый `{ columnId, position }` через `findCardLocation` и шлём `PATCH /api/board/cards/{id}/position`.

## Drag-and-Drop

`@dnd-kit`:
- `KanbanBoard.tsx` оборачивает всё в `<DndContext>` с `PointerSensor` (activation 6px) и `closestCorners`
- `<DragOverlay>` рендерит ghost во время перетаскивания
- `KanbanColumn.tsx` — `useDroppable({ id: "col-<id>" })`
- `KanbanCard.tsx` — `useSortable({ id: "card-<id>" })` + `CSS.Transform`
- **Префиксы обязательны**: после Части 7 id колонок и карточек — просто целые в виде строк, могут совпадать. `col-` и `card-` разводят их в разные namespace-ы dnd-kit. В `handleDragStart/End` префикс отсекается `stripPrefix`, а `isColumnDropId` определяет тип цели drop.

## Стилизация

Tailwind CSS v4. Палитра из CLAUDE.md уже интегрирована как CSS custom properties в `src/app/globals.css`:

```
--accent-yellow: #ecad0a
--primary-blue: #209dd7
--secondary-purple: #753991
--navy-dark: #032147
--gray-text: #888888
```

Плюс вспомогательные: `--surface`, `--surface-strong`, `--stroke`, `--shadow`. Только светлая тема.

Шрифты (Google Fonts): **Space Grotesk** (h1/h4), **Manrope** (body).

Нет CSS-модулей и Sass — только Tailwind + inline utility classes.

## Скрипты (`package.json`)

- `npm run dev` — dev-сервер на 3000
- `npm run build` — прод-сборка (сейчас: NextJS server; в Части 3 переключим на статический экспорт)
- `npm run start` — прод-сервер
- `npm run test` / `test:unit` / `test:unit:watch` — Vitest
- `npm run test:e2e` — Playwright
- `npm run test:all` — все тесты подряд
- `npm run lint` — ESLint 9 + `eslint-config-next`

## Тесты (все проходят)

- 21 unit (Vitest): 6 `KanbanBoard.test.tsx`, 5 `kanban.test.ts`, 2 `login/page.test.tsx`, 8 `ChatSidebar.test.tsx` (load history, send + POST /api/chat, loading placeholder, refetch board on actions, 502 error, clear-with-confirm, cancel-confirm, collapse/expand)
- 11 e2e (Playwright, viewport 1600×900): `auth.spec.ts` (4), `kanban.spec.ts` (4), `chat.spec.ts` (3: send-with-mock creates real card via board API + refresh, collapse/expand, clear-with-confirm)
- Vitest: jsdom, globals, coverage (text + html)
- Playwright: против собранного контейнера (`PLAYWRIGHT_BASE_URL=http://localhost:8000` через `--network host` в контейнере с playwright); при отсутствии переменной запускается локальный `npm run dev`

## Чат с ИИ (Часть 10)

- `src/components/ChatSidebar.tsx` — sticky flex-sibling панель справа (`w-[380px]`, `sticky top-0 h-screen shrink-0`), коллапсируемая до `w-12` (кнопка `‹` для развернуть). Открыта по умолчанию. Живёт внутри [KanbanBoard.tsx](src/components/KanbanBoard.tsx) как sibling `<main>`.
- Пропс `onBoardChanged: () => void` — вызывается после ответа ИИ, если `response.actions.length > 0`. `KanbanBoard` реализует `refetchBoard` через `api.getBoard()`.
- `useEffect` при монтировании подтягивает `GET /api/chat/history`, автопрокрутка вниз в `useEffect([messages.length, isSending])`.
- Отображение actions в assistant-сообщении: под текстом `reply` — `<ul>` серым курсивом. Форматы: `Создал карточку «<title>»`, `Отредактировал карточку #<id>`, `Переместил карточку #<id> в колонку #<id>, позиция N`, `Удалил карточку #<id>`, `Переименовал колонку #<id> → «<title>»`.
- Loading: пока идёт запрос — плашка "ИИ думает…" в конце списка + кнопка `Отправить` disabled.
- Ошибка 502: плашка `role="alert"` над input; сообщение пользователя НЕ добавляется в чат (backend его не сохранил), но остаётся в textarea для retry.
- Кнопка `Очистить` в шапке: `window.confirm("Очистить историю чата?")` → `DELETE /api/chat/history` → локально `messages=[]`.
- Enter отправляет; Shift+Enter — перенос строки.

## Что отсутствует (будет добавлено)

- Ничего критического для MVP. Возможные расширения: resolve id→title в actions display, keyboard shortcut для сворачивания панели, стриминг ответов ИИ.

## Аутентификация (Часть 4)

- `src/lib/api.ts` — fetch-хелпер с `credentials: "include"`; методы `getSession`, `login`, `logout`
- `src/components/AuthGate.tsx` — клиентский guard, обёртывает `children` в `layout.tsx`; на каждой смене `pathname` делает `GET /api/session`, редиректит по результату; `PUBLIC_PATHS = ["/login", "/login/"]`
- `src/app/login/page.tsx` — форма входа (username, password); при 401 показывает `Неверные учётные данные`; при успехе `router.replace("/")` (AuthGate рефетчит на смену `pathname` и пропускает)
- Кнопка "Выйти" в шапке `KanbanBoard` — `DELETE /api/session` + `router.replace("/login/")`
- Учётные данные MVP: `пользователь` / `пароль` (хранятся в `backend/app/config.py` как pydantic-settings-defaults)

## Статический экспорт (Часть 3)

- `next.config.ts`: `output: "export"`, `trailingSlash: true`, `images: { unoptimized: true }`
- `npm run build` создаёт `frontend/out/`; в Docker Stage 1 (`node:20-slim`) артефакт копируется в `/app/static/`, откуда FastAPI обслуживает его по `/`
- `playwright.config.ts` поддерживает `PLAYWRIGHT_BASE_URL` (например, `http://host.docker.internal:8000`) для запуска e2e против собранного контейнера; при отсутствии переменной запускается локальный `npm run dev`. Viewport 1600×900 — нужен, чтобы ChatSidebar (380px sticky) не сжимал 5 колонок доски до перекрытия карточек

## Точки расширения

- **API-слой:** `src/lib/api.ts` — единственное место для fetch-вызовов; `credentials: 'include'` для cookie-сессии
- **Состояние board:** заменить `useState<BoardData>(() => initialData)` в `KanbanBoard.tsx` на `useEffect(fetch board)` + optimistic updates в каждом хэндлере
- **Аутентификация:** `AuthProvider` (React Context) в `src/app/layout.tsx` или `middleware.ts` — проверка `GET /api/session` и редирект на `/login`
- **Чат с ИИ:** отдельный компонент `ChatSidebar` рядом с `KanbanBoard`, после ответа ИИ с `actions` — refetch board (или SWR-подобная инвалидация)
