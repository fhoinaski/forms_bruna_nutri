import { beforeEach, describe, expect, it, vi } from "vitest";
import { TACO_REFERENCES } from "@/lib/nutrition/taco";
import type { ExchangeGroupCandidate } from "@/lib/nutrition/food-exchange-engine";

const d1Execute = vi.hoisted(() => vi.fn());
const d1Query = vi.hoisted(() => vi.fn());
const resolveExchangeListForContext = vi.hoisted(() => vi.fn());

vi.mock("@/lib/d1/client", () => ({
  d1Execute,
  d1Query,
}));

vi.mock("@/lib/repositories/custom-foods", () => ({
  listCustomFoods: vi.fn(async () => []),
  toMacroReferenceFood: vi.fn(),
}));

vi.mock("@/lib/repositories/curated-exchange-lists", () => ({
  resolveExchangeListForContext,
}));

function taco(description: RegExp) {
  const food = TACO_REFERENCES.find((candidate) => description.test(candidate.descricao));
  if (!food) throw new Error(`fixture nao encontrada: ${description}`);
  return food;
}

function candidate(description: RegExp): ExchangeGroupCandidate {
  const food = taco(description);
  return { food, ref: { source: "TACO", sourceId: String(food.numero) } };
}

const rice = taco(/arroz, integral, cozido/i);
const potato = candidate(/batata, inglesa, cozida/i);
const cassava = candidate(/mandioca, cozida/i);

function mockCuratedList() {
  resolveExchangeListForContext.mockResolvedValue({
    list: {
      id: "exl-system-main-meal-starches",
      name: "Carboidratos - refeicao principal",
      slug: "MAIN_MEAL_STARCHES",
      version: 1,
    },
    resolution: "CONTEXT",
    candidates: [potato, cassava],
  });
}

async function generateRiceGroup(ownerAdminId = "admin-1") {
  const { generateAndSaveExchangeGroup } = await import("@/lib/repositories/exchange-groups");
  return generateAndSaveExchangeGroup({
    mealPlanId: "plan-1",
    primaryFood: rice,
    primaryRef: { source: "TACO", sourceId: String(rice.numero) },
    primaryGrams: 120,
    mealName: "Almoco",
    mealContext: "LUNCH",
    ownerAdminId,
    limit: 5,
  });
}

describe("curated exchange pilot runtime", () => {
  beforeEach(() => {
    vi.resetModules();
    d1Execute.mockReset();
    d1Query.mockReset();
    d1Query.mockImplementation(async (sql: string) => {
      if (sql.includes("PRAGMA table_info(exchange_groups)")) {
        return [
          { name: "exchange_list_id" },
          { name: "exchange_list_version" },
          { name: "exchange_generation_mode" },
        ];
      }
      if (sql.includes("PRAGMA table_info(exchange_group_alternatives)")) {
        return [{ name: "candidate_origin" }];
      }
      return [];
    });
    resolveExchangeListForContext.mockReset();
    delete process.env.CURATED_EXCHANGE_LISTS_MODE;
    delete process.env.CURATED_EXCHANGE_PILOT_ADMIN_IDS;
    delete process.env.CURATED_EXCHANGE_RANKING_STRATEGY;
    mockCuratedList();
  });

  it("OFF usa e persiste ENGINE_ONLY", async () => {
    process.env.CURATED_EXCHANGE_LISTS_MODE = "OFF";

    const result = await generateRiceGroup();

    expect(result.strategyRequested).toBe("ENGINE_ONLY");
    expect(result.strategyUsed).toBe("ENGINE_ONLY");
    expect(result.generationMode).toBe("ENGINE_ONLY");
    expect(result.exchangeList).toBeNull();
    expect(result.fallbackReason).toBe("MODE_OFF");
    expect(resolveExchangeListForContext).not.toHaveBeenCalled();
  });

  it("SHADOW calcula comparacao interna, mas persiste/displaya ENGINE_ONLY", async () => {
    process.env.CURATED_EXCHANGE_LISTS_MODE = "SHADOW";
    process.env.CURATED_EXCHANGE_RANKING_STRATEGY = "global_quality";

    const result = await generateRiceGroup();

    expect(result.strategyRequested).toBe("CURATED_ELIGIBILITY_GLOBAL_RANK");
    expect(result.strategyUsed).toBe("ENGINE_ONLY");
    expect(result.generationMode).toBe("SHADOW_ENGINE_ONLY");
    expect(result.exchangeList).toBeNull();
    expect(result.fallbackReason).toBe("MODE_SHADOW");
    expect(result.shadowComparison?.globalRankTop).toBeGreaterThan(0);
  });

  it("PILOT sem admin na allowlist cai para SHADOW/ENGINE_ONLY", async () => {
    process.env.CURATED_EXCHANGE_LISTS_MODE = "PILOT";
    process.env.CURATED_EXCHANGE_PILOT_ADMIN_IDS = "admin-allowed";

    const result = await generateRiceGroup("admin-blocked");

    expect(result.strategyUsed).toBe("ENGINE_ONLY");
    expect(result.generationMode).toBe("SHADOW_ENGINE_ONLY");
    expect(result.fallbackReason).toBe("PILOT_ADMIN_NOT_ALLOWED");
  });

  it("PILOT allowlisted usa ranking global curado e persiste a lista", async () => {
    process.env.CURATED_EXCHANGE_LISTS_MODE = "PILOT";
    process.env.CURATED_EXCHANGE_PILOT_ADMIN_IDS = "admin-1";

    const result = await generateRiceGroup("admin-1");

    expect(result.strategyRequested).toBe("CURATED_ELIGIBILITY_GLOBAL_RANK");
    expect(result.strategyUsed).toBe("CURATED_ELIGIBILITY_GLOBAL_RANK");
    expect(result.generationMode).toBe("HYBRID_GLOBAL_RANK");
    expect(result.exchangeList?.slug).toBe("MAIN_MEAL_STARCHES");
    expect(result.fallbackReason).toBeNull();
    expect(result.alternatives.some((alt) => alt.candidate_origin !== "AUTOMATIC_ENGINE")).toBe(true);
  });

  it("PILOT fallbacka para ENGINE_ONLY quando nao ha lista curada", async () => {
    process.env.CURATED_EXCHANGE_LISTS_MODE = "PILOT";
    process.env.CURATED_EXCHANGE_PILOT_ADMIN_IDS = "admin-1";
    resolveExchangeListForContext.mockResolvedValue(null);

    const result = await generateRiceGroup("admin-1");

    expect(result.strategyRequested).toBe("CURATED_ELIGIBILITY_GLOBAL_RANK");
    expect(result.strategyUsed).toBe("ENGINE_ONLY");
    expect(result.generationMode).toBe("ENGINE_ONLY");
    expect(result.exchangeList).toBeNull();
    expect(result.fallbackReason).toBe("NO_CURATED_LIST");
  });

  it("schema legado sem migration curada nao quebra a geracao e persiste ENGINE_ONLY", async () => {
    process.env.CURATED_EXCHANGE_LISTS_MODE = "PILOT";
    process.env.CURATED_EXCHANGE_PILOT_ADMIN_IDS = "admin-1";
    d1Query.mockResolvedValue([]);

    const result = await generateRiceGroup("admin-1");

    expect(result.strategyRequested).toBe("CURATED_ELIGIBILITY_GLOBAL_RANK");
    expect(result.strategyUsed).toBe("ENGINE_ONLY");
    expect(result.generationMode).toBe("ENGINE_ONLY");
    expect(result.fallbackReason).toBe("NO_CURATED_LIST");
    expect(String(d1Execute.mock.calls[0]?.[0])).not.toContain("exchange_list_id");
    expect(String(d1Execute.mock.calls[1]?.[0])).not.toContain("candidate_origin");
  });
});
