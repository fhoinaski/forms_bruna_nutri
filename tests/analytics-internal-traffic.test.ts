import { describe, expect, it, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { isInternalRequest } from "@/lib/analytics/internal-traffic";

function buildRequest(options: { cookie?: string; userAgent?: string; internalHeader?: string } = {}) {
  const headers = new Headers();
  if (options.cookie) headers.set("cookie", options.cookie);
  if (options.userAgent) headers.set("user-agent", options.userAgent);
  if (options.internalHeader) headers.set("x-analytics-internal", options.internalHeader);
  return new NextRequest("https://brunanutri.com.br/", { headers });
}

describe("isInternalRequest", () => {
  afterEach(() => {
    delete process.env.ANALYTICS_E2E_INTERNAL_TOKEN;
  });

  it("marca como interno quando o cookie de sessao admin esta presente", () => {
    const req = buildRequest({ cookie: "bruna_nutri_admin_session=abc123" });
    expect(isInternalRequest(req)).toBe(true);
  });

  it("NAO marca paciente autenticado no portal como interno", () => {
    const req = buildRequest({ cookie: "bruna_nutri_client_portal_session=xyz789" });
    expect(isInternalRequest(req)).toBe(false);
  });

  it("visitante comum sem cookies nao e interno", () => {
    const req = buildRequest({ userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0" });
    expect(isInternalRequest(req)).toBe(false);
  });

  it("marca como interno via header de E2E quando o token bate com a env var", () => {
    process.env.ANALYTICS_E2E_INTERNAL_TOKEN = "test-secret-token";
    const req = buildRequest({ internalHeader: "test-secret-token" });
    expect(isInternalRequest(req)).toBe(true);
  });

  it("NAO marca como interno quando o header de E2E nao bate com a env var", () => {
    process.env.ANALYTICS_E2E_INTERNAL_TOKEN = "test-secret-token";
    const req = buildRequest({ internalHeader: "wrong-token" });
    expect(isInternalRequest(req)).toBe(false);
  });

  it("sem env var configurada, o header de E2E nunca marca como interno (fail-closed)", () => {
    const req = buildRequest({ internalHeader: "anything" });
    expect(isInternalRequest(req)).toBe(false);
  });

  it("marca User-Agent do Playwright como interno", () => {
    const req = buildRequest({ userAgent: "Mozilla/5.0 Playwright/1.40.0" });
    expect(isInternalRequest(req)).toBe(true);
  });
});
