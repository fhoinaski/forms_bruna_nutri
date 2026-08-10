import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetModules();
});

interface FakeRow {
  id: string;
  admin_id: string;
  client_id: string | null;
  summary: string;
  updated_at: string;
}

function stubD1(rows: FakeRow[]) {
  vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "account");
  vi.stubEnv("CLOUDFLARE_D1_DATABASE_ID", "database");
  vi.stubEnv("CLOUDFLARE_D1_API_TOKEN", "token");

  const fetchMock = vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body)) as { sql: string; params?: unknown[] };
    const params = body.params ?? [];
    let results: unknown[] = [];

    if (body.sql.includes("SELECT * FROM ai_conversation_summaries")) {
      if (body.sql.includes("client_id IS NULL")) {
        const [adminId] = params as [string];
        results = rows.filter((row) => row.admin_id === adminId && row.client_id === null);
      } else {
        const [adminId, clientId] = params as [string, string];
        results = rows.filter((row) => row.admin_id === adminId && row.client_id === clientId);
      }
    }

    return new Response(JSON.stringify({ success: true, result: [{ success: true, results }] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  });

  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("conversation memory isolation — cliente A nunca ve o resumo do cliente B", () => {
  it("returns only the matching client's summary", async () => {
    stubD1([
      { id: "row-a", admin_id: "admin-1", client_id: "client-A", summary: "resumo do cliente A", updated_at: "2026-01-01" },
      { id: "row-b", admin_id: "admin-1", client_id: "client-B", summary: "resumo do cliente B", updated_at: "2026-01-01" },
    ]);

    const { getConversationSummary } = await import("../lib/repositories/ai-conversation-summaries");

    const summaryA = await getConversationSummary("admin-1", "client-A");
    const summaryB = await getConversationSummary("admin-1", "client-B");

    expect(summaryA?.summary).toBe("resumo do cliente A");
    expect(summaryB?.summary).toBe("resumo do cliente B");
    expect(summaryA?.summary).not.toBe(summaryB?.summary);
  });

  it("never leaks another admin's summary for the same client id", async () => {
    stubD1([
      { id: "row-1", admin_id: "admin-1", client_id: "client-A", summary: "resumo visto pelo admin 1", updated_at: "2026-01-01" },
      { id: "row-2", admin_id: "admin-2", client_id: "client-A", summary: "resumo visto pelo admin 2", updated_at: "2026-01-01" },
    ]);

    const { getConversationSummary } = await import("../lib/repositories/ai-conversation-summaries");

    const forAdmin1 = await getConversationSummary("admin-1", "client-A");
    const forAdmin2 = await getConversationSummary("admin-2", "client-A");

    expect(forAdmin1?.summary).toBe("resumo visto pelo admin 1");
    expect(forAdmin2?.summary).toBe("resumo visto pelo admin 2");
  });

  it("a general (no client) summary query never returns a client-specific row", async () => {
    stubD1([
      { id: "row-a", admin_id: "admin-1", client_id: "client-A", summary: "resumo do cliente A", updated_at: "2026-01-01" },
    ]);

    const { getConversationSummary } = await import("../lib/repositories/ai-conversation-summaries");
    const general = await getConversationSummary("admin-1", null);
    expect(general).toBeNull();
  });
});

describe("recordConversationTurn — memoria factual, sem chain-of-thought", () => {
  it("appends a short deterministic line instead of storing free-form reasoning", async () => {
    let savedSummary: string | null = null;
    stubD1([]);
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock.mockImplementation(async (_url, init) => {
      const body = JSON.parse(String((init as RequestInit).body)) as { sql: string; params?: unknown[] };
      if (body.sql.startsWith("SELECT")) {
        return new Response(JSON.stringify({ success: true, result: [{ success: true, results: [] }] }), { status: 200 });
      }
      if (body.sql.startsWith("INSERT")) {
        savedSummary = (body.params ?? [])[3] as string;
      }
      return new Response(JSON.stringify({ success: true, result: [{ success: true, results: [] }] }), { status: 200 });
    });

    const { recordConversationTurn } = await import("../lib/ai/memory/conversation-summary");
    await recordConversationTurn("admin-1", "client-A", { topic: "duvida sobre plano alimentar", proposalKind: "new_appointment" });

    expect(savedSummary).toContain("duvida sobre plano alimentar");
    expect(savedSummary).toContain("proposta: new_appointment");
  });
});
