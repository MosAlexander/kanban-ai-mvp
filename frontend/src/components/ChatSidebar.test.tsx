import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChatSidebar } from "@/components/ChatSidebar";

type Recorded = { url: string; method: string; body: string | undefined };

const installFetchMock = () => {
  const calls: Recorded[] = [];
  const responders = new Map<
    string,
    (body: unknown) => { status: number; body?: unknown }
  >();

  const on = (
    method: string,
    urlPattern: string,
    handler: (body: unknown) => { status: number; body?: unknown }
  ) => {
    responders.set(`${method} ${urlPattern}`, handler);
  };

  const fetchMock = vi.fn(
    async (input: RequestInfo | URL, init: RequestInit = {}) => {
      const url = String(input);
      const method = (init.method ?? "GET").toUpperCase();
      const bodyText =
        typeof init.body === "string" ? init.body : undefined;
      calls.push({ url, method, body: bodyText });

      for (const [key, handler] of responders.entries()) {
        const [m, pattern] = key.split(" ", 2);
        if (m !== method) continue;
        if (pattern === url) {
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
    }
  );

  global.fetch = fetchMock as unknown as typeof fetch;
  return { calls, on };
};

let fetchMock: ReturnType<typeof installFetchMock>;

beforeEach(() => {
  fetchMock = installFetchMock();
  fetchMock.on("GET", "/api/chat/history", () => ({ status: 200, body: [] }));
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ChatSidebar", () => {
  it("loads and renders history on mount", async () => {
    fetchMock.on("GET", "/api/chat/history", () => ({
      status: 200,
      body: [
        { role: "user", content: "Первое сообщение", created_at: "2026-07-17T10:00:00Z" },
        { role: "assistant", content: "Первый ответ", created_at: "2026-07-17T10:00:01Z" },
      ],
    }));
    render(<ChatSidebar onBoardChanged={vi.fn()} />);
    expect(await screen.findByText("Первое сообщение")).toBeInTheDocument();
    expect(screen.getByText("Первый ответ")).toBeInTheDocument();
  });

  it("sends a message via POST /api/chat and appends both messages", async () => {
    fetchMock.on("POST", "/api/chat", (body) => {
      const { message } = body as { message: string };
      return {
        status: 200,
        body: { reply: `эхо: ${message}`, actions: [] },
      };
    });

    const onBoardChanged = vi.fn();
    render(<ChatSidebar onBoardChanged={onBoardChanged} />);
    await screen.findByRole("button", { name: /отправить/i });

    await userEvent.type(screen.getByLabelText("Сообщение ИИ"), "Привет");
    await userEvent.click(screen.getByRole("button", { name: /отправить/i }));

    expect(await screen.findByText("Привет")).toBeInTheDocument();
    expect(await screen.findByText("эхо: Привет")).toBeInTheDocument();
    expect(
      fetchMock.calls.some(
        (c) =>
          c.method === "POST" &&
          c.url === "/api/chat" &&
          c.body === JSON.stringify({ message: "Привет" })
      )
    ).toBe(true);
    expect(onBoardChanged).not.toHaveBeenCalled();
  });

  it("shows 'ИИ думает…' while awaiting response", async () => {
    let resolveResponse: (v: {
      status: number;
      body?: unknown;
    }) => void = () => {};
    const pending = new Promise<{ status: number; body?: unknown }>(
      (resolve) => {
        resolveResponse = resolve;
      }
    );
    fetchMock.on("POST", "/api/chat", () => {
      // deliberately return a promise-like via mutation trick
      return { status: 200, body: { reply: "ok", actions: [] } };
    });
    // override the mock behavior to await our controllable promise
    const original = global.fetch;
    global.fetch = vi.fn(async (input, init) => {
      if (String(input) === "/api/chat") {
        const { status, body } = await pending;
        return {
          ok: status < 400,
          status,
          json: async () => body,
          text: async () => JSON.stringify(body),
        } as unknown as Response;
      }
      return (original as typeof fetch)(input, init);
    }) as unknown as typeof fetch;

    render(<ChatSidebar onBoardChanged={vi.fn()} />);
    await screen.findByRole("button", { name: /отправить/i });
    await userEvent.type(screen.getByLabelText("Сообщение ИИ"), "hi");
    await userEvent.click(screen.getByRole("button", { name: /отправить/i }));

    expect(await screen.findByText("ИИ думает…")).toBeInTheDocument();

    resolveResponse({ status: 200, body: { reply: "готово", actions: [] } });
    await waitFor(() => {
      expect(screen.queryByText("ИИ думает…")).not.toBeInTheDocument();
    });
    expect(screen.getByText("готово")).toBeInTheDocument();
  });

  it("calls onBoardChanged when response contains actions", async () => {
    fetchMock.on("POST", "/api/chat", () => ({
      status: 200,
      body: {
        reply: "Создал.",
        actions: [
          {
            type: "create_card",
            column_id: "1",
            title: "Молоко",
            details: "",
          },
        ],
      },
    }));

    const onBoardChanged = vi.fn();
    render(<ChatSidebar onBoardChanged={onBoardChanged} />);
    await screen.findByRole("button", { name: /отправить/i });
    await userEvent.type(screen.getByLabelText("Сообщение ИИ"), "создай");
    await userEvent.click(screen.getByRole("button", { name: /отправить/i }));

    await waitFor(() => expect(onBoardChanged).toHaveBeenCalledTimes(1));
    expect(
      await screen.findByText("Создал карточку «Молоко»")
    ).toBeInTheDocument();
  });

  it("shows error banner on 502 and does not append messages", async () => {
    fetchMock.on("POST", "/api/chat", () => ({ status: 502 }));
    render(<ChatSidebar onBoardChanged={vi.fn()} />);
    await screen.findByRole("button", { name: /отправить/i });
    await userEvent.type(screen.getByLabelText("Сообщение ИИ"), "падение");
    await userEvent.click(screen.getByRole("button", { name: /отправить/i }));

    expect(
      await screen.findByText("Не удалось отправить сообщение.")
    ).toBeInTheDocument();
    const list = screen.getByTestId("chat-messages");
    expect(list.textContent).not.toContain("падение");
  });

  it("clears history via DELETE after confirm and empties the list", async () => {
    fetchMock.on("GET", "/api/chat/history", () => ({
      status: 200,
      body: [
        {
          role: "user",
          content: "existing",
          created_at: "2026-07-17T10:00:00Z",
        },
      ],
    }));
    fetchMock.on("DELETE", "/api/chat/history", () => ({ status: 204 }));
    vi.spyOn(window, "confirm").mockReturnValue(true);

    render(<ChatSidebar onBoardChanged={vi.fn()} />);
    expect(await screen.findByText("existing")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /очистить/i }));

    await waitFor(() => {
      expect(
        fetchMock.calls.some(
          (c) => c.method === "DELETE" && c.url === "/api/chat/history"
        )
      ).toBe(true);
    });
    expect(screen.queryByText("existing")).not.toBeInTheDocument();
  });

  it("does not clear history if user cancels confirm", async () => {
    fetchMock.on("GET", "/api/chat/history", () => ({
      status: 200,
      body: [
        {
          role: "user",
          content: "keep me",
          created_at: "2026-07-17T10:00:00Z",
        },
      ],
    }));
    vi.spyOn(window, "confirm").mockReturnValue(false);

    render(<ChatSidebar onBoardChanged={vi.fn()} />);
    expect(await screen.findByText("keep me")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /очистить/i }));

    expect(
      fetchMock.calls.some(
        (c) => c.method === "DELETE" && c.url === "/api/chat/history"
      )
    ).toBe(false);
    expect(screen.getByText("keep me")).toBeInTheDocument();
  });

  it("collapses and re-expands the panel", async () => {
    render(<ChatSidebar onBoardChanged={vi.fn()} />);
    await screen.findByRole("button", { name: /отправить/i });
    await userEvent.click(screen.getByRole("button", { name: /свернуть чат/i }));
    expect(screen.queryByRole("button", { name: /отправить/i })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /развернуть чат/i }));
    expect(screen.getByRole("button", { name: /отправить/i })).toBeInTheDocument();
  });
});
