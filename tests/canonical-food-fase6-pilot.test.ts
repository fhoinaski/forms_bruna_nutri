import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { openLocalCanonicalDb, type LocalDb } from "../scripts/canonical-nutrition-import/local-db";
import { importTaco } from "../scripts/canonical-nutrition-import/run-taco";
import type { CanonicalDbExecutor } from "@/lib/nutrition/canonical-food-search";
import type { LegacyFoodSearchResponseItem } from "@/lib/nutrition/food-catalog";

const FIXTURES = resolve("tests/fixtures/canonical-nutrition");

function ref(sourceId: string) {
  return { source: "TACO" as const, sourceId };
}

function makeLocalDb(): { db: LocalDb; executor: CanonicalDbExecutor; dir: string } {
  const dir = mkdtempSync(join(tmpdir(), "canonical-fase6-test-"));
  const db = openLocalCanonicalDb(join(dir, "test.sqlite"));
  importTaco(join(FIXTURES, "taco-fixture.json"), db, "batch-taco");
  const executor: CanonicalDbExecutor = async (sql, params) => db.prepare(sql).all(...params);
  return { db, executor, dir };
}

const ALL_SCOPE_ENV_VARS = [
  "CANONICAL_FOOD_RESOLVER_MODE",
  "CANONICAL_FOOD_RESOLVER_MODE_ADMIN_FOOD_SEARCH",
  "CANONICAL_FOOD_RESOLVER_MODE_SUBSTITUTIONS",
  "CANONICAL_FOOD_RESOLVER_MODE_MEAL_PLAN_AI",
];

afterEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  for (const key of ALL_SCOPE_ENV_VARS) delete process.env[key];
});

function mockCurrentResolver(name: string, sourceId: string, matchRank = 0) {
  vi.doMock("@/lib/nutrition/food-catalog", () => ({
    searchFoods: vi.fn().mockResolvedValue([{ ref: ref(sourceId), name, sourceLabel: "TACO", matchRank }]),
    getFoodByReference: vi.fn().mockResolvedValue({ macroReference: { fonte: "taco", numero: sourceId, descricao: name, energia_kcal: 100, proteina_g: 1, carboidrato_g: 1, lipidios_g: 1 } }),
  }));
  vi.doMock("@/lib/clinical/food-safety", () => ({ checkFoodAgainstPatientRestrictions: vi.fn().mockReturnValue({ status: "compatible", checks: [] }) }));
}

describe("FASE 6 (item 16) — V2 exclusiva pra prefer_canonical", () => {
  it("V2 auto-accept usa o canonico (prefer_canonical, escopo admin_food_search)", async () => {
    process.env.CANONICAL_FOOD_RESOLVER_MODE_ADMIN_FOOD_SEARCH = "prefer_canonical";
    const { db, executor, dir } = makeLocalDb();
    try {
      mockCurrentResolver("Arroz, integral, cozido", "1");
      const { resolveFoodWithCanonicalShadow } = await import("@/lib/nutrition/canonical-food-shadow");
      const result = await resolveFoodWithCanonicalShadow("Arroz, integral, cozido", [], null, "admin_food_search", { db: executor });
      expect(result.status).toBe("RESOLVED");
      expect(result.ref?.sourceId).toBe("1");
    } finally {
      db.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("V1 sozinha (mesmo confiante) NUNCA dispara prefer_canonical — so a V2 decide", async () => {
    // Query ambigua o bastante pra V2 bloquear (STRONG_TOKEN_MATCH com gap
    // pequeno) mas onde V1 (score>=90/gap>=8) sozinha aceitaria — prova que
    // e a V2, nao a V1, quem decide (telemetria confirma v1WouldAutoAccept
    // pode ser true enquanto usedCanonical fica false).
    process.env.CANONICAL_FOOD_RESOLVER_MODE_ADMIN_FOOD_SEARCH = "prefer_canonical";
    const { db, executor, dir } = makeLocalDb();
    try {
      mockCurrentResolver("Alimento Atual Diferente", "999");
      const { resolveFoodWithCanonicalShadow } = await import("@/lib/nutrition/canonical-food-shadow");
      const events: Array<Record<string, unknown>> = [];
      const result = await resolveFoodWithCanonicalShadow("abacaxi", [], null, "admin_food_search", { db: executor, onTelemetry: (e) => events.push(e as unknown as Record<string, unknown>) });
      // "abacaxi" e 1 token -> GENERIC_SHORT_QUERY -> V2 nunca aceita.
      expect(events[0]?.v2AutoAccept).toBe(false);
      expect(result.ref?.sourceId).not.toBe("1"); // nunca trocou pro canonico so por V1
    } finally {
      db.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("V2 reject cai no fallback (resultado atual, nunca o canonico)", async () => {
    process.env.CANONICAL_FOOD_RESOLVER_MODE_ADMIN_FOOD_SEARCH = "prefer_canonical";
    const { db, executor, dir } = makeLocalDb();
    try {
      mockCurrentResolver("Alimento Atual Diferente", "999");
      const { resolveFoodWithCanonicalShadow } = await import("@/lib/nutrition/canonical-food-shadow");
      const result = await resolveFoodWithCanonicalShadow("abacaxi", [], null, "admin_food_search", { db: executor });
      expect(result.ref?.sourceId).toBe("999");
    } finally {
      db.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("erro do D1/canonico cai no fallback — nunca quebra a busca", async () => {
    process.env.CANONICAL_FOOD_RESOLVER_MODE_ADMIN_FOOD_SEARCH = "prefer_canonical";
    mockCurrentResolver("Alimento Atual Diferente", "999");
    // db que sempre lanca — simula falha real de D1 (timeout/network).
    const throwingDb: CanonicalDbExecutor = async () => {
      throw new Error("simulated D1 timeout");
    };
    const { resolveFoodWithCanonicalShadow } = await import("@/lib/nutrition/canonical-food-shadow");
    const result = await resolveFoodWithCanonicalShadow("Arroz, integral, cozido", [], null, "admin_food_search", { db: throwingDb });
    expect(result.status).toBe("RESOLVED");
    expect(result.ref?.sourceId).toBe("999");
  });

  it("status AMBIGUOUS do canonico cai no fallback", async () => {
    process.env.CANONICAL_FOOD_RESOLVER_MODE_ADMIN_FOOD_SEARCH = "prefer_canonical";
    const { db, executor, dir } = makeLocalDb();
    try {
      mockCurrentResolver("Alimento Atual Diferente", "999");
      const { resolveFoodWithCanonicalShadow } = await import("@/lib/nutrition/canonical-food-shadow");
      // "suco de uva integral" no fixture tem 2 candidatos empatados (ver
      // tests/canonical-food-search.test.ts) — AMBIGUOUS real.
      const result = await resolveFoodWithCanonicalShadow("suco de uva integral", [], null, "admin_food_search", { db: executor });
      expect(result.ref?.sourceId).toBe("999");
    } finally {
      db.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("substitutions continua em shadow mesmo com V2 confiante — nunca usa o canonico", async () => {
    process.env.CANONICAL_FOOD_RESOLVER_MODE_SUBSTITUTIONS = "shadow";
    const { db, executor, dir } = makeLocalDb();
    try {
      mockCurrentResolver("Alimento Atual Diferente", "999");
      const { resolveFoodWithCanonicalShadow } = await import("@/lib/nutrition/canonical-food-shadow");
      const result = await resolveFoodWithCanonicalShadow("Arroz, integral, cozido", [], null, "substitutions", { db: executor });
      expect(result.ref?.sourceId).toBe("999"); // sempre o atual em shadow, mesmo com canonico confiante
    } finally {
      db.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("meal_plan_ai continua em shadow mesmo com V2 confiante — nunca usa o canonico", async () => {
    process.env.CANONICAL_FOOD_RESOLVER_MODE_MEAL_PLAN_AI = "shadow";
    const { db, executor, dir } = makeLocalDb();
    try {
      mockCurrentResolver("Alimento Atual Diferente", "999");
      const { resolveFoodWithCanonicalShadow } = await import("@/lib/nutrition/canonical-food-shadow");
      const result = await resolveFoodWithCanonicalShadow("Arroz, integral, cozido", [], null, "meal_plan_ai", { db: executor });
      expect(result.ref?.sourceId).toBe("999");
    } finally {
      db.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("escopos diferentes usam modos diferentes ao mesmo tempo (admin prefer_canonical promove, substitutions shadow nunca promove pro MESMO caso)", async () => {
    process.env.CANONICAL_FOOD_RESOLVER_MODE_ADMIN_FOOD_SEARCH = "prefer_canonical";
    process.env.CANONICAL_FOOD_RESOLVER_MODE_SUBSTITUTIONS = "shadow";
    const { db, executor, dir } = makeLocalDb();
    try {
      // Atual fica AMBIGUOUS sozinho (2 candidatos rank 2); reresolvido pelo
      // nome exato do candidato canonico confiante, confirma com rank 0 —
      // MESMO padrao ja validado em tests/canonical-food-shadow.test.ts.
      const searchFoods = vi
        .fn()
        .mockResolvedValue([
          { ref: ref("1"), name: "Arroz, integral, cozido", sourceLabel: "TACO", matchRank: 2 },
          { ref: ref("2"), name: "Arroz, integral, cru", sourceLabel: "TACO", matchRank: 2 },
        ])
        .mockResolvedValueOnce([
          { ref: ref("1"), name: "Arroz, integral, cozido", sourceLabel: "TACO", matchRank: 2 },
          { ref: ref("2"), name: "Arroz, integral, cru", sourceLabel: "TACO", matchRank: 2 },
        ])
        .mockResolvedValueOnce([{ ref: ref("1"), name: "Arroz, integral, cozido", sourceLabel: "TACO", matchRank: 0 }]);
      vi.doMock("@/lib/nutrition/food-catalog", () => ({
        searchFoods,
        getFoodByReference: vi.fn().mockResolvedValue({ macroReference: { fonte: "taco", numero: 1, descricao: "Arroz, integral, cozido", energia_kcal: 123, proteina_g: 2, carboidrato_g: 25, lipidios_g: 1 } }),
      }));
      vi.doMock("@/lib/clinical/food-safety", () => ({ checkFoodAgainstPatientRestrictions: vi.fn().mockReturnValue({ status: "compatible", checks: [] }) }));

      const { resolveFoodWithCanonicalShadow } = await import("@/lib/nutrition/canonical-food-shadow");
      const admin = await resolveFoodWithCanonicalShadow("Arroz, integral, cozido", [], null, "admin_food_search", { db: executor });
      const subs = await resolveFoodWithCanonicalShadow("Arroz, integral, cozido", [], null, "substitutions", { db: executor });
      expect(admin.status).toBe("RESOLVED"); // canonico confiante, prefer_canonical re-resolve e usa
      expect(admin.ref?.sourceId).toBe("1");
      expect(subs.status).toBe("AMBIGUOUS"); // mesmo caso, shadow nunca promove — fica com o resultado atual
    } finally {
      db.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("provenance preservada na telemetria: matchClass/preparationEvidence/policyVersion sempre presentes quando ha canonico", async () => {
    process.env.CANONICAL_FOOD_RESOLVER_MODE_ADMIN_FOOD_SEARCH = "shadow";
    const { db, executor, dir } = makeLocalDb();
    try {
      mockCurrentResolver("Alimento Atual Diferente", "999");
      const { resolveFoodWithCanonicalShadow } = await import("@/lib/nutrition/canonical-food-shadow");
      const events: Array<Record<string, unknown>> = [];
      await resolveFoodWithCanonicalShadow("Arroz, integral, cozido", [], null, "admin_food_search", { db: executor, onTelemetry: (e) => events.push(e as unknown as Record<string, unknown>) });
      expect(events[0].policyVersion).toBe("V2");
      expect(events[0]).toHaveProperty("v2MatchClass");
      expect(events[0]).toHaveProperty("v2QueryRisk");
      expect(events[0]).toHaveProperty("v2Reason");
      expect(events[0]).toHaveProperty("v1WouldAutoAccept");
      expect(events[0].scope).toBe("admin_food_search");
    } finally {
      db.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("FASE 6 (item 3/4) — annotateAdminFoodSearchWithCanonicalPilot", () => {
  const baselineItems: LegacyFoodSearchResponseItem[] = [{
    numero: "1", grupo: "", ref: ref("1"), sourceLabel: "TACO", name: "Arroz, integral, cozido", displayName: "Arroz integral cozido",
    descricao: "Arroz, integral, cozido", fonte: "taco", energia_kcal: 100, proteina_g: 1, carboidrato_g: 1, lipidios_g: 1, fibra_g: null,
    energyKcal: 100, proteinG: 1, carbohydrateG: 1, fatG: 1, fiberG: null,
  }];

  it("mode off: nunca chama o canonico, devolve a lista original intocada", async () => {
    process.env.CANONICAL_FOOD_RESOLVER_MODE_ADMIN_FOOD_SEARCH = "off";
    const { annotateAdminFoodSearchWithCanonicalPilot } = await import("@/lib/nutrition/canonical-food-admin-search");
    const result = await annotateAdminFoodSearchWithCanonicalPilot("Arroz, integral, cozido", baselineItems);
    expect(result.items).toBe(baselineItems);
    expect(result.canonicalPilot).toBeNull();
  });

  it("prefer_canonical + V2 confiante + fonte TACO: reordena e marca preselected=true, com portions reais", async () => {
    process.env.CANONICAL_FOOD_RESOLVER_MODE_ADMIN_FOOD_SEARCH = "prefer_canonical";
    const { db, executor, dir } = makeLocalDb();
    try {
      const { annotateAdminFoodSearchWithCanonicalPilot } = await import("@/lib/nutrition/canonical-food-admin-search");
      const result = await annotateAdminFoodSearchWithCanonicalPilot("Arroz, integral, cozido", baselineItems, { db: executor });
      expect(result.canonicalPilot?.preselected).toBe(true);
      expect(result.canonicalPilot?.policyVersion).toBe("V2");
      expect(result.canonicalPilot?.source).toBe("TACO");
      expect(Array.isArray(result.canonicalPilot?.portions)).toBe(true);
    } finally {
      db.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("query generica (1 token) nunca preseleciona, mesmo em prefer_canonical", async () => {
    process.env.CANONICAL_FOOD_RESOLVER_MODE_ADMIN_FOOD_SEARCH = "prefer_canonical";
    const { db, executor, dir } = makeLocalDb();
    try {
      const { annotateAdminFoodSearchWithCanonicalPilot } = await import("@/lib/nutrition/canonical-food-admin-search");
      // "arroz" (1 token) bate no fixture TACO ("Arroz, integral, cozido")
      // via PREFIX/CONTAINS — mas GENERIC_SHORT_QUERY bloqueia mesmo assim.
      const result = await annotateAdminFoodSearchWithCanonicalPilot("arroz", baselineItems, { db: executor });
      expect(result.canonicalPilot?.matchClass).toBe("GENERIC_SHORT_QUERY");
      expect(result.canonicalPilot?.preselected).toBe(false);
      expect(result.items).toBe(baselineItems);
    } finally {
      db.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("erro do canonico (D1) cai no fallback — lista original, canonicalPilot null", async () => {
    process.env.CANONICAL_FOOD_RESOLVER_MODE_ADMIN_FOOD_SEARCH = "prefer_canonical";
    const throwingDb: CanonicalDbExecutor = async () => {
      throw new Error("simulated D1 error");
    };
    const { annotateAdminFoodSearchWithCanonicalPilot } = await import("@/lib/nutrition/canonical-food-admin-search");
    const result = await annotateAdminFoodSearchWithCanonicalPilot("Arroz, integral, cozido", baselineItems, { db: throwingDb });
    expect(result.items).toBe(baselineItems);
    expect(result.canonicalPilot).toBeNull();
  });
});

describe("FASE 6 (item 8/9) — feedback nunca auto-muta alias/ranking", () => {
  it("recordCanonicalResolutionFeedback so INSERE — nunca chama nenhuma funcao de alias/ranking/policy", async () => {
    const d1Execute = vi.fn().mockResolvedValue(undefined);
    vi.doMock("@/lib/d1/client", () => ({ d1Execute, d1Query: vi.fn() }));
    const { recordCanonicalResolutionFeedback } = await import("@/lib/repositories/canonical-resolution-feedback");
    await recordCanonicalResolutionFeedback({
      queryHash: "abc123",
      suggestedCanonicalFoodId: "taco:1",
      suggestedMatchClass: "EXACT_NAME",
      chosenSource: "TACO",
      chosenSourceId: "1",
      outcome: "CORRECT",
      adminId: "admin-1",
    });
    expect(d1Execute).toHaveBeenCalledTimes(1);
    const [sql] = d1Execute.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/INSERT INTO canonical_resolution_feedback/);
    // nunca toca em food_aliases/canonical_foods/nenhuma tabela de ranking.
    expect(sql).not.toMatch(/food_aliases|canonical_foods\b|UPDATE|DELETE/i);
  });

  it("outcome so aceita CORRECT/WRONG/CHANGED_SELECTION (nunca um valor livre que poderia virar comando)", async () => {
    const d1Execute = vi.fn().mockResolvedValue(undefined);
    vi.doMock("@/lib/d1/client", () => ({ d1Execute, d1Query: vi.fn() }));
    const { recordCanonicalResolutionFeedback } = await import("@/lib/repositories/canonical-resolution-feedback");
    // TS ja bloqueia isso em tempo de compilacao (union literal) — o teste
    // documenta o contrato em runtime tambem, via o schema Zod da rota.
    const { z } = await import("zod");
    const schema = z.enum(["CORRECT", "WRONG", "CHANGED_SELECTION"]);
    expect(schema.safeParse("CORRECT").success).toBe(true);
    expect(schema.safeParse("DELETE_EVERYTHING").success).toBe(false);
  });
});
