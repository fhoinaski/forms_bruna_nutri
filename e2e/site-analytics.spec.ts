import { test, expect } from "./fixtures";
import { ADMIN_STORAGE_STATE } from "./helpers/auth";

/**
 * E2E do modulo de analytics do site. A `page` padrao desta suite fica
 * ANONIMA de proposito (sem storageState de admin) para simular um
 * visitante real; a verificacao no /dashboard/analytics usa um browser
 * context separado, autenticado, sem misturar os dois papeis na mesma
 * sessao de cookies.
 */

interface SummaryResponse {
  overview: { pageviews: number; sessions: number };
  trafficSources: Array<{ sourceCategory: string; sessions: number }>;
  campaigns: Array<{ campaign: string; sessions: number; conversions: number }>;
  funnel: Array<{ stage: string; count: number }>;
  health: { botsFiltered24h: number };
}

async function fetchAdminSummary(browser: import("@playwright/test").Browser): Promise<SummaryResponse> {
  const adminContext = await browser.newContext({ storageState: ADMIN_STORAGE_STATE });
  const adminPage = await adminContext.newPage();
  const summaryResponsePromise = adminPage.waitForResponse(
    (res) => res.url().includes("/api/admin/analytics/summary") && res.ok()
  );
  await adminPage.goto("/dashboard/analytics");
  const summaryResponse = await summaryResponsePromise;
  const summary = (await summaryResponse.json()) as SummaryResponse;
  await adminContext.close();
  return summary;
}

test.describe("analytics do site — fluxo real ponta a ponta", () => {
  test("captura UTM/instagram, navegacao e conversao real de pre-consulta; aparece no dashboard admin", async ({ page }) => {
    const campaign = `e2e_campaign_${Date.now()}`;

    await page.goto(`/?utm_source=instagram&utm_medium=social&utm_campaign=${campaign}`);
    // Espera deterministicamente o cookie de sessao de analytics ser
    // aplicado (resposta do beacon do PAGE_VIEW) antes de navegar — sem
    // isso, a sessao que carrega o UTM de landing pode nao ser a mesma
    // que recebe a conversao mais adiante.
    await expect
      .poll(async () => (await page.context().cookies()).some((cookie) => cookie.name === "bruna_nutri_analytics_sid"), {
        timeout: 5000,
      })
      .toBe(true);
    await page.goto("/servicos");
    await page.goto("/formulario");

    const email = `e2e-analytics-${Date.now()}@example.com`;
    const submitResponse = await page.request.post("/api/form-submissions", {
      data: {
        nome: "Visitante E2E Analytics",
        whatsapp: "48999999999",
        email,
        privacyAccepted: true,
      },
    });
    expect(submitResponse.ok(), await submitResponse.text()).toBeTruthy();

    const summary = await fetchAdminSummary(page.context().browser()!);

    expect(summary.trafficSources.some((source) => source.sourceCategory === "social" && source.sessions >= 1)).toBe(true);
    expect(summary.campaigns.some((row) => row.campaign === campaign && row.conversions >= 1)).toBe(true);
    expect(summary.overview.pageviews).toBeGreaterThanOrEqual(1);
    const completedStage = summary.funnel.find((stage) => stage.stage === "Concluíram");
    expect(completedStage?.count ?? 0).toBeGreaterThanOrEqual(1);
  });

  test("evento duplicado com o mesmo client_event_id nao quebra a ingestao (protecao de dedupe real no banco)", async ({ page }) => {
    await page.goto("/");
    const clientEventId = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
    const payload = {
      events: [{ event_type: "CTA_CLICK", client_event_id: clientEventId, path: "/", metadata: { cta_id: "e2e-dedupe-test" } }],
    };

    const first = await page.request.post("/api/public/analytics/events", { data: payload });
    expect(first.status()).toBe(202);

    const second = await page.request.post("/api/public/analytics/events", { data: payload });
    expect(second.status()).toBe(202); // nao deve lancar erro de constraint nem quebrar a ingestao
  });

  test("User-Agent de bot conhecido e capturado no diagnostico, sem quebrar o tracking", async ({ browser }) => {
    const botContext = await browser.newContext({
      userAgent: "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
    });
    const botPage = await botContext.newPage();
    await botPage.goto("/");
    await botPage.waitForTimeout(300);
    await botContext.close();

    const summary = await fetchAdminSummary(botContext.browser()!);
    expect(summary.health.botsFiltered24h).toBeGreaterThanOrEqual(1);
  });
});
