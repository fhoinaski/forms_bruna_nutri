export interface MacroTotals {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  recognizedItems: number;
  totalItems: number;
}

type FoodReference = Omit<MacroTotals, "recognizedItems" | "totalItems">;

const FOOD_REFERENCE: Array<[string[], FoodReference]> = [
  [["arroz"], { kcal: 128, protein: 2.5, carbs: 28.1, fat: 0.2 }],
  [["feijao", "feijão"], { kcal: 76, protein: 4.8, carbs: 13.6, fat: 0.5 }],
  [["frango", "peito de frango"], { kcal: 159, protein: 32, carbs: 0, fat: 2.5 }],
  [["carne bovina", "patinho", "carne moida", "carne moída"], { kcal: 219, protein: 35.9, carbs: 0, fat: 7.3 }],
  [["peixe", "tilapia", "tilápia"], { kcal: 128, protein: 26.2, carbs: 0, fat: 2.7 }],
  [["ovo"], { kcal: 143, protein: 13, carbs: 0.7, fat: 9.5 }],
  [["leite"], { kcal: 61, protein: 3.2, carbs: 4.8, fat: 3.3 }],
  [["iogurte"], { kcal: 63, protein: 3.5, carbs: 7, fat: 2.6 }],
  [["queijo"], { kcal: 280, protein: 20, carbs: 3, fat: 21 }],
  [["aveia"], { kcal: 394, protein: 13.9, carbs: 66.6, fat: 8.5 }],
  [["pao", "pão"], { kcal: 253, protein: 9.4, carbs: 49.9, fat: 3.7 }],
  [["macarrao", "macarrão"], { kcal: 157, protein: 5.8, carbs: 30.9, fat: 0.9 }],
  [["batata doce", "batata-doce"], { kcal: 77, protein: 0.6, carbs: 18.4, fat: 0.1 }],
  [["batata"], { kcal: 52, protein: 1.2, carbs: 11.9, fat: 0.1 }],
  [["banana"], { kcal: 98, protein: 1.3, carbs: 26, fat: 0.1 }],
  [["maca", "maçã"], { kcal: 56, protein: 0.3, carbs: 15.2, fat: 0 }],
  [["mamao", "mamão"], { kcal: 40, protein: 0.5, carbs: 10.4, fat: 0.1 }],
  [["abacate"], { kcal: 96, protein: 1.2, carbs: 6, fat: 8.4 }],
  [["azeite"], { kcal: 884, protein: 0, carbs: 0, fat: 100 }],
  [["castanha", "amendoim"], { kcal: 570, protein: 20, carbs: 20, fat: 48 }],
  [["whey"], { kcal: 400, protein: 80, carbs: 8, fat: 6 }],
  [["tofu"], { kcal: 76, protein: 8.1, carbs: 1.9, fat: 4.8 }],
];

const EMPTY: MacroTotals = { kcal: 0, protein: 0, carbs: 0, fat: 0, recognizedItems: 0, totalItems: 0 };

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function quantityInGrams(quantity?: string | number | null, unit?: string | null) {
  const amount = typeof quantity === "number" ? quantity : Number(String(quantity ?? "").replace(",", ".").match(/[\d.]+/)?.[0] ?? 0);
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  const normalizedUnit = normalize(unit ?? "g");
  if (["kg", "quilo", "quilos"].includes(normalizedUnit)) return amount * 1000;
  if (["ml", "mililitro", "mililitros", "g", "grama", "gramas"].includes(normalizedUnit)) return amount;
  if (["colher", "colheres", "colher de sopa"].includes(normalizedUnit)) return amount * 15;
  if (["xicara", "xícara", "xicaras", "xícaras"].map(normalize).includes(normalizedUnit)) return amount * 160;
  if (["un", "unidade", "unidades", "fatia", "fatias"].includes(normalizedUnit)) return amount * 50;
  return amount;
}

export function estimateFoodMacros(food: string, quantity?: string | number | null, unit?: string | null): MacroTotals {
  if (!food.trim()) return EMPTY;
  const normalizedFood = normalize(food);
  const reference = FOOD_REFERENCE.find(([aliases]) => aliases.some((alias) => normalizedFood.includes(normalize(alias))))?.[1];
  if (!reference) return { ...EMPTY, totalItems: 1 };
  const grams = quantityInGrams(quantity, unit);
  if (!grams) return { ...EMPTY, recognizedItems: 1, totalItems: 1 };
  const factor = grams / 100;
  return {
    kcal: reference.kcal * factor,
    protein: reference.protein * factor,
    carbs: reference.carbs * factor,
    fat: reference.fat * factor,
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

export function estimateMacrosFromLine(line: string): MacroTotals {
  const [food = "", detail = ""] = line.split(/\s+-\s+/, 2);
  const match = detail.match(/([\d.,]+)\s*([\p{L}]+)/u);
  return estimateFoodMacros(food, match?.[1], match?.[2]);
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
