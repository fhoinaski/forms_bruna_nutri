import { mkdirSync } from "node:fs";
import { test, expect } from "./fixtures";
import { ADMIN_STORAGE_STATE } from "./helpers/auth";
import { createTestPatient } from "./helpers/test-data";

test.use({ storageState: ADMIN_STORAGE_STATE });

const SCREENSHOT_DIR = "reports/screenshots/patient-record";

test.describe("AI chat widget clinical navigation", () => {
  test("clinical record never auto-opens the briefing and its primary navigation remains clickable", async ({ page, request }, testInfo) => {
    const patient = await createTestPatient(request, { name: "AI widget navigation" });
    mkdirSync(SCREENSHOT_DIR, { recursive: true });

    await page.goto(`/dashboard/clients/${patient.id}`);

    await expect(page.getByRole("dialog", { name: "Assistente do sistema" })).toHaveCount(0);
    await page.getByRole("tab", { name: "Plano alimentar" }).click();
    await expect(page.getByRole("button", { name: /criar por modelo/i })).toBeVisible();
    await page.screenshot({ path: `${SCREENSHOT_DIR}/P6.3-01-clinical-navigation-${testInfo.project.name}-r${testInfo.retry}.png`, fullPage: true });
  });

  test("assistant can be opened manually, dismissed with Escape, and does not block navigation after an AI failure", async ({ page, request }, testInfo) => {
    const patient = await createTestPatient(request, { name: "AI widget manual access" });
    mkdirSync(SCREENSHOT_DIR, { recursive: true });
    await page.goto(`/dashboard/clients/${patient.id}`);

    // No viewport mobile o atalho pertence ao drawer lateral; abra-o antes
    // de interagir para reproduzir o caminho que uma profissional usa.
    if (testInfo.project.name === "mobile-chrome") {
      await page.getByRole("button", { name: "Abrir menu" }).click();
    }
    await page.getByRole("button", { name: "Abrir Assistente de IA", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Assistente do sistema" });
    await expect(dialog).toBeVisible();
    await page.screenshot({ path: `${SCREENSHOT_DIR}/P6.3-02-ai-manual-open-${testInfo.project.name}-r${testInfo.retry}.png`, fullPage: true });

    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    if (testInfo.project.name === "mobile-chrome") {
      await page.getByRole("button", { name: "Fechar menu" }).last().click();
    }
    await page.getByRole("tab", { name: "Antropometria" }).click();
    await expect(page.getByRole("heading", { name: /Antropometria e progresso/i })).toBeVisible();

    if (testInfo.project.name === "mobile-chrome") {
      await page.getByRole("button", { name: "Abrir menu" }).click();
    }
    await page.getByRole("button", { name: "Abrir Assistente de IA", exact: true }).click();
    await page.route("**/api/admin/ai/chat", async (route) => {
      await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ message: "IA indisponível" }) });
    });
    await page.getByLabel("Mensagem para o assistente").fill("Teste de indisponibilidade");
    await page.getByRole("button", { name: "Enviar" }).click();
    await expect(dialog.getByText(/IA indisponível/i)).toBeVisible();
    await dialog.getByRole("button", { name: "Fechar", exact: true }).click();
    if (testInfo.project.name === "mobile-chrome") {
      await page.getByRole("button", { name: "Fechar menu" }).last().click();
    }
    await page.getByRole("tab", { name: "Plano alimentar" }).click();
    await expect(page.getByRole("button", { name: /criar por modelo/i })).toBeVisible();
    await page.screenshot({ path: `${SCREENSHOT_DIR}/P6.3-03-ai-failure-navigation-${testInfo.project.name}-r${testInfo.retry}.png`, fullPage: true });
  });
});
