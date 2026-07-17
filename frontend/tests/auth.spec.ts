import { expect, test } from "@playwright/test";

test.beforeEach(async ({ context }) => {
  await context.clearCookies();
});

test("redirects unauthenticated user from / to /login/", async ({ page }) => {
  await page.goto("/");
  await page.waitForURL((url) => url.pathname === "/login/");
  await expect(page.getByRole("heading", { name: "Вход" })).toBeVisible();
});

test("logs in with correct credentials and lands on kanban", async ({ page }) => {
  await page.goto("/login/");
  await page.getByLabel("Имя пользователя").fill("пользователь");
  await page.getByLabel("Пароль").fill("пароль");
  await page.getByRole("button", { name: "Войти" }).click();
  await page.waitForURL((url) => url.pathname === "/");
  await expect(page.getByRole("heading", { name: "Kanban Studio" })).toBeVisible();
});

test("shows error on invalid credentials", async ({ page }) => {
  await page.goto("/login/");
  await page.getByLabel("Имя пользователя").fill("wrong");
  await page.getByLabel("Пароль").fill("wrong");
  await page.getByRole("button", { name: "Войти" }).click();
  await expect(page.getByText("Неверные учётные данные")).toBeVisible();
  await expect(page).toHaveURL(/\/login\/?$/);
});

test("logout returns user to /login/", async ({ page }) => {
  await page.goto("/login/");
  await page.getByLabel("Имя пользователя").fill("пользователь");
  await page.getByLabel("Пароль").fill("пароль");
  await page.getByRole("button", { name: "Войти" }).click();
  await page.waitForURL((url) => url.pathname === "/");
  await page.getByRole("button", { name: "Выйти" }).click();
  await page.waitForURL((url) => url.pathname === "/login/");
});
