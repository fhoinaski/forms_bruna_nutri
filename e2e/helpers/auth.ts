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

/** Le os admins semeados por e2e/helpers/webserver-entrypoint.mjs antes do servidor subir. */
export function adminFixtures(): { admin: AdminFixture; adminMustChange: AdminFixture; adminMfaCandidate: AdminFixture } {
  return JSON.parse(readFileSync(fixturesPath, "utf8"));
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
