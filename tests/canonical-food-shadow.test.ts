import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { openLocalCanonicalDb, type LocalDb } from "../scripts/canonical-nutrition-import/local-db";
import { importTaco } from "../scripts/canonical-nutrition-import/run-taco";
import type { CanonicalDbExecutor } from "@/lib/nutrition/canonical-food-search";

const FIXTURES = resolve("tests/fixtures/canonical-nutrition");

function ref(sourceId: string) {
  return { source: "TACO" as const, sourceId };
}

function makeLocalDb(): { db: LocalDb; executor: CanonicalDbExecutor; dir: string } {
  const dir = mkdtempSync(join(tmpdir(), "canonical-shadow-test-"));
  const db = openLocalCanonicalDb(join(dir, "test.sqlite"));
  importTaco(join(FIXTURES, "taco-fixture.json"), db, "batch-taco");
  const executor: CanonicalDbExecutor = async (sql, params) => db.prepare(sql).all(...params);
  return { db, executor, dir };
}

afterEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  delete process.env.CANONICAL_FOOD_RESOLVER_MODE;
});

describe("resolveFoodWithCanonicalShadow — Fase 4 (item 12)", () => {
  it("off: usa SOMENTE o resolver atual — nem chama o canonico", async () => {
    process.env.CANONICAL_FOOD_RESOLVER_MODE = "off";
    vi.doMock("@/lib/nutrition/food-catalog", () => ({
      searchFoods: vi.fn().mockResolvedValue([{ ref: ref("1"), name: "Arroz, integral, cozido", sourceLabel: "TACO", matchRank: 0 }]),
      getFoodByReference: vi.fn().mockResolvedValue({ macroReference: { fonte: "taco", numero: 1, descricao: "Arroz, integral, cozido", energia_kcal: 123, proteina_g: 2, carboidrato_g: 25, lipidios_g: 1 } }),
    }));
    vi.doMock("@/lib/clinical/food-safety", () => ({ checkFoodAgainstPatientRestrictions: vi.fn().mockReturnValue({ status: "compatible", checks: [] }) }));

    // Nao mocka canonical-food-resolver de proposito: se "off" chamasse o
    // canonico por engano, ele tentaria o d1Query real (sem credenciais
    // validas no ambiente de teste) e o teste falharia com erro de rede —
    // o fato de passar comprova que o canonico nunca foi invocado (early
    // return antes do Promise.all, ver lib/nutrition/canonical-food-shadow.ts).
    const { resolveFoodWithCanonicalShadow } = await import("@/lib/nutrition/canonical-food-shadow");
    const result = await resolveFoodWithCanonicalShadow("Arroz, integral, cozido", [], undefined, "admin_food_search");
    expect(result.status).toBe("RESOLVED");
  });

  it("shadow: retorna o resultado do resolver ATUAL, mesmo quando o canonico discorda", async () => {
    process.env.CANONICAL_FOOD_RESOLVER_MODE = "shadow";
    const { db, executor, dir } = makeLocalDb();
    try {
      vi.doMock("@/lib/nutrition/food-catalog", () => ({
        searchFoods: vi.fn().mockResolvedValue([{ ref: ref("999"), name: "Alimento Atual Diferente", sourceLabel: "TACO", matchRank: 0 }]),
        getFoodByReference: vi.fn().mockResolvedValue({ macroReference: { fonte: "taco", numero: 999, descricao: "Alimento Atual Diferente", energia_kcal: 1, proteina_g: 1, carboidrato_g: 1, lipidios_g: 1 } }),
      }));
      vi.doMock("@/lib/clinical/food-safety", () => ({ checkFoodAgainstPatientRestrictions: vi.fn().mockReturnValue({ status: "compatible", checks: [] }) }));

      const { resolveFoodWithCanonicalShadow } = await import("@/lib/nutrition/canonical-food-shadow");
      const result = await resolveFoodWithCanonicalShadow("Arroz, integral, cozido", [], null, "admin_food_search", { db: executor });
      expect(result.status).toBe("RESOLVED");
      expect(result.ref?.sourceId).toBe("999"); // sempre o ATUAL, nunca o canonico, em shadow
    } finally {
      db.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("prefer_canonical: quando o atual ja e RESOLVED, nunca troca pelo canonico", async () => {
    process.env.CANONICAL_FOOD_RESOLVER_MODE = "prefer_canonical";
    const { db, executor, dir } = makeLocalDb();
    try {
      vi.doMock("@/lib/nutrition/food-catalog", () => ({
        searchFoods: vi.fn().mockResolvedValue([{ ref: ref("1"), name: "Arroz, integral, cozido", sourceLabel: "TACO", matchRank: 0 }]),
        getFoodByReference: vi.fn().mockResolvedValue({ macroReference: { fonte: "taco", numero: 1, descricao: "Arroz, integral, cozido", energia_kcal: 123, proteina_g: 2, carboidrato_g: 25, lipidios_g: 1 } }),
      }));
      vi.doMock("@/lib/clinical/food-safety", () => ({ checkFoodAgainstPatientRestrictions: vi.fn().mockReturnValue({ status: "compatible", checks: [] }) }));

      const { resolveFoodWithCanonicalShadow } = await import("@/lib/nutrition/canonical-food-shadow");
      const result = await resolveFoodWithCanonicalShadow("Arroz, integral, cozido", [], null, "admin_food_search", { db: executor });
      expect(result.status).toBe("RESOLVED");
      expect(result.ref?.sourceId).toBe("1");
    } finally {
      db.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("prefer_canonical: atual AMBIGUOUS + canonico confiante num TACO reconhecido → re-resolve e usa o atual (mesma pipeline, nunca dado novo)", async () => {
    process.env.CANONICAL_FOOD_RESOLVER_MODE = "prefer_canonical";
    const { db, executor, dir } = makeLocalDb();
    try {
      // 1a chamada (query original "arroz, integral, cozido" digitada sem
      // capitalizacao exata) → o resolver ATUAL sozinho fica AMBIGUOUS.
      // 2a chamada (re-resolve pelo NOME EXATO do candidato canonico
      // confiante) → o mesmo resolver ATUAL confirma com rank 0. O mock
      // distingue por ORDEM de chamada, nao por texto — as duas usam nomes
      // parecidos de proposito, o que importa e a PIPELINE ser a mesma.
      const searchFoods = vi
        .fn()
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
      // Query EXATA do nome tecnico — o canonico bate EXACT_NAME (score alto, decisivo), o atual (mockado) fica AMBIGUOUS sozinho.
      const result = await resolveFoodWithCanonicalShadow("Arroz, integral, cozido", [], null, "admin_food_search", { db: executor });
      // O canonico achou "Arroz, integral, cozido" (taco:1) com confianca —
      // o resolver atual re-resolvido pelo NOME exato (mesma tecnica do substitution-command-router.ts) confirma e usa.
      expect(result.status).toBe("RESOLVED");
      expect(result.ref?.sourceId).toBe("1");
      expect(searchFoods).toHaveBeenCalledTimes(2);
    } finally {
      db.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("prefer_canonical: canonico NOT_FOUND/AMBIGUOUS → fallback pro resultado atual, mesmo que atual seja AMBIGUOUS", async () => {
    process.env.CANONICAL_FOOD_RESOLVER_MODE = "prefer_canonical";
    const { db, executor, dir } = makeLocalDb();
    try {
      vi.doMock("@/lib/nutrition/food-catalog", () => ({
        searchFoods: vi.fn().mockResolvedValue([
          { ref: ref("1"), name: "Frango, peito, cru", sourceLabel: "TACO", matchRank: 2 },
          { ref: ref("2"), name: "Frango, coxa, crua", sourceLabel: "TACO", matchRank: 2 },
        ]),
        getFoodByReference: vi.fn(),
      }));
      vi.doMock("@/lib/clinical/food-safety", () => ({ checkFoodAgainstPatientRestrictions: vi.fn() }));

      const { resolveFoodWithCanonicalShadow } = await import("@/lib/nutrition/canonical-food-shadow");
      const result = await resolveFoodWithCanonicalShadow("xyz_query_sem_correspondencia_nenhuma_12345", [], null, "admin_food_search", { db: executor });
      expect(result.status).toBe("AMBIGUOUS");
    } finally {
      db.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // FASE 5 (item 2) — telemetria agora inclui score_gap/preparation_conflict.
  it("telemetria (shadow) inclui scoreGap e preparationConflict, nunca texto livre da query", async () => {
    process.env.CANONICAL_FOOD_RESOLVER_MODE = "shadow";
    const { db, executor, dir } = makeLocalDb();
    try {
      vi.doMock("@/lib/nutrition/food-catalog", () => ({
        searchFoods: vi.fn().mockResolvedValue([{ ref: ref("999"), name: "Alimento Atual Diferente", sourceLabel: "TACO", matchRank: 0 }]),
        getFoodByReference: vi.fn().mockResolvedValue({ macroReference: { fonte: "taco", numero: 999, descricao: "Alimento Atual Diferente", energia_kcal: 1, proteina_g: 1, carboidrato_g: 1, lipidios_g: 1 } }),
      }));
      vi.doMock("@/lib/clinical/food-safety", () => ({ checkFoodAgainstPatientRestrictions: vi.fn().mockReturnValue({ status: "compatible", checks: [] }) }));

      const { resolveFoodWithCanonicalShadow } = await import("@/lib/nutrition/canonical-food-shadow");
      const events: Array<Record<string, unknown>> = [];
      await resolveFoodWithCanonicalShadow("Arroz, integral, cozido", [], null, "admin_food_search", { db: executor, onTelemetry: (e) => events.push(e as unknown as Record<string, unknown>) });
      expect(events).toHaveLength(1);
      expect(events[0]).toHaveProperty("scoreGap");
      expect(events[0]).toHaveProperty("preparationConflict");
      expect(typeof events[0].preparationConflict).toBe("boolean");
      // nunca o texto livre da query — so hash.
      expect(JSON.stringify(events[0])).not.toContain("Arroz, integral, cozido");
    } finally {
      db.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// FASE 5 (item 1) — equivalente em lote, usado agora pelos pontos de
// producao reais que antes chamavam resolveFoodCandidates direto.
describe("resolveFoodCandidatesWithCanonicalShadow — Fase 5 (item 1)", () => {
  it("dedup por query normalizada: a MESMA query pedida em duas chaves so resolve uma vez", async () => {
    process.env.CANONICAL_FOOD_RESOLVER_MODE = "off";
    const searchFoods = vi.fn().mockResolvedValue([{ ref: ref("1"), name: "Arroz, integral, cozido", sourceLabel: "TACO", matchRank: 0 }]);
    vi.doMock("@/lib/nutrition/food-catalog", () => ({
      searchFoods,
      getFoodByReference: vi.fn().mockResolvedValue({ macroReference: { fonte: "taco", numero: 1, descricao: "Arroz, integral, cozido", energia_kcal: 123, proteina_g: 2, carboidrato_g: 25, lipidios_g: 1 } }),
    }));
    vi.doMock("@/lib/clinical/food-safety", () => ({ checkFoodAgainstPatientRestrictions: vi.fn().mockReturnValue({ status: "compatible", checks: [] }) }));

    const { resolveFoodCandidatesWithCanonicalShadow } = await import("@/lib/nutrition/canonical-food-shadow");
    const result = await resolveFoodCandidatesWithCanonicalShadow(
      [
        { query: "arroz integral cozido", key: "meal-1:item-0" },
        { query: "Arroz Integral Cozido", key: "meal-2:item-0" },
      ],
      [],
      undefined,
      "meal_plan_ai"
    );
    expect(result.size).toBe(2);
    expect(result.get("meal-1:item-0")?.status).toBe("RESOLVED");
    expect(result.get("meal-2:item-0")?.status).toBe("RESOLVED");
    expect(searchFoods).toHaveBeenCalledTimes(1);
  });

  it("off: comportamento identico a resolveFoodCandidates (zero overhead, nunca chama o canonico)", async () => {
    process.env.CANONICAL_FOOD_RESOLVER_MODE = "off";
    vi.doMock("@/lib/nutrition/food-catalog", () => ({
      searchFoods: vi.fn().mockResolvedValue([]),
      getFoodByReference: vi.fn(),
    }));
    vi.doMock("@/lib/clinical/food-safety", () => ({ checkFoodAgainstPatientRestrictions: vi.fn() }));

    const { resolveFoodCandidatesWithCanonicalShadow } = await import("@/lib/nutrition/canonical-food-shadow");
    const result = await resolveFoodCandidatesWithCanonicalShadow([{ query: "alimento inexistente xyz", key: "a" }], [], undefined, "meal_plan_ai");
    expect(result.get("a")?.status).toBe("NOT_FOUND");
  });
});
