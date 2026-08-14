import { test as base, expect } from "@playwright/test";

export { expect };

/**
 * Fixture base compartilhada da suíte E2E.
 *
 * O servidor local de E2E não recebe `cf-connecting-ip` nem `x-forwarded-for`
 * (não há proxy na frente do `next start`), então `getRequestFingerprint` cai
 * no fallback "unknown" — e TODOS os testes compartilham o MESMO bucket de
 * rate limit (admin-login, public-form, intake-session, intake-message).
 * Sob `--repeat-each`/paralelismo, esses limites (ex.: public-form = 5/h,
 * intake-session = 20/h) estouram e derrubam testes sem relação entre si
 * com 429.
 *
 * Em produção cada cliente tem um IP distinto, então o limite é por IP. Aqui
 * reproduzimos exatamente isso: cada instância de teste recebe um
 * `x-forwarded-for` único, isolando o bucket de rate limit por teste — sem
 * alterar nenhum limite nem o comportamento de produção.
 */
let ipCounter = 0;

export const test = base.extend<{ clientIp: string }>({
  clientIp: [
    async ({}, provide, testInfo) => {
      // Único por (worker, contador local do processo) — workerIndex distingue
      // processos; ipCounter distingue testes/retries dentro do mesmo worker.
      const n = ipCounter++;
      const ip = `10.${testInfo.workerIndex % 250}.${Math.floor(n / 250) % 250}.${n % 250}`;
      await provide(ip);
    },
    { scope: "test" },
  ],

  context: async ({ context, clientIp }, provide) => {
    await context.setExtraHTTPHeaders({ "x-forwarded-for": clientIp });
    await provide(context);
  },

  request: async ({ playwright, baseURL, storageState, extraHTTPHeaders, clientIp }, provide) => {
    const request = await playwright.request.newContext({
      baseURL,
      storageState,
      extraHTTPHeaders: { ...(extraHTTPHeaders ?? {}), "x-forwarded-for": clientIp },
    });
    await provide(request);
    await request.dispose();
  },
});
