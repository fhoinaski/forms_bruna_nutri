import { expect, test } from "@playwright/test";

test("home presents the public offer and navigates to the pre-consultation form", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: /nutri[cç][aã]o para fam/i })).toBeVisible();
  const preConsultLink = page.locator("section").first().getByRole("link", { name: /preencher pr[eé]-consulta/i });
  await expect(preConsultLink).toBeVisible();

  await preConsultLink.click();
  await expect(page).toHaveURL(/\/formulario$/);
  await expect(page.getByRole("button", { name: /enviar pr[eé]-consulta/i })).toBeVisible();
});

test("login screen keeps the dashboard behind authentication", async ({ page }) => {
  await page.goto("/dashboard");

  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("button", { name: /entrar/i })).toBeVisible();
});
