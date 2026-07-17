import { findCardLocation, moveCard, type Column } from "@/lib/kanban";

describe("moveCard", () => {
  const baseColumns: Column[] = [
    { id: "col-a", title: "A", cardIds: ["card-1", "card-2"] },
    { id: "col-b", title: "B", cardIds: ["card-3"] },
  ];

  it("reorders cards in the same column", () => {
    const result = moveCard(baseColumns, "card-2", "card-1", false);
    expect(result[0].cardIds).toEqual(["card-2", "card-1"]);
  });

  it("moves cards to another column when dropped on a card", () => {
    const result = moveCard(baseColumns, "card-2", "card-3", false);
    expect(result[0].cardIds).toEqual(["card-1"]);
    expect(result[1].cardIds).toEqual(["card-2", "card-3"]);
  });

  it("drops cards to the end of a column when dropped on the column", () => {
    const result = moveCard(baseColumns, "card-1", "col-b", true);
    expect(result[0].cardIds).toEqual(["card-2"]);
    expect(result[1].cardIds).toEqual(["card-3", "card-1"]);
  });
});

describe("findCardLocation", () => {
  const columns: Column[] = [
    { id: "col-a", title: "A", cardIds: ["card-1", "card-2"] },
    { id: "col-b", title: "B", cardIds: ["card-3"] },
  ];

  it("finds a card by id and returns column id + index", () => {
    expect(findCardLocation(columns, "card-2")).toEqual({
      columnId: "col-a",
      position: 1,
    });
    expect(findCardLocation(columns, "card-3")).toEqual({
      columnId: "col-b",
      position: 0,
    });
  });

  it("returns null if card is not on the board", () => {
    expect(findCardLocation(columns, "missing")).toBeNull();
  });
});
