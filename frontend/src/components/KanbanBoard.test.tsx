import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KanbanBoard } from "@/components/KanbanBoard";
import type { BoardData } from "@/lib/kanban";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));

const mockBoard = (): BoardData => ({
  columns: [
    { id: "1", title: "Backlog", cardIds: ["1"] },
    { id: "2", title: "Discovery", cardIds: [] },
  ],
  cards: {
    "1": { id: "1", title: "Existing card", details: "Some notes" },
  },
});

type Recorded = { url: string; method: string; body: string | undefined };

const installFetchMock = () => {
  const calls: Recorded[] = [];
  const responders = new Map<string, (body: unknown) => { status: number; body?: unknown }>();

  const on = (
    method: string,
    urlPattern: string,
    handler: (body: unknown) => { status: number; body?: unknown }
  ) => {
    responders.set(`${method} ${urlPattern}`, handler);
  };

  const fetchMock = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = String(input);
    const method = (init.method ?? "GET").toUpperCase();
    const bodyText =
      typeof init.body === "string" ? init.body : undefined;
    calls.push({ url, method, body: bodyText });

    for (const [key, handler] of responders.entries()) {
      const [m, pattern] = key.split(" ", 2);
      if (m !== method) continue;
      if (pattern === url || new RegExp(`^${pattern}$`).test(url)) {
        const parsed = bodyText ? JSON.parse(bodyText) : undefined;
        const { status, body } = handler(parsed);
        return {
          ok: status < 400,
          status,
          json: async () => body,
          text: async () => (body === undefined ? "" : JSON.stringify(body)),
        } as unknown as Response;
      }
    }
    throw new Error(`unmocked request: ${method} ${url}`);
  });

  global.fetch = fetchMock as unknown as typeof fetch;
  return { calls, on };
};

let fetchMock: ReturnType<typeof installFetchMock>;

beforeEach(() => {
  fetchMock = installFetchMock();
  fetchMock.on("GET", "/api/board", () => ({ status: 200, body: mockBoard() }));
  fetchMock.on("GET", "/api/chat/history", () => ({ status: 200, body: [] }));
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("KanbanBoard", () => {
  it("renders loading state, then board data", async () => {
    render(<KanbanBoard />);
    expect(screen.getByRole("status")).toHaveTextContent(/Загрузка/);
    expect(await screen.findByText("Backlog")).toBeInTheDocument();
    expect(screen.getByText("Existing card")).toBeInTheDocument();
    expect(screen.getAllByTestId(/^column-/)).toHaveLength(2);
  });

  it("shows error banner if initial fetch fails", async () => {
    fetchMock.on("GET", "/api/board", () => ({ status: 500 }));
    render(<KanbanBoard />);
    expect(
      await screen.findByText("Не удалось загрузить доску.")
    ).toBeInTheDocument();
  });

  it("adds a card via POST and shows it in the column", async () => {
    fetchMock.on("POST", "/api/board/columns/1/cards", (body) => ({
      status: 201,
      body: {
        id: "99",
        title: (body as { title: string }).title,
        details: (body as { details: string }).details,
      },
    }));

    render(<KanbanBoard />);
    const backlog = await screen.findByTestId("column-1");
    await userEvent.click(
      within(backlog).getByRole("button", { name: /add a card/i })
    );
    await userEvent.type(within(backlog).getByPlaceholderText(/card title/i), "New card");
    await userEvent.type(within(backlog).getByPlaceholderText(/details/i), "Notes");
    await userEvent.click(
      within(backlog).getByRole("button", { name: /add card/i })
    );

    await waitFor(() => {
      expect(
        fetchMock.calls.some(
          (c) =>
            c.method === "POST" &&
            c.url === "/api/board/columns/1/cards" &&
            c.body === JSON.stringify({ title: "New card", details: "Notes" })
        )
      ).toBe(true);
    });
    expect(await within(backlog).findByText("New card")).toBeInTheDocument();
  });

  it("deletes a card via DELETE and removes it from the column", async () => {
    fetchMock.on("DELETE", "/api/board/cards/1", () => ({ status: 204 }));

    render(<KanbanBoard />);
    const backlog = await screen.findByTestId("column-1");
    await userEvent.click(
      within(backlog).getByRole("button", { name: /delete existing card/i })
    );

    await waitFor(() => {
      expect(
        fetchMock.calls.some(
          (c) => c.method === "DELETE" && c.url === "/api/board/cards/1"
        )
      ).toBe(true);
    });
    expect(within(backlog).queryByText("Existing card")).not.toBeInTheDocument();
  });

  it("renames a column via PATCH on blur", async () => {
    fetchMock.on("PATCH", "/api/board/columns/1", (body) => ({
      status: 200,
      body: { id: "1", title: (body as { title: string }).title, cardIds: ["1"] },
    }));

    render(<KanbanBoard />);
    const backlog = await screen.findByTestId("column-1");
    const input = within(backlog).getByLabelText("Column title");
    await userEvent.clear(input);
    await userEvent.type(input, "Icebox");
    await userEvent.tab();

    await waitFor(() => {
      expect(
        fetchMock.calls.some(
          (c) =>
            c.method === "PATCH" &&
            c.url === "/api/board/columns/1" &&
            c.body === JSON.stringify({ title: "Icebox" })
        )
      ).toBe(true);
    });
  });

  it("reverts and shows an error when a mutation fails", async () => {
    fetchMock.on("DELETE", "/api/board/cards/1", () => ({ status: 500 }));

    render(<KanbanBoard />);
    const backlog = await screen.findByTestId("column-1");
    await userEvent.click(
      within(backlog).getByRole("button", { name: /delete existing card/i })
    );

    expect(
      await screen.findByText("Не удалось удалить карточку.")
    ).toBeInTheDocument();
    expect(within(backlog).getByText("Existing card")).toBeInTheDocument();
  });
});
