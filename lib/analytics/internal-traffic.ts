import type { NextRequest } from "next/server";

// Evita poluir analytics com navegacao do proprio admin, E2E/Playwright e
// health checks. Nunca usado para filtrar visitantes reais por engano —
// so marca is_internal=1, os dados continuam gravados (podem ser
// inspecionados em diagnostico), apenas excluidos dos KPIs padrao.

const ADMIN_SESSION_COOKIE = "bruna_nutri_admin_session";

const AUTOMATION_UA_PATTERNS = [/playwright/i, /puppeteer/i, /^Mozilla\/5\.0 \(compatible; Monitor/i];

export function isInternalRequest(req: NextRequest): boolean {
  // So o admin logado e considerado trafego interno. Pacientes autenticados
  // no portal continuam sendo visitantes reais para fins de analytics.
  if (req.cookies.get(ADMIN_SESSION_COOKIE)?.value) return true;

  const e2eToken = process.env.ANALYTICS_E2E_INTERNAL_TOKEN;
  if (e2eToken && req.headers.get("x-analytics-internal") === e2eToken) return true;

  const userAgent = req.headers.get("user-agent") ?? "";
  if (AUTOMATION_UA_PATTERNS.some((pattern) => pattern.test(userAgent))) return true;

  return false;
}
