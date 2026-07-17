import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import LoginPage from "./page";

const replace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: vi.fn() }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  global.fetch = vi.fn() as unknown as typeof fetch;
});

describe("LoginPage", () => {
  it("redirects to / on successful login", async () => {
    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ authenticated: true }),
    });
    render(<LoginPage />);
    await userEvent.type(screen.getByLabelText(/Имя пользователя/), "пользователь");
    await userEvent.type(screen.getByLabelText(/Пароль/), "пароль");
    await userEvent.click(screen.getByRole("button", { name: /Войти/ }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/"));
  });

  it("shows error on invalid credentials", async () => {
    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ detail: "Invalid" }),
    });
    render(<LoginPage />);
    await userEvent.type(screen.getByLabelText(/Имя пользователя/), "wrong");
    await userEvent.type(screen.getByLabelText(/Пароль/), "wrong");
    await userEvent.click(screen.getByRole("button", { name: /Войти/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/неверные/i);
    expect(replace).not.toHaveBeenCalled();
  });
});
