import { beforeEach, describe, expect, it, vi } from "vitest";

const d1 = vi.hoisted(() => ({
  d1Query: vi.fn(),
  d1Execute: vi.fn(),
  d1Batch: vi.fn(),
}));

vi.mock("@/lib/d1/client", () => ({
  d1Query: d1.d1Query,
  d1Execute: d1.d1Execute,
  d1Batch: d1.d1Batch,
}));

const baseAttrs = {
  landingPath: "/",
  landingReferrer: null,
  referrerDomain: null,
  sourceCategory: "direct" as const,
  utmSource: null,
  utmMedium: null,
  utmCampaign: null,
  utmTerm: null,
  utmContent: null,
  countryCode: null,
  deviceType: "desktop" as const,
  browserFamily: "Chrome",
  osFamily: "Windows",
  isBot: false,
  isInternal: false,
};

describe("resolveOrCreateSession", () => {
  beforeEach(() => {
    d1.d1Query.mockReset();
    d1.d1Execute.mockReset();
    d1.d1Batch.mockReset();
  });

  it("cria uma nova sessao quando nenhuma existe para o hash", async () => {
    d1.d1Query.mockResolvedValueOnce([]); // getSessionByHash -> nao encontrada
    d1.d1Execute.mockResolvedValueOnce(undefined); // INSERT

    const { resolveOrCreateSession } = await import("@/lib/repositories/analytics");
    const result = await resolveOrCreateSession("raw-token-1", baseAttrs, new Date("2026-08-18T12:00:00.000Z"));

    expect(result.isNewSession).toBe(true);
    expect(result.rawTokenToPersist).toBe("raw-token-1");
    expect(d1.d1Execute).toHaveBeenCalledTimes(1);
    expect(String(d1.d1Execute.mock.calls[0][0])).toContain("INSERT INTO analytics_sessions");
  });

  it("reutiliza a sessao existente quando dentro da janela de 30 minutos (nao cria nova, so atualiza last_seen_at)", async () => {
    const lastSeen = new Date("2026-08-18T11:50:00.000Z").toISOString(); // 10 min atras
    d1.d1Query.mockResolvedValueOnce([
      { id: "session-existing", session_hash: "hash", started_at: lastSeen, last_seen_at: lastSeen, landing_path: "/" },
    ]);
    d1.d1Execute.mockResolvedValueOnce(undefined); // UPDATE last_seen_at

    const { resolveOrCreateSession } = await import("@/lib/repositories/analytics");
    const result = await resolveOrCreateSession("raw-token-2", baseAttrs, new Date("2026-08-18T12:00:00.000Z"));

    expect(result.isNewSession).toBe(false);
    expect(result.session.id).toBe("session-existing");
    expect(result.rawTokenToPersist).toBe("raw-token-2");
    expect(String(d1.d1Execute.mock.calls[0][0])).toContain("UPDATE analytics_sessions SET last_seen_at");
  });

  it("apos 30 minutos de inatividade, rotaciona para um NOVO token/sessao em vez de reaproveitar", async () => {
    const staleLastSeen = new Date("2026-08-18T11:00:00.000Z").toISOString(); // 60 min atras
    d1.d1Query.mockResolvedValueOnce([
      { id: "session-old", session_hash: "hash-old", started_at: staleLastSeen, last_seen_at: staleLastSeen, landing_path: "/" },
    ]);
    d1.d1Execute.mockResolvedValueOnce(undefined); // INSERT da nova sessao

    const { resolveOrCreateSession } = await import("@/lib/repositories/analytics");
    const result = await resolveOrCreateSession("raw-token-expired", baseAttrs, new Date("2026-08-18T12:00:00.000Z"));

    expect(result.isNewSession).toBe(true);
    expect(result.rawTokenToPersist).not.toBe("raw-token-expired");
    expect(result.session.id).not.toBe("session-old");
  });
});

describe("insertAnalyticsEvents — dedupe via UNIQUE(session_id, client_event_id)", () => {
  beforeEach(() => {
    d1.d1Query.mockReset();
    d1.d1Execute.mockReset();
    d1.d1Batch.mockReset();
  });

  const sampleEvent = {
    clientEventId: "11111111-1111-4111-8111-111111111111",
    eventType: "PAGE_VIEW" as const,
    path: "/",
    pageTitle: null,
    referrer: null,
    utmSource: null,
    utmMedium: null,
    utmCampaign: null,
    utmTerm: null,
    utmContent: null,
    metadataJson: null,
    isBot: false,
    isInternal: false,
  };

  it("conta insercao normal quando meta.changes = 1", async () => {
    d1.d1Batch.mockResolvedValueOnce([{ results: [], success: true, meta: { changes: 1 } }]);
    d1.d1Execute.mockResolvedValueOnce(undefined);

    const { insertAnalyticsEvents } = await import("@/lib/repositories/analytics");
    const result = await insertAnalyticsEvents("session-1", [sampleEvent]);

    expect(result.insertedCount).toBe(1);
    expect(result.insertedPageviews).toBe(1);
    expect(d1.d1Execute).toHaveBeenCalledTimes(1); // atualizou contadores da sessao
  });

  it("um retry com o MESMO client_event_id nao conta como nova insercao (meta.changes = 0 = ignorado)", async () => {
    d1.d1Batch.mockResolvedValueOnce([{ results: [], success: true, meta: { changes: 0 } }]);

    const { insertAnalyticsEvents } = await import("@/lib/repositories/analytics");
    const result = await insertAnalyticsEvents("session-1", [sampleEvent]);

    expect(result.insertedCount).toBe(0);
    expect(d1.d1Execute).not.toHaveBeenCalled(); // nao atualiza contadores para um duplicado
  });

  it("marca convertedNow=true apenas quando PRECONSULTATION_COMPLETED foi de fato inserido (nao ignorado)", async () => {
    d1.d1Batch.mockResolvedValueOnce([{ results: [], success: true, meta: { changes: 1 } }]);
    d1.d1Execute.mockResolvedValueOnce(undefined);

    const { insertAnalyticsEvents } = await import("@/lib/repositories/analytics");
    const result = await insertAnalyticsEvents("session-1", [{ ...sampleEvent, eventType: "PRECONSULTATION_COMPLETED" }]);

    expect(result.convertedNow).toBe(true);
    const updateSql = String(d1.d1Execute.mock.calls[0][0]);
    expect(updateSql).toContain("converted = MAX(converted, ?3)");
  });

  it("nao marca convertedNow quando o PRECONSULTATION_COMPLETED foi um duplicado ignorado", async () => {
    d1.d1Batch.mockResolvedValueOnce([{ results: [], success: true, meta: { changes: 0 } }]);

    const { insertAnalyticsEvents } = await import("@/lib/repositories/analytics");
    const result = await insertAnalyticsEvents("session-1", [{ ...sampleEvent, eventType: "PRECONSULTATION_COMPLETED" }]);

    expect(result.convertedNow).toBe(false);
  });
});
