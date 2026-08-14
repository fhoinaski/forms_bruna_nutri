import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Page } from "@playwright/test";

const fixturesPath = join(__dirname, "..", ".tmp", "admin-fixtures.json");

export interface AdminFixture {
  id: string;
  name: string;
  email: string;
  password: string;
  mustChangePassword: number;
}

/**
 * Le os admins semeados por e2e/helpers/webserver-entrypoint.mjs antes do
 * servidor subir. `admin` e compartilhado (nenhum teste muta essa conta
 * permanentemente). `adminMustChange`/`adminMfaCandidate` SAO mutados de
 * verdade pelos proprios testes (troca de senha, ativacao de MFA) — por
 * isso existe uma copia isolada por projeto do Playwright, e `projectName`
 * (ex.: testInfo.project.name) escolhe a copia certa; sem `projectName`,
 * cai na primeira copia semeada (uso fora de auth.spec.ts, que so le `admin`).
 */
export function adminFixtures(projectName?: string): { admin: AdminFixture; adminMustChange: AdminFixture; adminMfaCandidate: AdminFixture } {
  const fixtures = JSON.parse(readFileSync(fixturesPath, "utf8")) as {
    admin: AdminFixture;
    byProject: Record<string, { adminMustChange: AdminFixture; adminMfaCandidate: AdminFixture }>;
  };
  const projectFixtures = (projectName && fixtures.byProject[projectName]) || Object.values(fixtures.byProject)[0];
  return { admin: fixtures.admin, ...projectFixtures };
}

export const ADMIN_STORAGE_STATE = join(__dirname, "..", ".tmp", "admin-storage-state.json");

/** Dirige o formulario real de login (usado pelos proprios testes de autenticacao). */
export async function fillLoginForm(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByPlaceholder("seu@email.com").fill(email);
  await page.getByPlaceholder("Sua senha").fill(password);
}

export async function submitLogin(page: Page) {
  await page.getByRole("button", { name: /^entrar$/i }).click();
}

export async function loginAsAdminUI(page: Page, email: string, password: string) {
  await fillLoginForm(page, email, password);
  await submitLogin(page);
}

export async function fillMfaCode(page: Page, code: string) {
  await page.getByPlaceholder(/6 dígitos ou código de recuperação/i).fill(code);
  await page.getByRole("button", { name: /confirmar acesso/i }).click();
}

/**
 * Cria (ou devolve ao estado semeado) uma conta de admin mutável antes de o
 * teste rodar. Usa a sessão do admin padrão (compartilhado e nunca mutado)
 * para chamar o endpoint de teste /api/admin/e2e/reset-admin (UPSERT), em vez
 * de depender da sessão do próprio teste — assim o reset funciona mesmo que a
 * execução anterior tenha morrido no meio (ex.: sem sessão válida). O logout
 * final limpa a sessão helper para o teste começar do zero.
 */
export async function resetAdminForTest(
  page: Page,
  target: { email: string; password: string; mustChangePassword: boolean }
): Promise<void> {
  const { admin } = adminFixtures();
  const login = await page.request.post("/api/auth/login", {
    data: { email: admin.email, password: admin.password },
  });
  if (!login.ok()) throw new Error(`resetAdminForTest: login do admin falhou (${login.status()})`);
  const reset = await page.request.post("/api/admin/e2e/reset-admin", {
    data: {
      email: target.email,
      password: target.password,
      mustChangePassword: target.mustChangePassword,
    },
  });
  if (!reset.ok()) throw new Error(`resetAdminForTest: reset falhou (${reset.status()}): ${await reset.text()}`);
  await page.request.post("/api/auth/logout").catch(() => null);
}

/**
 * O copiloto de IA (AiChatWidget) abre sozinho com o resumo do dia na
 * primeira visita do dashboard por sessao de browser (chave de
 * localStorage por dia, fuso America/Sao_Paulo) — o painel fixo cobre
 * botoes de acao da pagina por baixo dele. Pre-semeia a mesma chave que o
 * proprio widget usaria depois de "ja mostrado hoje", simulando uma
 * nutricionista que já viu o resumo — nao estamos testando esse popup de
 * onboarding, entao nao faz sentido deixá-lo interferir nos fluxos abaixo.
 * Precisa ser chamado ANTES da primeira navegacao (usa addInitScript).
 */
export async function suppressDailyBriefingPopup(page: Page) {
  await page.addInitScript(() => {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
    const year = parts.find((part) => part.type === "year")?.value;
    const month = parts.find((part) => part.type === "month")?.value;
    const day = parts.find((part) => part.type === "day")?.value;
    window.localStorage.setItem(`bruna_nutri_daily_briefing_shown_${year}-${month}-${day}`, "1");
    window.localStorage.setItem("bruna_nutri_ai_chat_intro_shown", "1");
  });
}
