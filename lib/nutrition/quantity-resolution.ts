import { normalize } from "@/lib/nutrition/normalize";

/**
 * Motor central de resolucao de quantidade -> gramas (FASE 3 do pedido —
 * "precisao nutricional e medidas caseiras"). Unica fonte de verdade para
 * converter `quantity` + `unit` (+ opcionalmente uma medida caseira ja
 * vinculada ao alimento) em gramas — nenhum outro modulo deve reimplementar
 * essa conversao. `quantityInGrams` (lib/nutrition/macros.ts) vira um
 * wrapper fino sobre esta funcao, preservando o contrato sincrono/numerico
 * que o resto do app (recipes.ts, ProtocolBuilder.tsx, etc.) ja usa, sem
 * duplicar a logica.
 *
 * Puro e sincrono (sem I/O), igual ao resto de lib/nutrition/: quem chama
 * e responsavel por buscar a medida caseira aplicavel (se houver) e passar
 * pronta em `householdMeasure` — isso mantem o modulo testavel sem mocks de
 * banco e reutilizavel tanto no cliente (editor) quanto no servidor (API,
 * tools de IA).
 */

export type QuantityResolutionMethod =
  | "explicit_grams"
  | "food_household_measure"
  | "generic_unit_conversion"
  | "estimated"
  | "unresolved";

export type QuantityConfidence = "high" | "medium" | "low" | "none";

export interface QuantityResolution {
  grams: number | null;
  method: QuantityResolutionMethod;
  confidence: QuantityConfidence;
  /** Origem do dado (ex.: "TBCA", "Referência de mercado comum", nome de quem cadastrou) — so quando aplicavel. */
  source?: string;
  /** Id da linha em food_portions usada, quando o metodo foi food_household_measure. */
  measureId?: string;
  /** Mensagem curta para a UI explicar por que a confianca nao e "high" — ausente quando confidence="high". */
  warning?: string;
}

/** Uma medida caseira ja resolvida (buscada no banco pelo chamador) pronta para ser aplicada por resolveQuantity. */
export interface HouseholdMeasureOption {
  id: string;
  description: string;
  gramEquivalent: number;
  source?: string | null;
  confidence: QuantityConfidence;
}

export interface ResolveQuantityInput {
  quantity?: string | number | null;
  unit?: string | null;
  /**
   * Medida caseira ESPECIFICA deste alimento, ja selecionada/vinculada
   * (ex.: item.household_measure_id resolvido pelo chamador). Quando
   * presente, tem prioridade sobre qualquer heuristica de texto da unidade
   * — e a unica forma de o metodo virar "food_household_measure".
   */
  householdMeasure?: HouseholdMeasureOption | null;
}

const GRAM_UNITS = ["g", "grama", "gramas"];
const KILOGRAM_UNITS = ["kg", "quilo", "quilos", "kilo", "kilos"];
const MILLILITER_UNITS = ["ml", "mililitro", "mililitros"];
const LITER_UNITS = ["l", "litro", "litros"];

/**
 * Conversoes genericas de unidade/porcao sem vinculo com um alimento
 * especifico — SEMPRE produzem method="estimated"/confidence="low" agora
 * (secao 4 do pedido: nunca mais apresentadas como calculo normal). Os
 * valores em si sao preservados do comportamento anterior (nao inventamos
 * novos numeros), so a confianca reportada muda.
 */
const GENERIC_UNIT_GRAMS: Record<string, number> = {
  colher: 15,
  colheres: 15,
  "colher de sopa": 15,
  xicara: 160,
  xicaras: 160,
  un: 50,
  unidade: 50,
  unidades: 50,
  fatia: 50,
  fatias: 50,
};

function parseAmount(quantity?: string | number | null): number | null {
  const amount = typeof quantity === "number"
    ? quantity
    : Number(String(quantity ?? "").replace(",", ".").match(/[\d.]+/)?.[0] ?? "");
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

export function resolveQuantity(input: ResolveQuantityInput): QuantityResolution {
  const amount = parseAmount(input.quantity);
  if (amount === null) {
    return { grams: null, method: "unresolved", confidence: "none", warning: "Quantidade ausente ou inválida." };
  }

  // 1. Medida caseira ESPECIFICA deste alimento, ja vinculada — maxima prioridade,
  //    independe do texto de `unit` (o vinculo por id e que manda).
  if (input.householdMeasure) {
    return {
      grams: amount * input.householdMeasure.gramEquivalent,
      method: "food_household_measure",
      confidence: input.householdMeasure.confidence,
      source: input.householdMeasure.source ?? undefined,
      measureId: input.householdMeasure.id,
    };
  }

  const normalizedUnit = normalize(input.unit ?? "g");

  // 2. Gramas explicitas (ou ausencia de unidade — mesmo comportamento ja
  //    existente de tratar "so um numero" como grama).
  if (!normalizedUnit || GRAM_UNITS.includes(normalizedUnit)) {
    return { grams: amount, method: "explicit_grams", confidence: "high" };
  }

  // 3. Conversao generica SEGURA — matematica pura, sem suposicao sobre a
  //    identidade/densidade do alimento.
  if (KILOGRAM_UNITS.includes(normalizedUnit)) {
    return { grams: amount * 1000, method: "generic_unit_conversion", confidence: "high" };
  }

  // Liquidos: nunca assume 1 ml = 1 g universalmente (secao 3.3 do pedido).
  // Sem uma medida caseira/densidade cadastrada especificamente para este
  // alimento (tratada no passo 1), a conversao ml/l->g e so uma estimativa.
  if (MILLILITER_UNITS.includes(normalizedUnit)) {
    return {
      grams: amount,
      method: "estimated",
      confidence: "low",
      warning: "Conversão de mililitros para gramas assume densidade aproximada de 1 ml ≈ 1 g — cadastre uma medida específica para este alimento para maior precisão.",
    };
  }
  if (LITER_UNITS.includes(normalizedUnit)) {
    return {
      grams: amount * 1000,
      method: "estimated",
      confidence: "low",
      warning: "Conversão de litros para gramas assume densidade aproximada de 1 ml ≈ 1 g — cadastre uma medida específica para este alimento para maior precisão.",
    };
  }

  // 4. Fallback generico conhecido (unidade/fatia/colher/xicara) SEM medida
  //    especifica cadastrada para este alimento — preservado como estimativa
  //    explicita, nunca mais silencioso.
  const generic = GENERIC_UNIT_GRAMS[normalizedUnit];
  if (generic !== undefined) {
    return {
      grams: amount * generic,
      method: "estimated",
      confidence: "low",
      warning: `"${(input.unit ?? "").trim()}" não tem uma medida caseira cadastrada para este alimento — usando aproximação genérica (${generic} g). Cadastre uma medida específica para maior precisão.`,
    };
  }

  // 5. Unidade desconhecida — nunca inventa gramagem.
  return {
    grams: null,
    method: "unresolved",
    confidence: "none",
    warning: `Unidade "${(input.unit ?? "").trim()}" não reconhecida — informe a quantidade em gramas ou cadastre uma medida.`,
  };
}
