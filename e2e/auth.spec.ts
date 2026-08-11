import { test, expect } from "@playwright/test";
import * as OTPAuth from "otpauth";
import { adminFixtures, fillLoginForm, submitLogin, fillMfaCode, loginAsAdminUI } from "./helpers/auth";

/**
 * Autenticacao admin — login valido/invalido, rota protegida, logout, troca
 * obrigatoria de senha, MFA (fluxo real: setup -> verify -> login com TOTP
 * calculado de verdade, nunca hardcoded). Cada teste comeca sem sessao
 * (nao usa storageState) porque o proprio login e o objeto sob teste.
 */

test.describe("login", () => {
  test("login valido leva ao dashboard com sessao autenticada", async ({ page }) => {
    const { admin } = adminFixtures();
    await loginAsAdminUI(page, admin.email, admin.password);
    await expect(page).toHaveURL(/\/dashboard$/);
    // sessao realmente ativa: recarregar nao volta para /login
    await page.reload();
    await expect(page).toHaveURL(/\/dashboard$/);
  });

  test("login invalido nao entra e mostra mensagem generica (sem vazar detalhe interno)", async ({ page }) => {
    const { admin } = adminFixtures();
    await loginAsAdminUI(page, admin.email, "senha-completamente-errada");
    await expect(page).toHaveURL(/\/login$/);
    const error = page.locator("p.text-red-600");
    await expect(error).toBeVisible();
    const text = await error.textContent();
    expect(text).toMatch(/e-mail ou senha inválidos/i);
    expect(text?.toLowerCase()).not.toContain("password_hash");
    expect(text?.toLowerCase()).not.toContain("sql");
    expect(text?.toLowerCase()).not.toContain("stack");
  });

  test("rota protegida redireciona para /login sem sessao", async ({ page }) => {
    await page.goto("/dashboard/clients");
    await expect(page).toHaveURL(/\/login$/);
  });

  test("API admin retorna 401 sem sessao, nunca vaza dado", async ({ request }) => {
    const response = await request.get("/api/admin/clients");
    expect(response.status()).toBe(401);
  });
});

test.describe("logout", () => {
  test("logout invalida a sessao — dashboard volta a exigir login", async ({ page }) => {
    const { admin } = adminFixtures();
    await loginAsAdminUI(page, admin.email, admin.password);
    await expect(page).toHaveURL(/\/dashboard$/);

    const response = await page.request.post("/api/auth/logout");
    expect(response.ok()).toBe(true);

    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login$/);
  });
});

test.describe("troca obrigatoria de senha", () => {
  test("admin com must_change_password e forcado para /dashboard/settings/security antes de qualquer outra pagina", async ({ page }) => {
    const { adminMustChange } = adminFixtures();
    await loginAsAdminUI(page, adminMustChange.email, adminMustChange.password);
    await expect(page).toHaveURL(/\/dashboard\/settings\/security$/);

    // Tenta ir para outra pagina do dashboard — deve ser barrado de volta.
    await page.goto("/dashboard/clients");
    await expect(page).toHaveURL(/\/dashboard\/settings\/security$/);

    const newPassword = "NovaSenha!2026Xyz";
    await page.getByLabel("Senha atual", { exact: true }).fill(adminMustChange.password);
    await page.getByLabel("Nova senha", { exact: true }).fill(newPassword);
    await page.getByLabel("Confirmar nova senha", { exact: true }).fill(newPassword);
    await page.getByRole("button", { name: /salvar nova senha/i }).click();

    await expect(page).toHaveURL(/\/dashboard$/);
    // Depois de trocar a senha, a pagina deixa de forcar redirect.
    await page.goto("/dashboard/clients");
    await expect(page).toHaveURL(/\/dashboard\/clients$/);
  });
});

test.describe("MFA — fluxo real (setup, codigo invalido, codigo valido)", () => {
  test("habilita MFA, rejeita codigo invalido no login e aceita um codigo TOTP valido", async ({ page }) => {
    const { adminMfaCandidate } = adminFixtures();
    await loginAsAdminUI(page, adminMfaCandidate.email, adminMfaCandidate.password);
    await expect(page).toHaveURL(/\/dashboard$/);

    await page.goto("/dashboard/settings/security");
    await page.getByRole("button", { name: /ativar com aplicativo autenticador/i }).click();
    const manualKey = (await page.locator("code").first().textContent())?.trim();
    expect(manualKey).toBeTruthy();

    const totp = new OTPAuth.TOTP({ issuer: "Bruna Flores Nutri", label: adminMfaCandidate.email, algorithm: "SHA1", digits: 6, period: 30, secret: OTPAuth.Secret.fromBase32(manualKey!) });

    const codeInput = page.locator('input[inputmode="numeric"]').first();
    await codeInput.fill(totp.generate());
    await page.getByRole("button", { name: /^confirmar$/i }).click();
    await expect(page.getByText(/guarde estes códigos agora/i)).toBeVisible();

    await page.request.post("/api/auth/logout");

    // Login com senha correta deve agora exigir o segundo fator.
    await fillLoginForm(page, adminMfaCandidate.email, adminMfaCandidate.password);
    await submitLogin(page);
    await expect(page.getByPlaceholder(/6 dígitos ou código de recuperação/i)).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);

    // Codigo invalido: continua fora do dashboard, com mensagem propria.
    await fillMfaCode(page, "000000");
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.locator("p.text-red-600")).toContainText(/código inválido/i);

    // Codigo valido (TOTP recalculado no momento do envio): entra.
    await page.getByPlaceholder(/6 dígitos ou código de recuperação/i).fill(totp.generate());
    await page.getByRole("button", { name: /confirmar acesso/i }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
  });
});
