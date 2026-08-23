import type { Locator, Page } from "@playwright/test";
import { expect } from "../fixtures";

export function fieldAfterLabel(page: Page, label: string, tag: "input" | "textarea" = "input") {
  return page.locator(`xpath=//label[normalize-space()="${label}"]/following-sibling::${tag}[1]`);
}

export async function addMeal(page: Page, name?: string) {
  await page.getByRole("button", { name: /^refeicao$/i }).click();
  const meal = page.locator("article").last();
  if (name) await meal.getByPlaceholder("Nome da refeicao").fill(name);
  return meal;
}

export async function selectFood(page: Page, meal: Locator, query: string, match: RegExp | string) {
  const input = meal.locator('input[aria-label="Alimento"]').last();
  await expect(input).toBeVisible();
  await expect(async () => {
    await input.fill("");
    await input.fill(query);
    const option = typeof match === "string"
      ? page.getByRole("option", { name: new RegExp(match.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i") }).first()
      : page.getByRole("option", { name: match }).first();
    await expect(option).toBeVisible({ timeout: 5_000 });
    await option.click({ timeout: 5_000 });
  }).toPass({ timeout: 20_000 });
}

export async function setLastQuantity(meal: Locator, quantity: string) {
  await meal.locator('input[aria-label="Quantidade"]:visible').last().fill(quantity);
}

export async function selectLastGrams(meal: Locator) {
  const measure = meal.locator('select[aria-label="Medida"]:visible').last();
  if (await measure.isVisible().catch(() => false)) {
    await measure.selectOption("__grams__");
  }
}

export async function saveDraft(page: Page) {
  await page.getByRole("button", { name: /^salvar rascunho$/i }).click();
  await expect(page.getByText(/^plano alimentar salvo\.$/i)).toBeVisible();
}

export async function publishPlan(page: Page) {
  const reviewAndPublish = page.getByRole("button", { name: /^revisar e publicar$/i });
  if (await reviewAndPublish.isVisible().catch(() => false)) {
    await reviewAndPublish.click();
  } else {
    await page.getByRole("button", { name: /^revisar$/i }).click();
  }
  const dialog = page.getByRole("dialog", { name: /revisão do plano/i });
  await expect(dialog).toBeVisible();
  const warningCheckbox = dialog.getByLabel(/revisei os avisos/i);
  if (await warningCheckbox.isVisible().catch(() => false)) {
    await warningCheckbox.check();
  }
  await dialog.getByRole("button", { name: /^publicar plano$/i }).click();
  await expect(page.getByText(/^plano ativado no portal do cliente\.$/i)).toBeVisible();
}

export async function openMealPlanTab(page: Page, patientId: string) {
  await page.goto(`/dashboard/clients/${patientId}`);
  await page.getByRole("tab", { name: "Plano alimentar" }).click();
}
