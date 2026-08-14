import { test, expect } from "./fixtures";
import { ADMIN_STORAGE_STATE, suppressDailyBriefingPopup } from "./helpers/auth";
import { createTestSubmission } from "./helpers/test-data";

/**
 * Pre-consulta: formulario publico -> envio -> registro administrativo ->
 * visualizacao -> conversao para cliente. O envio em si vai pela mesma API
 * publica que o formulario real usa (ver comentario em createTestSubmission)
 * — o wizard de UI tem 830 linhas e multiplas etapas, arriscado demais para
 * selecionadores estaveis dentro do escopo desta fase; o que importa aqui
 * (persistencia real, listagem administrativa, conversao) e identico.
 */
test.use({ storageState: ADMIN_STORAGE_STATE });

test.describe("pré-consulta", () => {
  test("submissão pública aparece na visualização administrativa com os dados corretos", async ({ page, request }) => {
    const submission = await createTestSubmission(request);

    await page.goto(`/dashboard/submissions/${submission.id}`);
    await expect(page.getByRole("heading", { level: 1, name: submission.patientName })).toBeVisible();
    await expect(page.getByText(submission.email)).toBeVisible();
  });

  test("converter submissão em cliente cria o paciente e navega para a ficha dele", async ({ page, request }) => {
    const submission = await createTestSubmission(request);

    // NOTA (achado de UX real, ainda nao corrigido na aplicacao — fora do
    // escopo desta fase): o copiloto de IA pode abrir sozinho com o resumo
    // do dia na primeira visita do dashboard na sessao, e o painel fixo
    // cobre botoes de acao da pagina por baixo dele (bloqueio real de
    // clique, nao so cosmetico). Um `{force:true}` no clique chegou a ser
    // usado como contorno, mas se mostrou instavel sob execucao repetida
    // (o clique podia ser "engolido" pelo elemento por cima antes do
    // widget realmente abrir) — suprimir o popup e o contorno confiavel ja
    // padronizado no resto desta suite para este mesmo problema.
    await suppressDailyBriefingPopup(page);
    await page.goto(`/dashboard/submissions/${submission.id}`);
    await page.getByRole("button", { name: /criar cliente/i }).click();

    await expect(page).toHaveURL(/\/dashboard\/clients\/[^/]+$/);
    await expect(page.getByRole("heading", { level: 1, name: submission.patientName })).toBeVisible();

    // Nenhuma informação crítica se perde: o paciente criado é buscável.
    const clientsResponse = await page.request.get(`/api/admin/clients?search=${encodeURIComponent(submission.patientName)}`);
    expect(clientsResponse.ok()).toBe(true);
    const body = await clientsResponse.json();
    expect(body.items.some((item: { name: string }) => item.name === submission.patientName)).toBe(true);
  });
});
