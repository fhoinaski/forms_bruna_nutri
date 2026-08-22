import type { MacroReferenceFood } from "@/lib/nutrition/macros";
import { classifyFoodRole, type FoodRole } from "@/lib/nutrition/substitution-engine";

/**
 * FASE 7 (itens 2/3) — hierarquia funcional de grupos alimentares, base do
 * "primeiro filtro" das trocas (item 4: "o grupo alimentar é o primeiro
 * filtro, nunca buscar candidatos globalmente só por kcal"). Reaproveita
 * `classifyFoodRole` (lib/nutrition/substitution-engine.ts, já testado, já
 * usado pelo Substitution Engine existente) como sinal SECUNDÁRIO — nunca
 * reimplementa a classificação por composição de macro, só adiciona a
 * camada de CATEGORIA (que `classifyFoodRole` não tem: ele só sabe
 * "carbohydrate/protein/fat/mixed" por % de kcal, não distingue tubérculo
 * de grão, nem peixe de carne vermelha).
 *
 * Heurística determinística baseada em texto (grupo TACO/classification_group
 * TBCA/nome do alimento) — nunca uma chamada de IA. Nenhum alimento é
 * "inventado": todo alimento do catálogo real cai em pelo menos
 * foodGroup=OTHER se nada mais bater, nunca lança erro.
 */

export type FoodGroup = "CARBOHYDRATE" | "PROTEIN" | "DAIRY" | "FRUIT" | "VEGETABLE" | "FAT" | "MIXED_DISH" | "OTHER";

export type FoodSubgroup =
  | "GRAIN" | "TUBER_ROOT" | "PASTA" | "OTHER_STARCH"
  | "FISH" | "POULTRY" | "RED_MEAT" | "EGG" | "LEGUME" | "SOY" | "OTHER_PROTEIN"
  | "MILK" | "YOGURT" | "CHEESE"
  | "OIL" | "NUT_SEED"
  | "GENERIC_FRUIT" | "GENERIC_VEGETABLE" | "OTHER_SUBGROUP";

export type NutritionalRole =
  | "STARCH_SOURCE" | "LEAN_PROTEIN" | "FATTY_PROTEIN" | "PLANT_PROTEIN"
  | "FRUIT_SOURCE" | "VEGETABLE_SOURCE" | "DAIRY_SOURCE" | "FAT_SOURCE" | "MIXED_ROLE";

export interface FoodClassification {
  foodGroup: FoodGroup;
  foodSubgroup: FoodSubgroup;
  nutritionalRole: NutritionalRole;
  /** Papel técnico de composição de macro (classifyFoodRole) — preservado pra quem já usa o Substitution Engine existente. */
  macroRole: FoodRole;
}

interface Rule {
  foodGroup: FoodGroup;
  foodSubgroup: FoodSubgroup;
  nutritionalRole: NutritionalRole;
  /** Testado contra grupo (TACO `grupo` / TBCA classification_group) normalizado. */
  groupKeywords?: string[];
  /** Testado contra o NOME do alimento normalizado — só usado quando groupKeywords não bateu, pra desambiguar dentro de um grupo amplo (ex.: "Carnes e derivados" tem peixe E carne vermelha). */
  nameKeywords?: string[];
}

function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

// Ordem importa: regras mais especificas primeiro (ex.: "peixe" antes de
// "carnes e derivados" generico), pra nao deixar um peixe cair em RED_MEAT
// so porque o grupo TACO/TBCA amplo os agrupa junto de carnes vermelhas.
const RULES: Rule[] = [
  // --- PROTEIN ---
  { foodGroup: "PROTEIN", foodSubgroup: "FISH", nutritionalRole: "LEAN_PROTEIN", groupKeywords: ["pescados", "frutos do mar"], nameKeywords: ["peixe", "tilapia", "merluza", "salmao", "sardinha", "atum", "bacalhau", "camarao", "lula", "polvo", "corvina", "pescada", "namorado", "linguado"] },
  // EGG antes de POULTRY: "ovo de galinha" contém tanto "ovo" quanto
  // "galinha" — sem essa ordem, cairia em POULTRY (carne), nunca em OVO.
  { foodGroup: "PROTEIN", foodSubgroup: "EGG", nutritionalRole: "LEAN_PROTEIN", groupKeywords: ["ovos e derivados"], nameKeywords: ["ovo", "clara", "gema"] },
  // "ave" sozinho removido: e substring de "aveia" (aveia em flocos batia
  // como POULTRY por causa disso, achado em dado real de template) — sem
  // suporte a fronteira de palavra no matching por .includes(), qualquer
  // keyword curta e generica assim e perigosa.
  { foodGroup: "PROTEIN", foodSubgroup: "POULTRY", nutritionalRole: "LEAN_PROTEIN", nameKeywords: ["frango", "galinha", "peru"] },
  { foodGroup: "PROTEIN", foodSubgroup: "RED_MEAT", nutritionalRole: "FATTY_PROTEIN", groupKeywords: ["carnes e derivados"], nameKeywords: ["boi", "bovina", "bovino", "carne", "patinho", "alcatra", "picanha", "musculo", "acem", "suina", "suino", "porco", "cordeiro", "linguica", "presunto", "bacon", "salsicha", "peito de peru", "mortadela"] },
  { foodGroup: "PROTEIN", foodSubgroup: "SOY", nutritionalRole: "PLANT_PROTEIN", nameKeywords: ["soja", "tofu", "proteina de soja", "pts"] },
  { foodGroup: "PROTEIN", foodSubgroup: "LEGUME", nutritionalRole: "PLANT_PROTEIN", groupKeywords: ["leguminosas e derivados"], nameKeywords: ["feijao", "lentilha", "grao de bico", "ervilha seca"] },
  // --- DAIRY ---
  { foodGroup: "DAIRY", foodSubgroup: "YOGURT", nutritionalRole: "DAIRY_SOURCE", nameKeywords: ["iogurte"] },
  { foodGroup: "DAIRY", foodSubgroup: "CHEESE", nutritionalRole: "DAIRY_SOURCE", nameKeywords: ["queijo", "requeijao", "ricota", "mussarela", "muçarela"] },
  { foodGroup: "DAIRY", foodSubgroup: "MILK", nutritionalRole: "DAIRY_SOURCE", groupKeywords: ["leite e derivados"], nameKeywords: ["leite", "coalhada"] },
  // --- CARBOHYDRATE ---
  { foodGroup: "CARBOHYDRATE", foodSubgroup: "TUBER_ROOT", nutritionalRole: "STARCH_SOURCE", nameKeywords: ["batata doce", "batata inglesa", "batata,", "mandioca", "aipim", "inhame", "cara,", "mandioquinha"] },
  { foodGroup: "CARBOHYDRATE", foodSubgroup: "PASTA", nutritionalRole: "STARCH_SOURCE", nameKeywords: ["macarrao", "massa", "espaguete", "talharim", "lasanha", "nhoque"] },
  { foodGroup: "CARBOHYDRATE", foodSubgroup: "GRAIN", nutritionalRole: "STARCH_SOURCE", groupKeywords: ["cereais e derivados"], nameKeywords: ["arroz", "aveia", "milho", "quinoa", "cuscuz", "pao", "tapioca", "farinha", "granola", "trigo", "centeio", "cevada"] },
  { foodGroup: "CARBOHYDRATE", foodSubgroup: "OTHER_STARCH", nutritionalRole: "STARCH_SOURCE", nameKeywords: ["farofa", "polvilho"] },
  // --- FRUIT ---
  // nameKeywords adicionado nesta fase: sem isso, um nome de item de
  // template sem correspondência exata no catálogo (ex.: "Banana prata",
  // sem o "," que a TACO usa: "Banana, prata, crua") caía inteiro em
  // OTHER/MIXED_ROLE por falta de groupKeywords (achado real ao migrar os
  // templates existentes pro modelo de slots).
  { foodGroup: "FRUIT", foodSubgroup: "GENERIC_FRUIT", nutritionalRole: "FRUIT_SOURCE", groupKeywords: ["frutas e derivados"], nameKeywords: ["banana", "maca", "maçã", "morango", "laranja", "mamao", "manga", "abacaxi", "uva", "melancia", "melao", "pera", "kiwi", "ameixa", "goiaba", "caju", "acerola", "limao", "tangerina", "mexerica", "framboesa", "amora", "figo", "abacate"] },
  // --- VEGETABLE ---
  { foodGroup: "VEGETABLE", foodSubgroup: "GENERIC_VEGETABLE", nutritionalRole: "VEGETABLE_SOURCE", groupKeywords: ["vegetais e derivados", "verduras", "hortalicas"], nameKeywords: ["couve", "abobrinha", "abobora", "aspargo", "tomate", "cenoura", "alface", "rucula", "espinafre", "pepino", "pimentao", "berinjela", "chuchu", "beterraba", "repolho", "brocolis", "couve-flor", "couveflor", "vagem", "quiabo", "salada", "folhas verdes"] },
  // --- FAT ---
  { foodGroup: "FAT", foodSubgroup: "OIL", nutritionalRole: "FAT_SOURCE", groupKeywords: ["oleos e gorduras"], nameKeywords: ["oleo", "azeite", "manteiga", "margarina", "banha"] },
  { foodGroup: "FAT", foodSubgroup: "NUT_SEED", nutritionalRole: "FAT_SOURCE", nameKeywords: ["castanha", "amendoim", "noz", "amendoa", "semente", "chia", "linhaca", "girassol", "abobora,semente"] },
  // --- MIXED_DISH ---
  { foodGroup: "MIXED_DISH", foodSubgroup: "OTHER_SUBGROUP", nutritionalRole: "MIXED_ROLE", groupKeywords: ["preparacao", "prato composto", "alimentos industrializados"] },
];

/**
 * item 2/3 — classifica um alimento na hierarquia funcional. Recebe o
 * `MacroReferenceFood` (já usado em todo o app) mais os campos de grupo
 * crus (TACO `grupo` ou TBCA `classification_group`/`classification_food_type`),
 * quando disponíveis — nunca obrigatório, cai pro nome + composição de
 * macro quando ausente.
 */
export function classifyFoodExchangeGroup(
  food: Pick<MacroReferenceFood, "descricao" | "grupo" | "proteina_g" | "carboidrato_g" | "lipidios_g">,
  rawGroupText?: string | null
): FoodClassification {
  const macroRole = classifyFoodRole(food as MacroReferenceFood);
  const groupText = normalize([food.grupo, rawGroupText].filter(Boolean).join(" "));
  const nameText = normalize(food.descricao);

  // Uma única passada, na ordem de RULES (regra mais específica primeiro),
  // checando nome E grupo por regra — nunca duas passadas separadas
  // (groupKeywords de TODAS as regras primeiro, nameKeywords depois), que
  // inverteria a especificidade pretendida: um `grupo` TACO amplo como
  // "Carnes e derivados" (boi E frango juntos) ou "Verduras, hortaliças e
  // derivados" (onde a TACO classifica batata inglesa) bateria antes do
  // nome específico ("frango", "batata,") só por vir de uma regra anterior
  // no array, mesmo com REGRAS mais específicas depois — errado tanto pra
  // frango (cairia em RED_MEAT) quanto pra batata (cairia em VEGETABLE).
  for (const rule of RULES) {
    const matches = rule.nameKeywords?.some((kw) => nameText.includes(kw)) || rule.groupKeywords?.some((kw) => groupText.includes(kw));
    if (matches) {
      return { foodGroup: rule.foodGroup, foodSubgroup: rule.foodSubgroup, nutritionalRole: rule.nutritionalRole, macroRole };
    }
  }

  // Nenhuma regra de categoria bateu — cai pro papel de macro-composicao
  // (sempre disponivel, nunca falha) como ultimo recurso, nunca lanca erro.
  const fallbackByMacro: Record<FoodRole, FoodClassification> = {
    carbohydrate: { foodGroup: "CARBOHYDRATE", foodSubgroup: "OTHER_STARCH", nutritionalRole: "STARCH_SOURCE", macroRole },
    protein: { foodGroup: "PROTEIN", foodSubgroup: "OTHER_PROTEIN", nutritionalRole: "LEAN_PROTEIN", macroRole },
    fat: { foodGroup: "FAT", foodSubgroup: "OTHER_SUBGROUP", nutritionalRole: "FAT_SOURCE", macroRole },
    mixed: { foodGroup: "OTHER", foodSubgroup: "OTHER_SUBGROUP", nutritionalRole: "MIXED_ROLE", macroRole },
  };
  return fallbackByMacro[macroRole];
}

/**
 * item 18 — regra explícita de cross-group. Por padrão só permite troca
 * dentro do MESMO subgrupo; `allowCrossGroup=true` permite o mesmo GRUPO
 * (nunca grupos diferentes automaticamente, mesmo com essa flag — ex.:
 * tilápia→frango precisa ser habilitado explicitamente pela nutricionista,
 * mas nunca abre pra "qualquer proteína vs qualquer carboidrato").
 */
export function isCompatibleForExchange(
  primary: FoodClassification,
  candidate: FoodClassification,
  allowCrossGroup: boolean
): { compatible: boolean; sameSubgroup: boolean; sameGroup: boolean } {
  const sameSubgroup = primary.foodSubgroup === candidate.foodSubgroup;
  const sameGroup = primary.foodGroup === candidate.foodGroup;
  const compatible = sameSubgroup || (allowCrossGroup && sameGroup);
  return { compatible, sameSubgroup, sameGroup };
}
