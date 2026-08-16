import { test, expect } from "./fixtures";
import { ADMIN_STORAGE_STATE, suppressDailyBriefingPopup } from "./helpers/auth";
import { createTestAppointment, createTestPatient } from "./helpers/test-data";

test.use({ storageState: ADMIN_STORAGE_STATE });

const generatedAt = "2026-08-16T12:00:00.000Z";

async function mockDashboardActions(page: import("@playwright/test").Page, items: unknown[]) {
  await page.route("**/api/admin/dashboard/actions", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ generatedAt, items }),
    });
  });
}

test.describe("dashboard orientado à atenção", () => {
  test("briefing proativo preparado aparece no card e abre modal", async ({ page, request }) => {
    const patient = await createTestPatient(request, { name: "Ana Briefing E2E" });
    const appointment = await createTestAppointment(request, patient.id, {
      title: "Consulta briefing E2E",
      startsAt: new Date(Date.now() + 20 * 60 * 1000).toISOString(),
    });
    const prepare = await request.post(`/api/admin/appointments/${appointment.id}/brief`, { data: { force: true } });
    expect(prepare.ok(), await prepare.text()).toBe(true);

    await suppressDailyBriefingPopup(page);
    await page.goto("/dashboard");

    const action = page.getByRole("button", { name: /Consulta em .*Ana Briefing E2E.*Abrir briefing/i }).first();
    await expect(action).toBeVisible();
    await expect(action).toContainText("Briefing preparado");
    await action.click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByRole("heading", { name: /Briefing preparado|Briefing desatualizado/i })).toBeVisible();
  });

  test("estado vazio mostra as seções sem pendências", async ({ page }) => {
    await suppressDailyBriefingPopup(page);
    await mockDashboardActions(page, []);

    await page.goto("/dashboard");

    await expect(page.getByRole("heading", { name: "O que precisa de atencao agora" })).toBeVisible();
    await expect(page.getByText("Nada imediato agora.")).toBeVisible();
    await expect(page.getByText("Nenhuma pendência importante agora.")).toBeVisible();
    await expect(page.getByText("Nenhuma cobrança vencida detectada.")).toBeVisible();
  });

  test("consulta próxima aparece em Agora e navega ao contexto", async ({ page }) => {
    await suppressDailyBriefingPopup(page);
    await mockDashboardActions(page, [
      {
        id: "appointment-soon:appt-1",
        type: "APPOINTMENT_SOON",
        priority: "HIGH",
        section: "NOW",
        title: "Consulta em 18 min",
        subject: "Ana Lima",
        description: "Retorno (online).",
        source: "appointments",
        sourceId: "appt-1",
        href: "/dashboard/clients/client-1",
        actionLabel: "Abrir paciente",
        dueAt: "2026-08-16T12:18:00.000Z",
        occurredAt: null,
        createdAt: null,
      },
    ]);

    await page.goto("/dashboard");

    const action = page.getByRole("link", { name: /Consulta em 18 min, Ana Lima\. Abrir paciente/i });
    await expect(action).toBeVisible();
    await expect(action).toHaveAttribute("href", "/dashboard/clients/client-1");
  });

  test("solicitação pendente abre inbox com query do pedido", async ({ page }) => {
    await suppressDailyBriefingPopup(page);
    await mockDashboardActions(page, [
      {
        id: "patient-request:req-1",
        type: "PATIENT_REQUEST_PENDING",
        priority: "URGENT",
        section: "ATTENTION",
        title: "Solicitação: sintoma ou queixa",
        subject: "Bia Costa",
        description: "Paciente relatou sintoma novo.",
        source: "patient_requests",
        sourceId: "req-1",
        href: "/dashboard/solicitacoes?request=req-1",
        actionLabel: "Ver solicitação",
        dueAt: "2026-08-16T11:00:00.000Z",
        occurredAt: null,
        createdAt: "2026-08-16T11:00:00.000Z",
      },
    ]);

    await page.goto("/dashboard");

    await expect(page.getByText("Precisa da sua atenção")).toBeVisible();
    const action = page.getByRole("link", { name: /Solicitação: sintoma ou queixa, Bia Costa\. Ver solicitação/i });
    await expect(action).toBeVisible();
    await action.click();
    await expect(page).toHaveURL(/\/dashboard\/solicitacoes\?request=req-1$/);
  });

  test("mistura proposta IA, pagamento vencido e substituição segura nas seções corretas", async ({ page }) => {
    await suppressDailyBriefingPopup(page);
    await mockDashboardActions(page, [
      {
        id: "ai-proposal:proposal-1",
        type: "AI_PROPOSAL_REVIEW",
        priority: "HIGH",
        section: "ATTENTION",
        title: "Ação da IA precisa verificação",
        subject: "Ana Lima",
        description: "protocolo - risco clinical.",
        source: "ai_action_proposals",
        sourceId: "proposal-1",
        href: "/dashboard/clients/client-1",
        actionLabel: "Verificar",
        dueAt: "2026-08-16T10:00:00.000Z",
        occurredAt: null,
        createdAt: "2026-08-16T10:00:00.000Z",
      },
      {
        id: "payment-overdue:pay-1",
        type: "PAYMENT_OVERDUE",
        priority: "HIGH",
        section: "BUSINESS",
        title: "Pagamento vencido",
        subject: "Bia Costa",
        description: "Consulta agosto - R$ 450,00.",
        source: "payments",
        sourceId: "pay-1",
        href: "/dashboard/financeiro",
        actionLabel: "Ver financeiro",
        dueAt: "2026-08-15",
        occurredAt: null,
        createdAt: "2026-08-01T10:00:00.000Z",
      },
      {
        id: "substitution:sub-1",
        type: "SAFE_SUBSTITUTION_OCCURRED",
        priority: "INFO",
        section: "RECENT",
        title: "Substituição segura respondida",
        subject: "Carla Souza",
        description: "Destino: banana.",
        source: "patient_food_substitution_events",
        sourceId: "sub-1",
        href: "/dashboard/clients/client-3",
        actionLabel: "Ver paciente",
        dueAt: null,
        occurredAt: "2026-08-16T11:55:00.000Z",
        createdAt: "2026-08-16T11:55:00.000Z",
      },
    ]);

    await page.goto("/dashboard");

    await expect(page.getByText("Ação da IA precisa verificação")).toBeVisible();
    await expect(page.getByText("Pagamento vencido")).toBeVisible();
    await expect(page.getByText("Substituição segura respondida")).toBeVisible();
  });

  test("layout mobile não cria overflow horizontal no feed de atenção", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await suppressDailyBriefingPopup(page);
    await mockDashboardActions(page, [
      {
        id: "workflow-due:workflow-1",
        type: "WORKFLOW_DUE",
        priority: "NORMAL",
        section: "ATTENTION",
        title: "Mensagem de atendimento pendente",
        subject: "Paciente com nome composto bem longo",
        description: "pre appointment reminder - Consulta de acompanhamento nutricional.",
        source: "appointment_workflow_items",
        sourceId: "workflow-1",
        href: "/dashboard/agenda",
        actionLabel: "Abrir agenda",
        dueAt: "2026-08-16T11:50:00.000Z",
        occurredAt: null,
        createdAt: null,
      },
    ]);

    await page.goto("/dashboard");

    await expect(page.getByText("Mensagem de atendimento pendente")).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(overflow).toBe(false);
  });

  test("briefing stale mostra atualização manual", async ({ page }) => {
    await suppressDailyBriefingPopup(page);
    await mockDashboardActions(page, [
      {
        id: "appointment-soon:appt-stale",
        type: "APPOINTMENT_SOON",
        priority: "HIGH",
        section: "NOW",
        title: "Consulta em 18 min",
        subject: "Ana Lima",
        description: "Retorno (online). Briefing desatualizado.",
        source: "appointments",
        sourceId: "appt-stale",
        href: "/dashboard/clients/client-1",
        actionLabel: "Atualizar briefing",
        dueAt: "2026-08-16T12:18:00.000Z",
        occurredAt: null,
        createdAt: null,
        briefing: { appointmentId: "appt-stale", status: "stale", generatedAt: generatedAt, errorCode: null },
      },
    ]);
    await page.route("**/api/admin/appointments/appt-stale/brief", async (route) => {
      if (route.request().method() === "POST") {
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ state: { appointmentId: "appt-stale", status: "ready", generatedAt, errorCode: null, brief: null } }) });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          appointmentId: "appt-stale",
          status: "stale",
          generatedAt,
          errorCode: null,
          brief: {
            summary: { source: "AI_SUMMARY", text: "Resumo desatualizado." },
            facts: [],
            changesSinceLastVisit: [],
            attentionPoints: [],
            suggestedQuestions: [],
            currentPlanSummary: null,
            pendingItems: [],
            dataGaps: [],
          },
        }),
      });
    });

    await page.goto("/dashboard");
    await page.getByRole("button", { name: /Consulta em 18 min, Ana Lima\. Atualizar briefing/i }).click();
    await expect(page.getByRole("heading", { name: "Briefing desatualizado" })).toBeVisible();
    await page.getByRole("button", { name: "Atualizar briefing", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Briefing preparado" })).toBeVisible();
  });

  test("falha de IA não bloqueia consulta e mantém link do paciente", async ({ page }) => {
    await suppressDailyBriefingPopup(page);
    await mockDashboardActions(page, [
      {
        id: "appointment-soon:appt-failed",
        type: "APPOINTMENT_SOON",
        priority: "HIGH",
        section: "NOW",
        title: "Consulta em 18 min",
        subject: "Ana Lima",
        description: "Retorno (online). Não foi possível preparar briefing.",
        source: "appointments",
        sourceId: "appt-failed",
        href: "/dashboard/clients/client-1",
        actionLabel: "Abrir paciente",
        dueAt: "2026-08-16T12:18:00.000Z",
        occurredAt: null,
        createdAt: null,
        briefing: { appointmentId: "appt-failed", status: "failed", generatedAt: null, errorCode: "AiProviderError" },
      },
    ]);

    await page.goto("/dashboard");
    const action = page.getByRole("link", { name: /Consulta em 18 min, Ana Lima\. Abrir paciente/i });
    await expect(action).toBeVisible();
    await expect(action).toContainText("Não foi possível preparar briefing");
    await expect(action).toHaveAttribute("href", "/dashboard/clients/client-1");
  });
});
