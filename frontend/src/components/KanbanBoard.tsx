"use client";

import { useEffect, useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { useRouter } from "next/navigation";
import { KanbanColumn } from "@/components/KanbanColumn";
import { KanbanCardPreview } from "@/components/KanbanCardPreview";
import {
  findCardLocation,
  moveCard,
  type BoardData,
} from "@/lib/kanban";
import { api } from "@/lib/api";

const stripPrefix = (id: string) => id.replace(/^(card-|col-)/, "");
const isColumnDropId = (id: string) => id.startsWith("col-");

export const KanbanBoard = () => {
  const router = useRouter();
  const [board, setBoard] = useState<BoardData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [activeCardId, setActiveCardId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .getBoard()
      .then((data) => {
        if (!cancelled) setBoard(data);
      })
      .catch(() => {
        if (!cancelled) setLoadError("Не удалось загрузить доску.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    })
  );

  const activeCard =
    activeCardId && board ? board.cards[activeCardId] ?? null : null;

  const handleLogout = async () => {
    try {
      await api.logout();
    } finally {
      router.replace("/login/");
    }
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveCardId(stripPrefix(event.active.id as string));
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveCardId(null);
    if (!board || !over || active.id === over.id) return;

    const activeIdRaw = active.id as string;
    const overIdRaw = over.id as string;
    const activeCardId = stripPrefix(activeIdRaw);
    const overId = stripPrefix(overIdRaw);
    const overIsColumn = isColumnDropId(overIdRaw);

    const snapshot = board;
    const nextColumns = moveCard(
      board.columns,
      activeCardId,
      overId,
      overIsColumn
    );
    if (nextColumns === board.columns) return;

    const nextBoard = { ...board, columns: nextColumns };
    setBoard(nextBoard);

    const location = findCardLocation(nextColumns, activeCardId);
    if (!location) return;

    api
      .moveCard(activeCardId, location.columnId, location.position)
      .catch(() => {
        setBoard(snapshot);
        setMutationError("Не удалось переместить карточку.");
      });
  };

  const handleRenameColumn = (columnId: string, title: string) => {
    if (!board) return;
    const snapshot = board;
    setBoard({
      ...board,
      columns: board.columns.map((column) =>
        column.id === columnId ? { ...column, title } : column
      ),
    });
    api.renameColumn(columnId, title).catch(() => {
      setBoard(snapshot);
      setMutationError("Не удалось переименовать колонку.");
    });
  };

  const handleAddCard = (
    columnId: string,
    title: string,
    details: string
  ) => {
    if (!board) return;
    const snapshot = board;
    const tempId = `tmp-${Date.now()}`;
    setBoard({
      ...board,
      cards: { ...board.cards, [tempId]: { id: tempId, title, details } },
      columns: board.columns.map((column) =>
        column.id === columnId
          ? { ...column, cardIds: [...column.cardIds, tempId] }
          : column
      ),
    });
    api
      .createCard(columnId, title, details)
      .then((created) => {
        setBoard((current) => {
          if (!current) return current;
          const cards = { ...current.cards };
          delete cards[tempId];
          cards[created.id] = created;
          return {
            ...current,
            cards,
            columns: current.columns.map((column) =>
              column.id === columnId
                ? {
                    ...column,
                    cardIds: column.cardIds.map((id) =>
                      id === tempId ? created.id : id
                    ),
                  }
                : column
            ),
          };
        });
      })
      .catch(() => {
        setBoard(snapshot);
        setMutationError("Не удалось добавить карточку.");
      });
  };

  const handleDeleteCard = (columnId: string, cardId: string) => {
    if (!board) return;
    const snapshot = board;
    setBoard({
      ...board,
      cards: Object.fromEntries(
        Object.entries(board.cards).filter(([id]) => id !== cardId)
      ),
      columns: board.columns.map((column) =>
        column.id === columnId
          ? { ...column, cardIds: column.cardIds.filter((id) => id !== cardId) }
          : column
      ),
    });
    api.deleteCard(cardId).catch(() => {
      setBoard(snapshot);
      setMutationError("Не удалось удалить карточку.");
    });
  };

  const columnTitles = useMemo(
    () => (board ? board.columns.map((c) => c.title) : []),
    [board]
  );

  return (
    <div className="relative overflow-hidden">
      <div className="pointer-events-none absolute left-0 top-0 h-[420px] w-[420px] -translate-x-1/3 -translate-y-1/3 rounded-full bg-[radial-gradient(circle,_rgba(32,157,215,0.25)_0%,_rgba(32,157,215,0.05)_55%,_transparent_70%)]" />
      <div className="pointer-events-none absolute bottom-0 right-0 h-[520px] w-[520px] translate-x-1/4 translate-y-1/4 rounded-full bg-[radial-gradient(circle,_rgba(117,57,145,0.18)_0%,_rgba(117,57,145,0.05)_55%,_transparent_75%)]" />

      <main className="relative mx-auto flex min-h-screen max-w-[1500px] flex-col gap-10 px-6 pb-16 pt-12">
        <header className="flex flex-col gap-6 rounded-[32px] border border-[var(--stroke)] bg-white/80 p-8 shadow-[var(--shadow)] backdrop-blur">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--gray-text)]">
                Single Board Kanban
              </p>
              <h1 className="mt-3 font-display text-4xl font-semibold text-[var(--navy-dark)]">
                Kanban Studio
              </h1>
              <p className="mt-3 max-w-xl text-sm leading-6 text-[var(--gray-text)]">
                Keep momentum visible. Rename columns, drag cards between stages,
                and capture quick notes without getting buried in settings.
              </p>
            </div>
            <div className="flex flex-col items-end gap-3">
              <button
                type="button"
                onClick={handleLogout}
                className="rounded-lg px-4 py-2 text-sm font-semibold text-white"
                style={{ background: "var(--secondary-purple)" }}
              >
                Выйти
              </button>
              <div className="rounded-2xl border border-[var(--stroke)] bg-[var(--surface)] px-5 py-4">
                <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--gray-text)]">
                  Focus
                </p>
                <p className="mt-2 text-lg font-semibold text-[var(--primary-blue)]">
                  One board. Five columns. Zero clutter.
                </p>
              </div>
            </div>
          </div>
          {columnTitles.length > 0 && (
            <div className="flex flex-wrap items-center gap-4">
              {columnTitles.map((title) => (
                <div
                  key={title}
                  className="flex items-center gap-2 rounded-full border border-[var(--stroke)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--navy-dark)]"
                >
                  <span className="h-2 w-2 rounded-full bg-[var(--accent-yellow)]" />
                  {title}
                </div>
              ))}
            </div>
          )}
        </header>

        {mutationError && (
          <div
            role="alert"
            className="flex items-center justify-between rounded-2xl border border-[var(--stroke)] bg-white px-5 py-3 text-sm text-[var(--navy-dark)] shadow-[var(--shadow)]"
          >
            <span>{mutationError}</span>
            <button
              type="button"
              onClick={() => setMutationError(null)}
              className="text-xs font-semibold uppercase tracking-wide text-[var(--primary-blue)]"
              aria-label="Закрыть сообщение об ошибке"
            >
              Закрыть
            </button>
          </div>
        )}

        {loadError ? (
          <div
            role="alert"
            className="rounded-2xl border border-[var(--stroke)] bg-white px-6 py-6 text-sm text-[var(--navy-dark)] shadow-[var(--shadow)]"
          >
            {loadError}
          </div>
        ) : board === null ? (
          <div
            role="status"
            className="rounded-2xl border border-[var(--stroke)] bg-white px-6 py-6 text-sm text-[var(--gray-text)] shadow-[var(--shadow)]"
          >
            Загрузка доски…
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <section className="grid gap-6 lg:grid-cols-5">
              {board.columns.map((column) => (
                <KanbanColumn
                  key={column.id}
                  column={column}
                  cards={column.cardIds.map((cardId) => board.cards[cardId])}
                  onRename={handleRenameColumn}
                  onAddCard={handleAddCard}
                  onDeleteCard={handleDeleteCard}
                />
              ))}
            </section>
            <DragOverlay>
              {activeCard ? (
                <div className="w-[260px]">
                  <KanbanCardPreview card={activeCard} />
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        )}
      </main>
    </div>
  );
};
