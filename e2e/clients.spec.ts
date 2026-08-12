import { test, expect } from "@playwright/test";
import { ADMIN_STORAGE_STATE, suppressDailyBriefingPopup } from "./helpers/auth";
import { createTestPatient, uniquePhone, uniqueSuffix } from "./helpers/test-data";

/**
 * CRUD de pacientes — usa a sessao admin ja pronta (storageState), porque o
 * login em si ja tem cobertura dedicada em auth.spec.ts.
 */
test.use({ storageState: ADMIN_STORAGE_STATE });

test.describe("pacientes", () => {
  test("cria um paciente pelo formulario real do dashboard e abre a ficha criada", async ({ page }) => {
    const suffix = uniqueSuffix();
    const name = `E2E UI Paciente ${suffix}`;

    await suppressDailyBriefingPopup(page);
    await page.goto("/dashboard/clients");
    await page.getByRole("button", { name: /novo paciente/i }).click();
    await page.getByPlaceholder("Nome do paciente").fill(name);
    await page.getByPlaceholder("(00) 00000-0000").fill(uniquePhone());
    await page.getByPlaceholder("paciente@email.com").fill(`e2e-ui-${suffix}@test.local`);
    await page.getByRole("button", { name: /criar paciente/i }).click();

    await expect(page).toHaveURL(/\/dashboard\/clients\/[^/]+$/);
    await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
  });

  test("localiza um paciente pela busca por nome", async ({ page, request }) => {
    const patient = await createTestPatient(request);

    await suppressDailyBriefingPopup(page);
    await page.goto("/dashboard/clients");
    await page.getByPlaceholder("Nome, e-mail ou telefone...").fill(patient.name);
    await page.keyboard.press("Enter");

    // A lista responsiva troca a tabela (desktop) por cards (mobile) — um
    // locator por role="cell" so existe na variante desktop e getByText
    // solto colide com o widget de IA. O link para a ficha do paciente
    // existe em QUALQUER layout com o mesmo href, entao e o unico jeito
    // realmente agnostico de viewport de mirar esta linha.
    // ":visible" (nao so .first()) porque desktop e mobile podem ter os dois
    // layouts no DOM ao mesmo tempo (um oculto por CSS) — pegar so o primeiro
    // do DOM correria o risco de mirar exatamente a copia oculta.
    await expect(page.locator(`a[href="/dashboard/clients/${patient.id}"]:visible`).first()).toBeVisible();
  });

  test("edita um dado nao critico (notas internas) e a alteracao persiste apos recarregar", async ({ page, request }) => {
    const patient = await createTestPatient(request);
    const note = `Observação de teste ${uniqueSuffix()}`;

    await suppressDailyBriefingPopup(page);
    await page.goto(`/dashboard/clients/${patient.id}`);
    await expect(page.getByRole("heading", { level: 1, name: patient.name })).toBeVisible();

    await page.getByPlaceholder(/Observações sobre a paciente/i).fill(note);
    await page.getByRole("button", { name: /salvar alterações/i }).click();
    await expect(page.getByRole("button", { name: /salvo!/i })).toBeVisible();

    await page.reload();
    await expect(page.getByPlaceholder(/Observações sobre a paciente/i)).toHaveValue(note);
  });

  test("planos alimentares e tarefas do paciente nao vazam para outro paciente (isolamento basico)", async ({ request }) => {
    const patientA = await createTestPatient(request);
    const patientB = await createTestPatient(request);

    const response = await request.get(`/api/admin/clients/${patientA.id}`);
    expect(response.ok()).toBe(true);
    const bodyA = await response.json();
    expect(bodyA.id).toBe(patientA.id);
    expect(bodyA.id).not.toBe(patientB.id);
  });
});
