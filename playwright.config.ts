import { defineConfig, devices } from "@playwright/test";

// IMPORTANTE (auditoria FASE 1 do prompt mestre): antes desta mudanca, este
// servidor era subido com `npm run start` puro, herdando qualquer
// CLOUDFLARE_D1_DATABASE_ID ja presente no ambiente — sem NENHUM isolamento
// de banco entre dev/test/producao. `webserver-entrypoint.mjs` sobe um shim
// SQLite local (e2e/helpers/d1-shim.mjs, node:sqlite nativo) ANTES do
// Next.js e aponta CLOUDFLARE_D1_API_BASE_URL para ele, garantindo que os
// testes E2E NUNCA escrevem no D1 real, independente do que estiver em
// .env.local. `reuseExistingServer` foi fixado em `false` por seguranca —
// reaproveitar um servidor ja rodando poderia silenciosamente reusar uma
// instancia apontada para producao.
export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },
  fullyParallel: true,
  // O shim local de D1 (e2e/helpers/d1-shim.mjs) usa node:sqlite de forma
  // sincrona atras de um unico servidor HTTP — sob o paralelismo padrao
  // (1 worker por core), a fila de requisicoes ao banco fica longa o
  // suficiente para estourar o timeout de assert (5s) em testes sem
  // nenhuma relacao entre si, um falso-positivo puro de infraestrutura de
  // teste (confirmado: os mesmos testes que falham na suite cheia passam
  // 100% das vezes isolados ou com workers=1). Nao e um limite de
  // requisicoes da aplicacao (rate limit) sendo "burlado" — e so throughput
  // do shim local, que o D1 real da Cloudflare em producao nao tem.
  workers: process.env.CI ? 2 : 4,
  retries: process.env.CI ? 2 : 1,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  globalSetup: "./e2e/global-setup.ts",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  webServer: {
    command: "node e2e/helpers/webserver-entrypoint.mjs",
    url: "http://localhost:3000",
    reuseExistingServer: false,
    timeout: 120_000,
  },
  projects: [
    {
      name: "chromium-desktop",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "mobile-chrome",
      use: { ...devices["Pixel 5"] },
    },
  ],
});
