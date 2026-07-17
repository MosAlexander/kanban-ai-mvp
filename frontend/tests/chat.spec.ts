import { expect, test, type Page } from "@playwright/test";

async function login(page: Page) {
  await page.goto("/login/");
  await page.getByLabel("Имя пользователя").fill("пользователь");
  await page.getByLabel("Пароль").fill("пароль");
  await page.getByRole("button", { name: "Войти" }).click();
  await page.waitForURL((url) => url.pathname === "/");
  await expect(page.getByRole("heading", { name: "Kanban Studio" })).toBeVisible();
}

const escapeAttr = (v: string) => v.replace(/"/g, '\\"');
const columnByTitle = (page: Page, title: string) =>
  page.locator(`[data-column-title="${escapeAttr(title)}"]`);

test.beforeEach(async ({ context, page }) => {
  await context.clearCookies();
  await login(page);
});

test("chat sidebar creates a card via mocked AI action and board refreshes", async ({
  page,
}) => {
  const title = `AI Тест ${Date.now()}`;

  await page.route("**/api/chat", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }
    // Simulate the AI action reaching the DB so refetch board sees the new card.
    await page.request.post("/api/board/columns/1/cards", {
      data: { title, details: "Через route mock" },
    });
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        reply: "Создал карточку в Backlog.",
        actions: [
          {
            type: "create_card",
            column_id: "1",
            title,
            details: "Через route mock",
          },
        ],
      }),
    });
  });

  await expect(page.getByRole("heading", { name: "Чат с ИИ" })).toBeVisible();
  await page.getByLabel("Сообщение ИИ").fill(`создай карту '${title}' в Backlog`);
  await page.getByRole("button", { name: "Отправить" }).click();

  await expect(page.getByText("Создал карточку в Backlog.")).toBeVisible();
  await expect(
    page.getByText(`Создал карточку «${title}»`)
  ).toBeVisible();

  const backlog = columnByTitle(page, "Backlog");
  await expect(backlog.getByText(title)).toBeVisible();

  // Cleanup — remove the AI-created card.
  await backlog.getByLabel(`Delete ${title}`).click();
  await expect(backlog.getByText(title)).toHaveCount(0);
});

test("chat sidebar collapses and re-expands", async ({ page }) => {
  await expect(page.getByRole("heading", { name: "Чат с ИИ" })).toBeVisible();
  await page.getByRole("button", { name: "Свернуть чат" }).click();
  await expect(page.getByRole("heading", { name: "Чат с ИИ" })).toBeHidden();
  await page.getByRole("button", { name: "Развернуть чат" }).click();
  await expect(page.getByRole("heading", { name: "Чат с ИИ" })).toBeVisible();
});

test("chat sidebar clears history after confirm", async ({ page }) => {
  const userMsg = `msg-${Date.now()}`;
  const replyText = `reply-${Date.now()}`;
  await page.route("**/api/chat", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ reply: replyText, actions: [] }),
    });
  });

  const messages = page.getByTestId("chat-messages");
  await page.getByLabel("Сообщение ИИ").fill(userMsg);
  await page.getByRole("button", { name: "Отправить" }).click();
  await expect(messages.getByText(replyText)).toBeVisible();

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Очистить" }).click();
  await expect(messages.getByText(replyText)).toHaveCount(0);
  await expect(messages.getByText(userMsg)).toHaveCount(0);
});
