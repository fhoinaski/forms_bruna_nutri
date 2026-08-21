import { describe, expect, it } from "vitest";
import { usdaFallbackTermFor } from "@/lib/nutrition/usda-fallback-terms";

describe("usdaFallbackTermFor", () => {
  it('reconhece "tilápia" (com acento) e devolve o termo em inglês verificado', () => {
    expect(usdaFallbackTermFor("tilápia")).toBe("tilapia");
    expect(usdaFallbackTermFor("filé de tilápia assado")).toBe("tilapia");
  });

  it("reconhece sem acento também (normalização)", () => {
    expect(usdaFallbackTermFor("tilapia")).toBe("tilapia");
  });

  it("nunca reconhece outros peixes — não generaliza pra 'peixe'", () => {
    expect(usdaFallbackTermFor("peixe")).toBeNull();
    expect(usdaFallbackTermFor("merluza")).toBeNull();
    expect(usdaFallbackTermFor("salmão")).toBeNull();
    expect(usdaFallbackTermFor("atum")).toBeNull();
  });

  it("nunca reconhece alimentos não relacionados", () => {
    expect(usdaFallbackTermFor("arroz branco cozido")).toBeNull();
    expect(usdaFallbackTermFor("frango")).toBeNull();
  });
});
