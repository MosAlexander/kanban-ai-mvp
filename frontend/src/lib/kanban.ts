export type Card = {
  id: string;
  title: string;
  details: string;
};

export type Column = {
  id: string;
  title: string;
  cardIds: string[];
};

export type BoardData = {
  columns: Column[];
  cards: Record<string, Card>;
};

export const moveCard = (
  columns: Column[],
  activeCardId: string,
  overId: string,
  overIsColumn: boolean
): Column[] => {
  const activeColumn = columns.find((column) =>
    column.cardIds.includes(activeCardId)
  );
  if (!activeColumn) return columns;

  const overColumnId = overIsColumn
    ? overId
    : columns.find((column) => column.cardIds.includes(overId))?.id;
  if (!overColumnId) return columns;
  const overColumn = columns.find((column) => column.id === overColumnId);
  if (!overColumn) return columns;

  if (activeColumn.id === overColumn.id) {
    if (overIsColumn) {
      const nextCardIds = activeColumn.cardIds.filter((id) => id !== activeCardId);
      nextCardIds.push(activeCardId);
      return columns.map((column) =>
        column.id === activeColumn.id
          ? { ...column, cardIds: nextCardIds }
          : column
      );
    }

    const oldIndex = activeColumn.cardIds.indexOf(activeCardId);
    const newIndex = activeColumn.cardIds.indexOf(overId);
    if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) {
      return columns;
    }
    const nextCardIds = [...activeColumn.cardIds];
    nextCardIds.splice(oldIndex, 1);
    nextCardIds.splice(newIndex, 0, activeCardId);
    return columns.map((column) =>
      column.id === activeColumn.id
        ? { ...column, cardIds: nextCardIds }
        : column
    );
  }

  const nextActiveCardIds = activeColumn.cardIds.filter(
    (id) => id !== activeCardId
  );
  const nextOverCardIds = [...overColumn.cardIds];
  if (overIsColumn) {
    nextOverCardIds.push(activeCardId);
  } else {
    const overIndex = overColumn.cardIds.indexOf(overId);
    const insertIndex = overIndex === -1 ? nextOverCardIds.length : overIndex;
    nextOverCardIds.splice(insertIndex, 0, activeCardId);
  }

  return columns.map((column) => {
    if (column.id === activeColumn.id) {
      return { ...column, cardIds: nextActiveCardIds };
    }
    if (column.id === overColumn.id) {
      return { ...column, cardIds: nextOverCardIds };
    }
    return column;
  });
};

export const findCardLocation = (
  columns: Column[],
  cardId: string
): { columnId: string; position: number } | null => {
  for (const column of columns) {
    const idx = column.cardIds.indexOf(cardId);
    if (idx !== -1) return { columnId: column.id, position: idx };
  }
  return null;
};
