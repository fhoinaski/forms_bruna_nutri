import { describe, expect, it, vi, afterEach } from "vitest";
import { addDbRoundTrip, addAiTiming, newRequestId, runWithTrace, withPerformanceTrace } from "@/lib/observability/trace";

describe("observability trace", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("acumula metricas de D1 e IA dentro de runWithTrace + withPerformanceTrace", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const result = await runWithTrace("req-123", () =>
      withPerformanceTrace("client_snapshot", async () => {
        addDbRoundTrip(120, 40, 3);
        addDbRoundTrip(80, 10, 1);
        addAiTiming(55);
        return { ok: true };
      })
    );

    expect(result).toEqual({ ok: true });
    const logged = logSpy.mock.calls.map((call) => String(call[0])).join("\n");
    expect(logged).toContain("client_snapshot");
    expect(logged).toContain("req-123");
    expect(logged).toContain('"d1Queries":4');
    expect(logged).toContain('"d1RoundTrips":2');
    expect(logged).toContain('"dbMs":200');
    expect(logged).toContain('"aiMs":55');
  });

  it("nunca emite PHI ou segredos nos logs de performance", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await runWithTrace(newRequestId(), () =>
      withPerformanceTrace("client_snapshot", async () => {
        addDbRoundTrip(10, 5, 1);
      })
    );

    const logged = logSpy.mock.calls.map((call) => String(call[0])).join("\n");
    expect(logged).not.toMatch(/diagnos|paciente|patient|weight|peso|email|phone|telefone|token|password|secret|authorization|session/i);
  });
});