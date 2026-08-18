import { describe, expect, it } from "vitest";
import { resolveAnalyticsPeriod } from "@/lib/analytics/period";

describe("resolveAnalyticsPeriod — fuso de Sao Paulo", () => {
  // 18/08/2026 03:00 UTC = 17/08/2026 24:00 (-03:00) -> ainda madrugada de 18 em SP? Vamos usar um horario claro.
  const referenceUtc = new Date("2026-08-18T15:00:00.000Z"); // 12:00 em Sao Paulo

  it("'today' usa o dia civil de Sao Paulo, nao o dia UTC", () => {
    const range = resolveAnalyticsPeriod("today", null, null, referenceUtc);
    expect(range.from).toBe(new Date("2026-08-18T03:00:00.000Z").toISOString());
    // 23:59:59.999 em -03:00 vira 02:59:59.999 UTC do dia seguinte.
    expect(range.to).toBe(new Date("2026-08-19T02:59:59.999Z").toISOString());
  });

  it("'7d' cobre 7 dias corridos terminando hoje", () => {
    const range = resolveAnalyticsPeriod("7d", null, null, referenceUtc);
    expect(range.from).toBe(new Date("2026-08-12T03:00:00.000Z").toISOString());
  });

  it("'30d' cobre 30 dias corridos terminando hoje", () => {
    const range = resolveAnalyticsPeriod("30d", null, null, referenceUtc);
    expect(range.from).toBe(new Date("2026-07-20T03:00:00.000Z").toISOString());
  });

  it("'custom' respeita from/to explicitos", () => {
    const range = resolveAnalyticsPeriod("custom", "2026-08-01", "2026-08-05", referenceUtc);
    expect(range.from.startsWith("2026-08-01")).toBe(true);
    // fim do dia 05 em -03:00 vira madrugada do dia 06 em UTC.
    expect(range.to.startsWith("2026-08-06")).toBe(true);
  });

  it("'custom' sem from/to cai de volta para o padrao de 7 dias", () => {
    const range = resolveAnalyticsPeriod("custom", null, null, referenceUtc);
    expect(range.from).toBe(new Date("2026-08-12T03:00:00.000Z").toISOString());
  });
});
