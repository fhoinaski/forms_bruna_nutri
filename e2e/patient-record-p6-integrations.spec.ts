import { mkdirSync } from "node:fs";
import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures";
import { ADMIN_STORAGE_STATE, suppressDailyBriefingPopup } from "./helpers/auth";
import { createTestPatient, startConsultationSession } from "./helpers/test-data";

test.use({ storageState: ADMIN_STORAGE_STATE });

const SCREENSHOT_DIR = "reports/screenshots/patient-record";

async function screenshot(page: Page, name: string) {
  mkdirSync(SCREENSHOT_DIR, { recursive: true });
  await page.screenshot({ path: `${SCREENSHOT_DIR}/${name}.png`, fullPage: true });
}

test.describe("Patient Record P6 final integrations", () => {
  test("overview keeps clinical quick actions compact and schedules a return with patient context", async ({ page, request }, testInfo) => {
    const patient = await createTestPatient(request, { name: "Patient Record P6 Overview" });
    await suppressDailyBriefingPopup(page);
    await page.goto(`/dashboard/clients/${patient.id}`);

    await expect(page.getByTestId("patient-record-overview")).toBeVisible();
    // A ação primária do cabeçalho permanece estável para orientação clínica;
    // as ações complementares continuam disponíveis sem duplicar módulos.
    const header = page.locator("header");
    await expect(header.getByRole("button", { name: "Nova consulta" })).toBeVisible();
    await expect(header.getByRole("button", { name: "Nova avaliação" })).toBeVisible();
    await expect(header.getByRole("button", { name: "Criar plano" })).toBeVisible();
    await page.getByText("Mais ações", { exact: true }).click();
    await expect(page.getByText("Agendar retorno", { exact: true }).last()).toBeVisible();
    await page.getByText("Agendar retorno", { exact: true }).last().click();
    await expect(page).toHaveURL(new RegExp(`/dashboard/agenda\\?patientId=${patient.id}&type=retorno`));
    await expect(page.getByLabel("Paciente", { exact: true })).toHaveValue(patient.id);
    await expect(page.getByLabel("Tipo", { exact: true })).toHaveValue("retorno");
    await screenshot(page, `P6.1-04-agenda-return-${testInfo.project.name}-r${testInfo.retry}`);
  });

  test("consultation opens a meal plan with a patient-scoped return path", async ({ page, request }, testInfo) => {
    const patient = await createTestPatient(request, { name: "Patient Record P6 Context" });
    const session = await startConsultationSession(request, patient.id);
    await suppressDailyBriefingPopup(page);
    await page.goto(`/dashboard/clients/${patient.id}/consulta?sessionId=${session.id}`);

    await page.getByRole("button", { name: "Abrir plano alimentar" }).click();
    await expect(page).toHaveURL(new RegExp(`tab=plano-alimentar.*consultationId=${session.id}`));
    await expect(page.getByRole("link", { name: "Voltar à consulta" })).toBeVisible();
    await page.getByRole("link", { name: "Voltar à consulta" }).click();
    await expect(page).toHaveURL(new RegExp(`/dashboard/clients/${patient.id}/consulta\\?sessionId=${session.id}`));
    await screenshot(page, `P6.1-03-return-to-same-consultation-${testInfo.project.name}-r${testInfo.retry}`);
  });

  test("protocol and supplementation summaries use real empty states", async ({ page, request }, testInfo) => {
    const patient = await createTestPatient(request, { name: "Patient Record P6 Empty Integrations" });
    await suppressDailyBriefingPopup(page);
    await page.setViewportSize({ width: 390, height: 900 });
    await page.goto(`/dashboard/clients/${patient.id}`);

    await expect(page.getByText("Nenhum protocolo ativo vinculado.")).toBeVisible();
    await expect(page.getByText("Nenhuma suplementação ativa registrada.")).toBeVisible();
    // O card "Plano alimentar" do resumo mostra "Nenhum plano" quando não há
    // rascunho nem plano ativo (SummaryCard, seção "Resumo do prontuário") —
    // "Nenhum plano ativo" nunca foi o texto real desse estado, ficou stale
    // de uma versão anterior do card.
    await expect(page.getByText("Nenhum plano", { exact: true })).toBeVisible();
    await screenshot(page, `P6.1-01-consultation-context-${testInfo.project.name}-r${testInfo.retry}`);
  });
});
