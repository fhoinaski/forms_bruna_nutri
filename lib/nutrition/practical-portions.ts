import { normalize } from "@/lib/nutrition/normalize";

/**
 * Medidas praticas usadas somente quando a fonte nutricional nao oferece uma
 * medida caseira oficial. Elas tornam a prescricao utilizavel sem mascarar a
 * origem: quem consome estes dados sempre recebe `estimated: true`.
 */
export type PracticalFoodPortion = {
  key: string;
  label: string;
  unit: string;
  gramWeight: number;
  estimated: true;
};

function portion(key: string, label: string, unit: string, gramWeight: number): PracticalFoodPortion {
  return { key, label: `${label} (${gramWeight} g) · estimada`, unit, gramWeight, estimated: true };
}

export function practicalPortionsForFood(foodName: string): PracticalFoodPortion[] {
  const name = normalize(foodName);

  if (/\bovo\b/.test(name)) {
    return [portion("egg-medium", "unidade média", "unidade", 50)];
  }
  if (/pao de sal|pao frances|paozinho/.test(name)) {
    return [portion("bread-roll", "unidade", "unidade", 50)];
  }
  if (/pao de queijo/.test(name)) {
    return [portion("cheese-bread", "unidade", "unidade", 30)];
  }
  if (/pao/.test(name)) {
    return [portion("bread-slice", "fatia", "fatia", 25)];
  }
  if (/banana/.test(name)) {
    return [portion("banana-medium", "unidade média", "unidade", 80)];
  }
  if (/maca/.test(name)) {
    return [portion("apple-medium", "unidade média", "unidade", 130)];
  }
  if (/laranja/.test(name)) {
    return [portion("orange-medium", "unidade média", "unidade", 130)];
  }

  return [];
}
