import { describe, expect, it } from "vitest";

describe("GET /api/health", () => {
  it("reports missing required environment variables", async () => {
    const original = {
      AUTH_SECRET: process.env.AUTH_SECRET,
      CLOUDFLARE_ACCOUNT_ID: process.env.CLOUDFLARE_ACCOUNT_ID,
      CLOUDFLARE_D1_DATABASE_ID: process.env.CLOUDFLARE_D1_DATABASE_ID,
      CLOUDFLARE_D1_API_TOKEN: process.env.CLOUDFLARE_D1_API_TOKEN,
    };
    delete process.env.AUTH_SECRET;
    delete process.env.CLOUDFLARE_ACCOUNT_ID;
    delete process.env.CLOUDFLARE_D1_DATABASE_ID;
    delete process.env.CLOUDFLARE_D1_API_TOKEN;

    const { GET } = await import("../app/api/health/route");
    const response = await GET();
    const json = await response.json();

    expect(response.status).toBe(503);
    expect(json.ok).toBe(false);
    expect(json.checks.environment.missing).toContain("AUTH_SECRET");

    Object.entries(original).forEach(([key, value]) => {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    });
  });

  it("reports healthy when required environment variables are present", async () => {
    process.env.AUTH_SECRET = "test-auth-secret-with-at-least-thirty-two-characters";
    process.env.CLOUDFLARE_ACCOUNT_ID = "account";
    process.env.CLOUDFLARE_D1_DATABASE_ID = "database";
    process.env.CLOUDFLARE_D1_API_TOKEN = "token";

    const { GET } = await import("../app/api/health/route");
    const response = await GET();
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.checks.environment.missing).toEqual([]);
  });
});
