"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { api } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api.login(username, password);
      router.replace("/");
    } catch {
      setError("Неверные учётные данные");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main
      className="min-h-screen flex items-center justify-center p-6"
      style={{ background: "var(--surface)" }}
    >
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-2xl bg-white p-8 space-y-5"
        style={{ boxShadow: "var(--shadow)" }}
      >
        <div>
          <p
            className="text-xs font-semibold uppercase tracking-[0.3em]"
            style={{ color: "var(--gray-text)" }}
          >
            PM MVP
          </p>
          <h1
            className="mt-2 font-display text-2xl font-semibold"
            style={{ color: "var(--navy-dark)" }}
          >
            Вход
          </h1>
        </div>
        <label
          className="block text-sm"
          style={{ color: "var(--navy-dark)" }}
        >
          Имя пользователя
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            autoFocus
            className="mt-1 w-full rounded-lg border border-[var(--stroke)] px-3 py-2 outline-none focus:border-[var(--primary-blue)]"
          />
        </label>
        <label
          className="block text-sm"
          style={{ color: "var(--navy-dark)" }}
        >
          Пароль
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="mt-1 w-full rounded-lg border border-[var(--stroke)] px-3 py-2 outline-none focus:border-[var(--primary-blue)]"
          />
        </label>
        {error && (
          <p role="alert" className="text-sm" style={{ color: "#c0392b" }}>
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-lg py-2 font-semibold text-white disabled:opacity-60"
          style={{ background: "var(--secondary-purple)" }}
        >
          {submitting ? "Вход…" : "Войти"}
        </button>
      </form>
    </main>
  );
}
