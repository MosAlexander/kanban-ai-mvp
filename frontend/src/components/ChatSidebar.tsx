"use client";

import { useEffect, useRef, useState } from "react";
import { api, type AiResponse, type BoardAction, type ChatMessage } from "@/lib/api";

const describeAction = (action: BoardAction): string => {
  switch (action.type) {
    case "create_card":
      return `Создал карточку «${action.title}»`;
    case "edit_card":
      return `Отредактировал карточку #${action.card_id}`;
    case "move_card":
      return `Переместил карточку #${action.card_id} в колонку #${action.column_id}, позиция ${action.position}`;
    case "delete_card":
      return `Удалил карточку #${action.card_id}`;
    case "rename_column":
      return `Переименовал колонку #${action.column_id} → «${action.title}»`;
  }
};

type Props = {
  onBoardChanged: () => void;
};

type UiMessage = ChatMessage & { actions?: BoardAction[] };

export const ChatSidebar = ({ onBoardChanged }: Props) => {
  const [open, setOpen] = useState(true);
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .getChatHistory()
      .then((history) => {
        if (!cancelled) setMessages(history);
      })
      .catch(() => {
        if (!cancelled) setError("Не удалось загрузить историю.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages.length, isSending]);

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed || isSending) return;
    setError(null);
    setIsSending(true);
    try {
      const response: AiResponse = await api.sendChatMessage(trimmed);
      const now = new Date().toISOString();
      setMessages((prev) => [
        ...prev,
        { role: "user", content: trimmed, created_at: now },
        {
          role: "assistant",
          content: response.reply,
          created_at: now,
          actions: response.actions,
        },
      ]);
      setInput("");
      if (response.actions.length > 0) {
        onBoardChanged();
      }
    } catch {
      setError("Не удалось отправить сообщение.");
    } finally {
      setIsSending(false);
    }
  };

  const handleClear = async () => {
    if (!confirm("Очистить историю чата?")) return;
    setError(null);
    try {
      await api.clearChatHistory();
      setMessages([]);
    } catch {
      setError("Не удалось очистить историю.");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  if (!open) {
    return (
      <aside
        aria-label="Чат с ИИ"
        className="sticky top-0 z-30 flex h-screen w-12 shrink-0 items-start justify-center border-l border-[var(--stroke)] bg-white/95 pt-6 shadow-[var(--shadow)] backdrop-blur"
      >
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Развернуть чат"
          className="rounded-full border border-[var(--stroke)] px-2 py-1 text-lg font-bold text-[var(--primary-blue)]"
        >
          ‹
        </button>
      </aside>
    );
  }

  return (
    <aside
      aria-label="Чат с ИИ"
      className="sticky top-0 z-30 flex h-screen w-[380px] shrink-0 flex-col border-l border-[var(--stroke)] bg-white/95 shadow-[var(--shadow)] backdrop-blur"
    >
      <header
        className="flex items-center justify-between border-b border-[var(--stroke)] px-4 py-3"
        style={{ background: "var(--navy-dark)" }}
      >
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Свернуть чат"
            className="rounded px-2 py-0.5 text-lg font-bold text-white/90"
          >
            ›
          </button>
          <h2 className="font-display text-base font-semibold text-white">
            Чат с ИИ
          </h2>
        </div>
        <button
          type="button"
          onClick={handleClear}
          className="rounded-md border border-white/30 px-2 py-1 text-xs font-semibold text-white/90"
        >
          Очистить
        </button>
      </header>

      <div
        ref={listRef}
        data-testid="chat-messages"
        className="flex-1 space-y-3 overflow-y-auto px-4 py-4"
      >
        {messages.map((m, idx) => (
          <div
            key={`${m.created_at}-${idx}`}
            data-role={m.role}
            className={
              m.role === "user"
                ? "ml-auto max-w-[85%] rounded-2xl px-4 py-2 text-sm text-white"
                : "mr-auto max-w-[85%] rounded-2xl border border-[var(--stroke)] bg-[var(--surface)] px-4 py-2 text-sm text-[var(--navy-dark)]"
            }
            style={
              m.role === "user"
                ? { background: "var(--primary-blue)" }
                : undefined
            }
          >
            <p className="whitespace-pre-wrap">{m.content}</p>
            {m.actions && m.actions.length > 0 && (
              <ul className="mt-2 space-y-1 border-t border-[var(--stroke)] pt-2 text-xs italic text-[var(--gray-text)]">
                {m.actions.map((a, i) => (
                  <li key={i}>{describeAction(a)}</li>
                ))}
              </ul>
            )}
          </div>
        ))}
        {isSending && (
          <div className="mr-auto max-w-[85%] rounded-2xl border border-[var(--stroke)] bg-[var(--surface)] px-4 py-2 text-sm italic text-[var(--gray-text)]">
            ИИ думает…
          </div>
        )}
      </div>

      {error && (
        <div
          role="alert"
          className="mx-4 mb-2 rounded-lg border border-[var(--stroke)] bg-white px-3 py-2 text-xs text-[var(--navy-dark)]"
        >
          {error}
        </div>
      )}

      <div className="border-t border-[var(--stroke)] p-3">
        <textarea
          aria-label="Сообщение ИИ"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Напишите ИИ…"
          rows={2}
          className="w-full resize-none rounded-lg border border-[var(--stroke)] bg-white px-3 py-2 text-sm text-[var(--navy-dark)] focus:border-[var(--primary-blue)] focus:outline-none"
          disabled={isSending}
        />
        <div className="mt-2 flex justify-end">
          <button
            type="button"
            onClick={handleSend}
            disabled={isSending || input.trim().length === 0}
            className="rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
            style={{ background: "var(--secondary-purple)" }}
          >
            Отправить
          </button>
        </div>
      </div>
    </aside>
  );
};
