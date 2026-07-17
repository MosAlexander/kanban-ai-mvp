import type { BoardData, Card, Column } from "@/lib/kanban";

export type SessionStatus = { authenticated: boolean };

async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(path, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
}

async function jsonOrThrow<T>(res: Response, action: string): Promise<T> {
  if (!res.ok) {
    throw new Error(`${action} failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  async getSession(): Promise<SessionStatus> {
    const res = await apiFetch("/api/session");
    return jsonOrThrow<SessionStatus>(res, "GET /api/session");
  },
  async login(username: string, password: string): Promise<SessionStatus> {
    const res = await apiFetch("/api/session", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
    if (!res.ok) throw new Error("Invalid credentials");
    return res.json();
  },
  async logout(): Promise<void> {
    const res = await apiFetch("/api/session", { method: "DELETE" });
    if (!res.ok) throw new Error(`DELETE /api/session failed: ${res.status}`);
  },

  async getBoard(): Promise<BoardData> {
    const res = await apiFetch("/api/board");
    return jsonOrThrow<BoardData>(res, "GET /api/board");
  },
  async renameColumn(columnId: string, title: string): Promise<Column> {
    const res = await apiFetch(`/api/board/columns/${columnId}`, {
      method: "PATCH",
      body: JSON.stringify({ title }),
    });
    return jsonOrThrow<Column>(res, `PATCH column ${columnId}`);
  },
  async createCard(
    columnId: string,
    title: string,
    details: string
  ): Promise<Card> {
    const res = await apiFetch(`/api/board/columns/${columnId}/cards`, {
      method: "POST",
      body: JSON.stringify({ title, details }),
    });
    return jsonOrThrow<Card>(res, `POST card in ${columnId}`);
  },
  async updateCard(
    cardId: string,
    patch: { title?: string; details?: string }
  ): Promise<Card> {
    const res = await apiFetch(`/api/board/cards/${cardId}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    });
    return jsonOrThrow<Card>(res, `PATCH card ${cardId}`);
  },
  async deleteCard(cardId: string): Promise<void> {
    const res = await apiFetch(`/api/board/cards/${cardId}`, {
      method: "DELETE",
    });
    if (!res.ok) throw new Error(`DELETE card ${cardId} failed: ${res.status}`);
  },
  async moveCard(
    cardId: string,
    columnId: string,
    position: number
  ): Promise<void> {
    const res = await apiFetch(`/api/board/cards/${cardId}/position`, {
      method: "PATCH",
      body: JSON.stringify({ column_id: Number(columnId), position }),
    });
    if (!res.ok) throw new Error(`PATCH card ${cardId} position failed: ${res.status}`);
  },
};
