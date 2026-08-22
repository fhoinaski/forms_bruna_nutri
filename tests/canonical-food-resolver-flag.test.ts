import { afterEach, describe, expect, it } from "vitest";
import { getCanonicalFoodResolverMode } from "@/lib/nutrition/canonical-food-resolver-flag";

const ORIGINAL = process.env.CANONICAL_FOOD_RESOLVER_MODE;

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.CANONICAL_FOOD_RESOLVER_MODE;
  else process.env.CANONICAL_FOOD_RESOLVER_MODE = ORIGINAL;
});

describe("getCanonicalFoodResolverMode — Fase 4 item 2", () => {
  it("default e 'off' quando a env var nao esta definida", () => {
    delete process.env.CANONICAL_FOOD_RESOLVER_MODE;
    expect(getCanonicalFoodResolverMode()).toBe("off");
  });

  it("aceita 'shadow' e 'prefer_canonical' explicitamente", () => {
    process.env.CANONICAL_FOOD_RESOLVER_MODE = "shadow";
    expect(getCanonicalFoodResolverMode()).toBe("shadow");
    process.env.CANONICAL_FOOD_RESOLVER_MODE = "prefer_canonical";
    expect(getCanonicalFoodResolverMode()).toBe("prefer_canonical");
  });

  it("valor invalido/desconhecido cai pra 'off' — nunca ativa producao por acidente", () => {
    process.env.CANONICAL_FOOD_RESOLVER_MODE = "canonical_only"; // nao implementado nesta fase de proposito
    expect(getCanonicalFoodResolverMode()).toBe("off");
    process.env.CANONICAL_FOOD_RESOLVER_MODE = "";
    expect(getCanonicalFoodResolverMode()).toBe("off");
  });

  it("case-insensitive (tolerante a 'Shadow'/'SHADOW')", () => {
    process.env.CANONICAL_FOOD_RESOLVER_MODE = "SHADOW";
    expect(getCanonicalFoodResolverMode()).toBe("shadow");
  });
});
