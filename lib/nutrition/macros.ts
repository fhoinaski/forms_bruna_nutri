export interface MacroTotals {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  recognizedItems: number;
  totalItems: number;
}

export interface MacroReferenceFood {
  numero?: number | string;
  descricao: string;
  grupo?: string;
  fonte?: "taco" | "complementar" | "custom" | "manufacturer";
  energia_kcal: number;
  proteina_g: number;
  carboidrato_g: number;
  lipidios_g: number;
  // Nutrientes adicionais do motor da FASE 2 (lib/nutrition/nutrients.ts).
  // Opcionais e `null` quando a fonte nao tem o dado — nunca 0 por omissao,
  // para nao confundir "zero de verdade" com "sem dado" (diferente dos 4
  // macros acima, cuja semantica de coercao para 0 em "NA"/"Tr" ja sustenta
  // todo o app hoje e nao e alterada aqui).
  fibra_g?: number | null;
  sodio_mg?: number | null;
  calcio_mg?: number | null;
  ferro_mg?: number | null;
  potassio_mg?: number | null;
  vitamina_c_mg?: number | null;
}

const EMPTY: MacroTotals = { kcal: 0, protein: 0, carbs: 0, fat: 0, recognizedItems: 0, totalItems: 0 };

export function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

export function quantityInGrams(quantity?: string | number | null, unit?: string | null) {
  const amount = typeof quantity === "number" ? quantity : Number(String(quantity ?? "").replace(",", ".").match(/[\d.]+/)?.[0] ?? 0);
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  const normalizedUnit = normalize(unit ?? "g");
  if (["kg", "quilo", "quilos"].includes(normalizedUnit)) return amount * 1000;
  if (["ml", "mililitro", "mililitros", "g", "grama", "gramas"].includes(normalizedUnit)) return amount;
  // Conversoes de unidade, colher e xicara sao aproximacoes praticas para estimativa rapida no editor.
  if (["colher", "colheres", "colher de sopa"].includes(normalizedUnit)) return amount * 15;
  if (["xicara", "xicaras"].includes(normalizedUnit)) return amount * 160;
  if (["un", "unidade", "unidades", "fatia", "fatias"].includes(normalizedUnit)) return amount * 50;
  return amount;
}

export function findBestFoodReference(food: string, references: MacroReferenceFood[]): MacroReferenceFood | null {
  const normalizedFood = normalize(food);
  if (!normalizedFood) return null;
  const scored = references
    .map((reference) => {
      const normalizedDescription = normalize(reference.descricao);
      const exact = normalizedDescription === normalizedFood;
      const contains = normalizedDescription.includes(normalizedFood) || normalizedFood.includes(normalizedDescription);
      if (!exact && !contains) return null;
      return {
        reference,
        score: exact ? 0 : 1,
        distance: Math.abs(normalizedDescription.length - normalizedFood.length),
        length: normalizedDescription.length,
      };
    })
    .filter((item): item is { reference: MacroReferenceFood; score: number; distance: number; length: number } => item !== null)
    .sort((a, b) => a.score - b.score || a.distance - b.distance || a.length - b.length);
  return scored[0]?.reference ?? null;
}

export function estimateFoodMacros(
  food: string,
  quantity?: string | number | null,
  unit?: string | null,
  references: MacroReferenceFood[] = []
): MacroTotals {
  if (!food.trim()) return EMPTY;
  const reference = findBestFoodReference(food, references);
  if (!reference) return { ...EMPTY, totalItems: 1 };
  const grams = quantityInGrams(quantity, unit);
  if (!grams) return { ...EMPTY, recognizedItems: 1, totalItems: 1 };
  const factor = grams / 100;
  return {
    kcal: reference.energia_kcal * factor,
    protein: reference.proteina_g * factor,
    carbs: reference.carboidrato_g * factor,
    fat: reference.lipidios_g * factor,
    recognizedItems: 1,
    totalItems: 1,
  };
}

export function sumMacros(values: MacroTotals[]): MacroTotals {
  return values.reduce((total, item) => ({
    kcal: total.kcal + item.kcal,
    protein: total.protein + item.protein,
    carbs: total.carbs + item.carbs,
    fat: total.fat + item.fat,
    recognizedItems: total.recognizedItems + item.recognizedItems,
    totalItems: total.totalItems + item.totalItems,
  }), { ...EMPTY });
}

export function estimateMacrosFromLine(line: string, references: MacroReferenceFood[] | number = []): MacroTotals {
  const [food = "", detail = ""] = line.split(/\s+-\s+/, 2);
  const match = detail.match(/([\d.,]+)\s*([\p{L}]+)/u);
  return estimateFoodMacros(food, match?.[1], match?.[2], Array.isArray(references) ? references : []);
}

export function roundedMacros(value: MacroTotals): MacroTotals {
  return {
    ...value,
    kcal: Math.round(value.kcal),
    protein: Math.round(value.protein * 10) / 10,
    carbs: Math.round(value.carbs * 10) / 10,
    fat: Math.round(value.fat * 10) / 10,
  };
}
