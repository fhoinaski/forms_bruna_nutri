import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("GET /api/health", () => {
  it("reports missing required environment variables", async () => {
    vi.stubEnv("AUTH_SECRET", undefined);
    vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", undefined);
    vi.stubEnv("CLOUDFLARE_D1_DATABASE_ID", undefined);
    vi.stubEnv("CLOUDFLARE_D1_API_TOKEN", undefined);

    const { GET } = await import("../app/api/health/route");
    const response = await GET();
    const json = await response.json();

    expect(response.status).toBe(503);
    expect(json.ok).toBe(false);
    expect(json.checks.environment.missing).toContain("AUTH_SECRET");

  });

  it("reports healthy when required environment variables are present", async () => {
    vi.stubEnv("AUTH_SECRET", "test-auth-secret-with-at-least-thirty-two-characters");
    vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "account");
    vi.stubEnv("CLOUDFLARE_D1_DATABASE_ID", "database");
    vi.stubEnv("CLOUDFLARE_D1_API_TOKEN", "token");

    const { GET } = await import("../app/api/health/route");
    const response = await GET();
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.checks.environment.missing).toEqual([]);
  });
});
