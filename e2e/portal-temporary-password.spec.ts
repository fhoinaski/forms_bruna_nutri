import { test, expect } from "./fixtures";
import { ADMIN_STORAGE_STATE, suppressDailyBriefingPopup } from "./helpers/auth";
import { createTestPatient } from "./helpers/test-data";

test.use({ storageState: ADMIN_STORAGE_STATE });

test.describe("senha temporária do portal", () => {
  test("é descoberta no estado sem acesso, copiada e removida da tela ao fechar", async ({ page, request, context }) => {
    const patient = await createTestPatient(request);
    await suppressDailyBriefingPopup(page);
    await page.goto(`/dashboard/clients/${patient.id}`);
    await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: new URL(page.url()).origin });
    await page.getByRole("tab", { name: "Portal" }).click();

    await expect(page.getByRole("button", { name: "Enviar convite por e-mail" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Gerar senha temporária" })).toBeVisible();
    await page.getByRole("button", { name: "Gerar senha temporária" }).click();

    const dialog = page.getByRole("dialog", { name: /senha temporária criada/i });
    await expect(dialog).toBeVisible();
    const password = await dialog.getByLabel("Senha temporária").textContent();
    expect(password).toBeTruthy();
    await dialog.getByRole("button", { name: "Copiar senha" }).click();
    await expect(dialog.locator("p[role='status']")).toContainText("Senha copiada");
    await dialog.getByRole("button", { name: "Fechar" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByText(password!)).toHaveCount(0);

    await page.reload();
    await page.getByRole("tab", { name: "Portal" }).click();
    await expect(page.getByText(password!)).toHaveCount(0);
  });
});
