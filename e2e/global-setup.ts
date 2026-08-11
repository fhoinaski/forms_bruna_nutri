import { request, type FullConfig } from "@playwright/test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Roda uma unica vez antes da suite inteira. Nao assume nenhuma ordem
 * relativa entre `webServer` e `globalSetup` (o Playwright nao documenta
 * isso como garantia) — por isso espera ativamente tanto o servidor quanto
 * o arquivo de fixtures de admin (escrito por
 * e2e/helpers/webserver-entrypoint.mjs) ficarem prontos antes de seguir.
 *
 * Faz login real do admin padrao uma vez e salva o storageState em disco —
 * os specs que so precisam de uma sessao pronta (nao estao testando login
 * em si) reusam isso via `test.use({ storageState: ADMIN_STORAGE_STATE })`,
 * evitando repetir o fluxo de UI de login em toda spec (secao 12 do
 * pedido: performance dos testes).
 */

const root = join(__dirname, "..");
const fixturesPath = join(root, "e2e", ".tmp", "admin-fixtures.json");
export const ADMIN_STORAGE_STATE = join(root, "e2e", ".tmp", "admin-storage-state.json");

async function waitFor(check: () => boolean, label: string, timeoutMs = 60_000) {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > timeoutMs) throw new Error(`Timeout esperando: ${label}`);
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
}

export default async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0]?.use?.baseURL ?? "http://localhost:3000";

  await waitFor(() => existsSync(fixturesPath), "e2e/.tmp/admin-fixtures.json (webserver-entrypoint.mjs)");
  const fixtures = JSON.parse(readFileSync(fixturesPath, "utf8")) as {
    admin: { email: string; password: string };
  };

  let healthy = false;
  const start = Date.now();
  while (!healthy) {
    try {
      const response = await fetch(`${baseURL}/api/health`);
      healthy = response.ok;
    } catch {
      healthy = false;
    }
    if (!healthy) {
      if (Date.now() - start > 60_000) throw new Error(`Timeout esperando ${baseURL}/api/health responder.`);
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
  }

  const context = await request.newContext({ baseURL });
  const loginResponse = await context.post("/api/auth/login", {
    data: { email: fixtures.admin.email, password: fixtures.admin.password },
  });
  if (!loginResponse.ok()) {
    throw new Error(`globalSetup: login do admin padrao falhou (${loginResponse.status()}): ${await loginResponse.text()}`);
  }

  mkdirSync(join(root, "e2e", ".tmp"), { recursive: true });
  await context.storageState({ path: ADMIN_STORAGE_STATE });
  await context.dispose();

  writeFileSync(
    join(root, "e2e", ".tmp", "ready.json"),
    JSON.stringify({ readyAt: new Date().toISOString() })
  );
}
