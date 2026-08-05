import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("D1 batch requests", () => {
  it("sends prepared statements as one native REST batch", async () => {
    vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "account");
    vi.stubEnv("CLOUDFLARE_D1_DATABASE_ID", "database");
    vi.stubEnv("CLOUDFLARE_D1_API_TOKEN", "token");
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      success: true,
      result: [
        { success: true, results: [{ value: 1 }] },
        { success: true, results: [{ value: 2 }] },
      ],
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const { d1Batch } = await import("../lib/d1/client");

    const result = await d1Batch([
      { sql: "SELECT ?1 AS value", params: [1] },
      { sql: "SELECT ?1 AS value", params: [2] },
    ]);

    expect(result.map((item) => item.results)).toEqual([[{ value: 1 }], [{ value: 2 }]]);
    expect(fetchMock).toHaveBeenCalledOnce();
    const request = fetchMock.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(String(request.body))).toEqual({ batch: [
      { sql: "SELECT ?1 AS value", params: [1] },
      { sql: "SELECT ?1 AS value", params: [2] },
    ] });
  });
});
