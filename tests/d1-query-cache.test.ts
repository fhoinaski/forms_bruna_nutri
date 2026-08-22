import { afterEach, describe, expect, it, vi } from "vitest";
import { cachedQuery, invalidateAll } from "@/lib/d1/query-cache";

/**
 * FASE 4.5 (item 9/14) — cache TTL minimo pra dados de referencia
 * canonicos (nunca clinico) — ver lib/d1/query-cache.ts.
 */

afterEach(() => {
  invalidateAll();
  vi.useRealTimers();
});

describe("cachedQuery — item 9/14", () => {
  it("chave normalizada: a MESMA chave nunca dispara a query real duas vezes dentro do TTL", async () => {
    const fetcher = vi.fn().mockResolvedValue({ id: "taco:1" });
    const a = await cachedQuery("canonical:food:taco:1", 60_000, fetcher);
    const b = await cachedQuery("canonical:food:taco:1", 60_000, fetcher);
    expect(a).toEqual(b);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("chaves diferentes nunca colidem (sem vazamento de dado entre alimentos distintos)", async () => {
    const fetcherA = vi.fn().mockResolvedValue({ id: "taco:1" });
    const fetcherB = vi.fn().mockResolvedValue({ id: "tbca:9999" });
    const a = await cachedQuery("canonical:food:taco:1", 60_000, fetcherA);
    const b = await cachedQuery("canonical:food:tbca:9999", 60_000, fetcherB);
    expect(a).not.toEqual(b);
    expect(fetcherA).toHaveBeenCalledTimes(1);
    expect(fetcherB).toHaveBeenCalledTimes(1);
  });

  it("TTL expira: apos o tempo configurado, a query real roda de novo (nunca serve dado indefinidamente parado)", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn().mockResolvedValueOnce({ v: 1 }).mockResolvedValueOnce({ v: 2 });
    const first = await cachedQuery("k", 1000, fetcher);
    vi.advanceTimersByTime(1001);
    const second = await cachedQuery("k", 1000, fetcher);
    expect(first).toEqual({ v: 1 });
    expect(second).toEqual({ v: 2 });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("invalidateAll() limpa tudo — proxima chamada sempre roda a query real de novo", async () => {
    const fetcher = vi.fn().mockResolvedValue({ v: 1 });
    await cachedQuery("k", 60_000, fetcher);
    invalidateAll();
    await cachedQuery("k", 60_000, fetcher);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
