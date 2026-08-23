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

/** FASE 8.5 (item 5) — rótulo em pt-BR pra exibir o papel do slot na UI (MealPlanEditor). */
export const FOOD_GROUP_LABELS: Record<FoodGroup, string> = {
  CARBOHYDRATE: "Carboidrato",
  PROTEIN: "Proteína",
  DAIRY: "Laticínio",
  FRUIT: "Fruta",
  VEGETABLE: "Vegetal",
  FAT: "Gordura",
  MIXED_DISH: "Prato misto",
  OTHER: "Outro",
};

export type FoodSubgroup =
  | "GRAIN" | "TUBER_ROOT" | "PASTA" | "OTHER_STARCH"
  | "FISH" | "POULTRY" | "RED_MEAT" | "EGG" | "LEGUME" | "SOY" | "OTHER_PROTEIN"
  | "MILK" | "YOGURT" | "CHEESE"
  | "OIL" | "NUT_SEED"
  | "GENERIC_FRUIT" | "GENERIC_VEGETABLE" | "OTHER_SUBGROUP";

export type NutritionalRole =
  | "STARCH_SOURCE" | "LEAN_PROTEIN" | "FATTY_PROTEIN" | "PLANT_PROTEIN"
  | "FRUIT_SOURCE" | "VEGETABLE_SOURCE" | "DAIRY_SOURCE" | "FAT_SOURCE" | "MIXED_ROLE";

export type MealContext = "BREAKFAST" | "MORNING_SNACK" | "LUNCH" | "AFTERNOON_SNACK" | "DINNER" | "SUPPER" | "GENERIC";

export type CulinaryRole =
  | "STARCH_MAIN" | "BREAD_BASE" | "BREAKFAST_CARB" | "FRUIT_PORTION"
  | "LEAN_PROTEIN_MAIN" | "LEGUME_SIDE" | "VEGETABLE_SIDE" | "DAIRY_SNACK"
  | "FAT_ADDITION" | "GENERIC_CULINARY";

export type FoodForm =
  | "RICE" | "BREAD" | "TUBER" | "PASTA" | "COUSCOUS" | "OAT" | "TAPIOCA"
  | "QUINOA" | "CORN" | "RAW_STARCH" | "FLOUR" | "INFANT_CEREAL" | "CEREAL" | "COOKIE" | "CAKE" | "DESSERT" | "SNACK" | "JUICE" | "PRESERVED_FRUIT" | "FRUIT"
  | "POULTRY" | "FISH" | "RED_MEAT" | "EGG" | "CHEESE" | "MILK" | "YOGURT"
  | "VEGETABLE" | "LEGUME" | "OIL" | "NUT_SEED" | "OTHER_FORM";

export interface FoodClassification {
  foodGroup: FoodGroup;
  foodSubgroup: FoodSubgroup;
  nutritionalRole: NutritionalRole;
  culinaryRole: CulinaryRole;
  foodForm: FoodForm;
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

function hasAny(text: string, keywords: string[]): boolean {
  return keywords.some((kw) => text.includes(kw));
}

export function normalizeMealContext(mealName?: string | null): MealContext {
  const text = normalize(mealName ?? "");
  if (!text.trim()) return "GENERIC";
  if (hasAny(text, ["cafe da manha", "desjejum"])) return "BREAKFAST";
  if (hasAny(text, ["colacao", "lanche da manha", "manha"])) return "MORNING_SNACK";
  if (hasAny(text, ["almoco", "almoço"])) return "LUNCH";
  if (hasAny(text, ["lanche da tarde", "tarde"])) return "AFTERNOON_SNACK";
  if (hasAny(text, ["jantar"])) return "DINNER";
  if (hasAny(text, ["ceia", "sup ceia"])) return "SUPPER";
  if (hasAny(text, ["lanche"])) return "AFTERNOON_SNACK";
  return "GENERIC";
}

function classifyFoodForm(nameText: string, foodSubgroup: FoodSubgroup, foodGroup: FoodGroup): FoodForm {
  if (hasAny(nameText, ["cereal infantil", "mingau", "mistura para vitamina"])) return "INFANT_CEREAL";
  if (hasAny(nameText, ["suco", "nectar", "néctar"])) return "JUICE";
  if (hasAny(nameText, ["calda", "enlatada", "em conserva"])) return "PRESERVED_FRUIT";
  if (hasAny(nameText, ["biscoito", "bolacha"])) return "COOKIE";
  if (hasAny(nameText, ["bolo"])) return "CAKE";
  if (hasAny(nameText, ["curau", "pamonha", "geleia", "doce", "sobremesa", "sorvete"])) return "DESSERT";
  if (hasAny(nameText, ["pipoca", "salgadinho"])) return "SNACK";
  if (hasAny(nameText, ["farinha", "fuba", "polvilho", "farofa"])) return "FLOUR";
  if ((hasAny(nameText, ["arroz", "macarrao", "massa", "espaguete", "talharim", "batata", "mandioca", "inhame", "cara", "milho"]) && hasAny(nameText, ["cru", "crua"]))) return "RAW_STARCH";
  if (hasAny(nameText, ["pao", "torrada"])) return "BREAD";
  if (hasAny(nameText, ["tapioca"])) return "TAPIOCA";
  if (hasAny(nameText, ["cuscuz"])) return "COUSCOUS";
  if (hasAny(nameText, ["quinoa"])) return "QUINOA";
  if (hasAny(nameText, ["milho verde"])) return "CORN";
  if (hasAny(nameText, ["aveia"])) return "OAT";
  if (hasAny(nameText, ["arroz"])) return "RICE";
  if (foodSubgroup === "TUBER_ROOT") return "TUBER";
  if (foodSubgroup === "PASTA") return "PASTA";
  if (foodGroup === "FRUIT") return "FRUIT";
  if (foodSubgroup === "POULTRY") return "POULTRY";
  if (foodSubgroup === "FISH") return "FISH";
  if (foodSubgroup === "RED_MEAT") return "RED_MEAT";
  if (foodSubgroup === "EGG") return "EGG";
  if (foodSubgroup === "CHEESE") return "CHEESE";
  if (foodSubgroup === "MILK") return "MILK";
  if (foodSubgroup === "YOGURT") return "YOGURT";
  if (foodSubgroup === "LEGUME" || foodSubgroup === "SOY") return "LEGUME";
  if (foodGroup === "VEGETABLE") return "VEGETABLE";
  if (foodSubgroup === "OIL") return "OIL";
  if (foodSubgroup === "NUT_SEED") return "NUT_SEED";
  if (foodSubgroup === "GRAIN") return "CEREAL";
  return "OTHER_FORM";
}

export function classifyCulinaryRole(classification: Pick<FoodClassification, "foodGroup" | "foodSubgroup" | "nutritionalRole" | "foodForm">, mealContext: MealContext = "GENERIC"): CulinaryRole {
  if (classification.foodGroup === "FRUIT") return "FRUIT_PORTION";
  if (classification.foodGroup === "VEGETABLE") return "VEGETABLE_SIDE";
  if (classification.foodGroup === "FAT") return "FAT_ADDITION";
  if (classification.foodGroup === "DAIRY") return "DAIRY_SNACK";
  if (classification.foodSubgroup === "LEGUME" || classification.foodSubgroup === "SOY") return "LEGUME_SIDE";
  if (classification.foodGroup === "PROTEIN") return "LEAN_PROTEIN_MAIN";
  if (classification.foodGroup === "CARBOHYDRATE") {
    if (mealContext === "LUNCH" || mealContext === "DINNER") return "STARCH_MAIN";
    if (classification.foodForm === "BREAD") return "BREAD_BASE";
    if (mealContext === "BREAKFAST" || mealContext === "MORNING_SNACK" || mealContext === "AFTERNOON_SNACK" || mealContext === "SUPPER") return "BREAKFAST_CARB";
    if (classification.foodForm === "RICE" || classification.foodForm === "TUBER" || classification.foodForm === "PASTA") return "STARCH_MAIN";
    return "BREAKFAST_CARB";
  }
  return "GENERIC_CULINARY";
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
  { foodGroup: "OTHER", foodSubgroup: "OTHER_SUBGROUP", nutritionalRole: "MIXED_ROLE", nameKeywords: ["mel puro", "acucar", "açucar", "açúcar", "melado"] },
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
 * CORREÇÃO P0 — bug real de "candidato absurdo" encontrado ao auditar
 * grupos de troca reais: "Pão, de queijo, assado" classificava como
 * PROTEIN/CHEESE (a keyword "queijo" bate em qualquer nome que a contenha,
 * em qualquer posição), então virava "candidato de queijo" pra substituir
 * Queijo Minas — um pão recheado não é um queijo. TACO/nomes de template
 * seguem o padrão "prato base, de ingrediente, preparo" (ex.: "Pão, de
 * queijo, assado", "Salada de tomate", "Suco de laranja") — quando o nome
 * começa com uma palavra de PRATO seguida de "de", o prato em si define o
 * grupo, nunca o ingrediente que vem depois do "de". Checado ANTES das
 * RULES normais, e só quando o padrão "base + de" bate no INÍCIO do nome
 * (nunca no meio) — nunca reclassifica o ingrediente sozinho (ex.: "Queijo,
 * minas, frescal" não começa com nenhuma dessas palavras, continua caindo
 * nas RULES normais).
 */
const DISH_PREFIX_RULES: Array<{ words: string[]; foodGroup: FoodGroup; foodSubgroup: FoodSubgroup; nutritionalRole: NutritionalRole }> = [
  { words: ["pao"], foodGroup: "CARBOHYDRATE", foodSubgroup: "GRAIN", nutritionalRole: "STARCH_SOURCE" },
  { words: ["pastel"], foodGroup: "CARBOHYDRATE", foodSubgroup: "OTHER_STARCH", nutritionalRole: "STARCH_SOURCE" },
  { words: ["bolo"], foodGroup: "CARBOHYDRATE", foodSubgroup: "OTHER_STARCH", nutritionalRole: "STARCH_SOURCE" },
  { words: ["torta"], foodGroup: "MIXED_DISH", foodSubgroup: "OTHER_SUBGROUP", nutritionalRole: "MIXED_ROLE" },
  { words: ["sopa"], foodGroup: "MIXED_DISH", foodSubgroup: "OTHER_SUBGROUP", nutritionalRole: "MIXED_ROLE" },
  { words: ["creme"], foodGroup: "MIXED_DISH", foodSubgroup: "OTHER_SUBGROUP", nutritionalRole: "MIXED_ROLE" },
  { words: ["omelete"], foodGroup: "PROTEIN", foodSubgroup: "EGG", nutritionalRole: "LEAN_PROTEIN" },
  { words: ["salada"], foodGroup: "VEGETABLE", foodSubgroup: "GENERIC_VEGETABLE", nutritionalRole: "VEGETABLE_SOURCE" },
  { words: ["suco"], foodGroup: "FRUIT", foodSubgroup: "GENERIC_FRUIT", nutritionalRole: "FRUIT_SOURCE" },
  { words: ["vitamina"], foodGroup: "FRUIT", foodSubgroup: "GENERIC_FRUIT", nutritionalRole: "FRUIT_SOURCE" },
];

function tokenize(text: string): string[] {
  return normalize(text).split(/[^a-z0-9]+/).filter(Boolean);
}

function classifyByDishPrefix(descricao: string): FoodClassification | null {
  const tokens = tokenize(descricao);
  if (tokens.length < 2 || tokens[1] !== "de") return null;
  const rule = DISH_PREFIX_RULES.find((r) => r.words.includes(tokens[0]));
  if (!rule) return null;
  const foodForm = classifyFoodForm(normalize(descricao), rule.foodSubgroup, rule.foodGroup);
  return { foodGroup: rule.foodGroup, foodSubgroup: rule.foodSubgroup, nutritionalRole: rule.nutritionalRole, culinaryRole: classifyCulinaryRole({ ...rule, foodForm }), foodForm, macroRole: "mixed" };
}

function buildClassification(input: {
  descricao: string;
  foodGroup: FoodGroup;
  foodSubgroup: FoodSubgroup;
  nutritionalRole: NutritionalRole;
  macroRole: FoodRole;
}): FoodClassification {
  const foodForm = classifyFoodForm(normalize(input.descricao), input.foodSubgroup, input.foodGroup);
  const culinaryRole = classifyCulinaryRole({ foodGroup: input.foodGroup, foodSubgroup: input.foodSubgroup, nutritionalRole: input.nutritionalRole, foodForm });
  return { foodGroup: input.foodGroup, foodSubgroup: input.foodSubgroup, nutritionalRole: input.nutritionalRole, culinaryRole, foodForm, macroRole: input.macroRole };
}

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

  // CORREÇÃO P0 — "prato base + de + ingrediente" (ex.: "Pão, de queijo,
  // assado") classifica pelo PRATO, nunca pelo ingrediente — checado antes
  // de tudo, pra nunca deixar uma keyword de ingrediente (ex.: "queijo")
  // capturar um prato composto como se fosse o próprio ingrediente.
  const dishClassification = classifyByDishPrefix(food.descricao);
  if (dishClassification) return { ...dishClassification, macroRole };

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
      return buildClassification({ descricao: food.descricao, foodGroup: rule.foodGroup, foodSubgroup: rule.foodSubgroup, nutritionalRole: rule.nutritionalRole, macroRole });
    }
  }

  // Nenhuma regra de categoria bateu — cai pro papel de macro-composicao
  // (sempre disponivel, nunca falha) como ultimo recurso, nunca lanca erro.
  const fallbackByMacro: Record<FoodRole, FoodClassification> = {
    carbohydrate: buildClassification({ descricao: food.descricao, foodGroup: "CARBOHYDRATE", foodSubgroup: "OTHER_STARCH", nutritionalRole: "STARCH_SOURCE", macroRole }),
    protein: buildClassification({ descricao: food.descricao, foodGroup: "PROTEIN", foodSubgroup: "OTHER_PROTEIN", nutritionalRole: "LEAN_PROTEIN", macroRole }),
    fat: buildClassification({ descricao: food.descricao, foodGroup: "FAT", foodSubgroup: "OTHER_SUBGROUP", nutritionalRole: "FAT_SOURCE", macroRole }),
    mixed: buildClassification({ descricao: food.descricao, foodGroup: "OTHER", foodSubgroup: "OTHER_SUBGROUP", nutritionalRole: "MIXED_ROLE", macroRole }),
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

const STARCH_MAIN_FORMS = new Set<FoodForm>(["RICE", "TUBER", "PASTA", "COUSCOUS", "TAPIOCA", "OAT", "QUINOA", "CORN"]);
const BREAKFAST_CARB_FORMS = new Set<FoodForm>(["BREAD", "TAPIOCA", "COUSCOUS", "OAT", "CEREAL"]);
const HARD_BLOCK_FOR_STARCH_MAIN = new Set<FoodForm>(["RAW_STARCH", "FLOUR", "INFANT_CEREAL", "COOKIE", "CAKE", "DESSERT", "SNACK", "BREAD", "JUICE", "PRESERVED_FRUIT"]);
const HARD_BLOCK_FOR_BREAKFAST_CARB = new Set<FoodForm>(["RAW_STARCH", "FLOUR", "INFANT_CEREAL", "COOKIE", "CAKE", "DESSERT", "SNACK", "JUICE", "PRESERVED_FRUIT"]);
const MAIN_PROTEIN_FORMS = new Set<FoodForm>(["POULTRY", "FISH", "RED_MEAT", "LEGUME"]);

export function contextualExchangeEligibility(input: {
  primary: FoodClassification;
  candidate: FoodClassification;
  mealContext?: MealContext;
  allowCrossGroup?: boolean;
}): { compatible: boolean; sameSubgroup: boolean; sameGroup: boolean; contextAppropriate: boolean; reason: "same_subgroup" | "same_group_context" | "role_context" | "incompatible_context" | "incompatible_group" } {
  const mealContext = input.mealContext ?? "GENERIC";
  const sameSubgroup = input.primary.foodSubgroup === input.candidate.foodSubgroup;
  const sameGroup = input.primary.foodGroup === input.candidate.foodGroup;
  const sameRole = input.primary.nutritionalRole === input.candidate.nutritionalRole;
  const primaryRole = classifyCulinaryRole(input.primary, mealContext);
  const candidateRole = classifyCulinaryRole(input.candidate, mealContext);

  if (!sameGroup && !sameRole) {
    return { compatible: false, sameSubgroup, sameGroup, contextAppropriate: false, reason: "incompatible_group" };
  }

  if (primaryRole === "STARCH_MAIN") {
    if (HARD_BLOCK_FOR_STARCH_MAIN.has(input.candidate.foodForm)) {
      return { compatible: false, sameSubgroup, sameGroup, contextAppropriate: false, reason: "incompatible_context" };
    }
    const contextAppropriate = sameGroup && input.candidate.nutritionalRole === "STARCH_SOURCE" && STARCH_MAIN_FORMS.has(input.candidate.foodForm);
    return { compatible: contextAppropriate, sameSubgroup, sameGroup, contextAppropriate, reason: contextAppropriate ? (sameSubgroup ? "same_subgroup" : "same_group_context") : "incompatible_context" };
  }

  if (primaryRole === "BREAKFAST_CARB" || primaryRole === "BREAD_BASE") {
    if (HARD_BLOCK_FOR_BREAKFAST_CARB.has(input.candidate.foodForm)) {
      return { compatible: false, sameSubgroup, sameGroup, contextAppropriate: false, reason: "incompatible_context" };
    }
    const contextAppropriate = sameGroup && input.candidate.nutritionalRole === "STARCH_SOURCE" && BREAKFAST_CARB_FORMS.has(input.candidate.foodForm);
    return { compatible: contextAppropriate, sameSubgroup, sameGroup, contextAppropriate, reason: contextAppropriate ? (sameSubgroup ? "same_subgroup" : "same_group_context") : "incompatible_context" };
  }

  if (primaryRole === "FRUIT_PORTION") {
    const contextAppropriate = input.candidate.foodGroup === "FRUIT" && !["DESSERT", "SNACK", "JUICE", "PRESERVED_FRUIT"].includes(input.candidate.foodForm);
    return { compatible: contextAppropriate, sameSubgroup, sameGroup, contextAppropriate, reason: contextAppropriate ? "role_context" : "incompatible_context" };
  }

  if (primaryRole === "LEAN_PROTEIN_MAIN") {
    const contextAppropriate = input.candidate.foodGroup === "PROTEIN" && MAIN_PROTEIN_FORMS.has(input.candidate.foodForm) && input.candidate.foodForm !== "EGG";
    return { compatible: contextAppropriate, sameSubgroup, sameGroup, contextAppropriate, reason: contextAppropriate ? (sameSubgroup ? "same_subgroup" : "same_group_context") : "incompatible_context" };
  }

  if (primaryRole === "DAIRY_SNACK") {
    const contextAppropriate = input.candidate.foodGroup === "DAIRY";
    return { compatible: contextAppropriate, sameSubgroup, sameGroup, contextAppropriate, reason: contextAppropriate ? (sameSubgroup ? "same_subgroup" : "same_group_context") : "incompatible_context" };
  }

  const basic = isCompatibleForExchange(input.primary, input.candidate, input.allowCrossGroup ?? false);
  return { ...basic, contextAppropriate: basic.compatible, reason: basic.compatible ? (basic.sameSubgroup ? "same_subgroup" : "same_group_context") : "incompatible_group" };
}
