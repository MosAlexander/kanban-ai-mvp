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

const firstColumn = (page: Page) => page.locator('[data-testid^="column-"]').first();

test.beforeEach(async ({ context, page }) => {
  await context.clearCookies();
  await login(page);
});

test("loads the kanban board", async ({ page }) => {
  await expect(page.getByRole("heading", { name: "Kanban Studio" })).toBeVisible();
  await expect(page.locator('[data-testid^="column-"]')).toHaveCount(5);
});

test("adds a card and persists it across reload", async ({ page }) => {
  const backlog = columnByTitle(page, "Backlog");
  const title = `Persist ${Date.now()}`;

  await backlog.getByRole("button", { name: /add a card/i }).click();
  await backlog.getByPlaceholder("Card title").fill(title);
  await backlog.getByPlaceholder("Details").fill("Added via e2e.");
  await backlog.getByRole("button", { name: /add card/i }).click();
  await expect(backlog.getByText(title)).toBeVisible();

  await page.reload();
  const backlogAfter = columnByTitle(page, "Backlog");
  await expect(backlogAfter.getByText(title)).toBeVisible();

  await backlogAfter.getByLabel(`Delete ${title}`).click();
  await expect(backlogAfter.getByText(title)).toHaveCount(0);
});

test("renames a column and restores it after reload", async ({ page }) => {
  const original = "In Progress";
  const renamed = `Renamed ${Date.now()}`;
  const column = columnByTitle(page, original);
  const input = column.getByLabel("Column title");

  await input.fill(renamed);
  await input.blur();
  await expect(columnByTitle(page, renamed)).toBeVisible();

  await page.reload();
  const renamedAfter = columnByTitle(page, renamed);
  await expect(renamedAfter).toBeVisible();

  const restoreInput = renamedAfter.getByLabel("Column title");
  await restoreInput.fill(original);
  await restoreInput.blur();
  await page.reload();
  await expect(columnByTitle(page, original)).toBeVisible();
});

test("moves a card between columns and persists it across reload", async ({ page }) => {
  const card = firstColumn(page).locator('[data-testid^="card-"]').first();
  const cardId = await card.getAttribute("data-testid");
  const cardTitle = await card.locator("h4").textContent();
  if (!cardId || !cardTitle) throw new Error("Card metadata missing");

  const cardBox = await card.boundingBox();
  const targetColumn = columnByTitle(page, "Review");
  const columnBox = await targetColumn.boundingBox();
  if (!cardBox || !columnBox) throw new Error("Unable to resolve drag coordinates.");

  await page.mouse.move(
    cardBox.x + cardBox.width / 2,
    cardBox.y + cardBox.height / 2
  );
  await page.mouse.down();
  await page.mouse.move(
    columnBox.x + columnBox.width / 2,
    columnBox.y + 120,
    { steps: 12 }
  );
  await page.mouse.up();

  await expect(columnByTitle(page, "Review").locator(`[data-testid="${cardId}"]`)).toBeVisible();

  await page.reload();
  await expect(
    columnByTitle(page, "Review").locator(`[data-testid="${cardId}"]`)
  ).toBeVisible();

  // Cleanup: move back to Backlog by dragging in the reloaded page
  const movedCard = columnByTitle(page, "Review").locator(`[data-testid="${cardId}"]`);
  const backlogColumn = columnByTitle(page, "Backlog");
  const movedBox = await movedCard.boundingBox();
  const backlogBox = await backlogColumn.boundingBox();
  if (!movedBox || !backlogBox) throw new Error("Unable to resolve cleanup coordinates.");
  await page.mouse.move(movedBox.x + movedBox.width / 2, movedBox.y + movedBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    backlogBox.x + backlogBox.width / 2,
    backlogBox.y + 120,
    { steps: 12 }
  );
  await page.mouse.up();
  await expect(backlogColumn.locator(`[data-testid="${cardId}"]`)).toBeVisible();
});
