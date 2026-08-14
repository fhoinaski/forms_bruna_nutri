import { expect, test } from "./fixtures";

test("home presents the public offer and navigates to the pre-consultation form", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByTestId("home-hero-title")).toHaveText(
    /nutrição para uma vida mais\s+leve\s+e saudável\./i,
  );
  const preConsultLink = page.locator("section").first().getByRole("link", { name: /preencher pr[eé]-consulta/i });
  await expect(preConsultLink).toBeVisible();

  await preConsultLink.click();
  await expect(page).toHaveURL(/\/formulario$/);
  // O modo (dinâmico ou tradicional) é definido no dashboard — o fluxo público
  // não deve depender de um modo específico. Aceita qualquer um dos dois.
  await expect(
    page
      .getByTestId("pre-consultation-dynamic")
      .or(page.getByRole("button", { name: /enviar pr[eé]-consulta/i })),
  ).toBeVisible();
});

test("login screen keeps the dashboard behind authentication", async ({ page }) => {
  await page.goto("/dashboard");

  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("button", { name: /entrar/i })).toBeVisible();
});
