import type { FoodReference } from "@/lib/nutrition/food-catalog";

/**
 * Tipos compartilhados do PRÉ-PLANO (draft) — extraídos pra um módulo
 * próprio sem dependências de IA/repositórios, pra que o motor de
 * nutrição/optimizer/critic (lib/nutrition/draft-*.ts) e o agente de IA
 * (lib/ai/agents/nutrition/meal-plan-draft-agent.ts) importem do mesmo
 * lugar sem import circular.
 */

export const MEAL_KEYS = ["cafe_da_manha", "lanche_manha", "almoco", "lanche_tarde", "jantar", "ceia"] as const;
export type MealKey = (typeof MEAL_KEYS)[number];

export const MEAL_KEY_LABELS: Record<MealKey, string> = {
  cafe_da_manha: "Café da manhã",
  lanche_manha: "Lanche da manhã",
  almoco: "Almoço",
  lanche_tarde: "Lanche da tarde",
  jantar: "Jantar",
  ceia: "Ceia",
};

export interface RequestedMeal {
  key: MealKey;
  suggestedTime: string | null;
}

/** Item RESOLVIDO — tem identidade real (source+refId), entra no cálculo nutricional. */
export interface DraftMealItem {
  food: string;
  /** Nome amigável só para exibição (lib/nutrition/food-resolver.ts#toDisplayFoodName) — nunca usado pra resolver/persistir. */
  displayName: string;
  quantity: string;
  unit: string;
  food_source: "TACO" | "CUSTOM" | "MANUFACTURER" | "USDA" | null;
  food_ref_id: string | null;
  ai_suggested: true;
  /** true quando a identidade foi resolvida mas a segurança clínica não pôde ser confirmada (CLINICAL_UNKNOWN) — conta no cálculo, mas fica destacado na revisão. */
  needsSafetyReview?: boolean;
  /** R5.1 (COMBINATION) — item opcional dentro de uma refeição combinável (fixed items com is_optional=true), reaproveitando exatamente o mesmo campo do domínio real (lib/meal-plans/flexible-structure.ts) — nunca um conceito paralelo. Sempre `undefined`/false para SIMPLE/OPTIONS. */
  is_optional?: boolean;
}

/** Candidato que NÃO virou um item calculável — precisa de decisão humana antes de entrar no plano. */
export interface DraftMealNeedsReview {
  query: string;
  quantity: string;
  unit: string;
  status: "AMBIGUOUS" | "NOT_FOUND" | "CLINICAL_CONFLICT" | "PREPARATION_NEEDS_REVIEW";
  reason: string;
  /** Opções mais prováveis para escolha manual, só quando status é AMBIGUOUS. */
  candidates: { ref: FoodReference; name: string; displayName: string; sourceLabel: string }[];
  /** Preparo detectado (Food Preparation Engine V1) — só quando status é PREPARATION_NEEDS_REVIEW. */
  preparation?: string | null;
  /** Receitas reais que podem representar o preparo — só quando status é PREPARATION_NEEDS_REVIEW; nunca escolhida sozinha. */
  recipeCandidates?: { id: string; title: string; servings: number }[];
  /**
   * R5.1 (seção 16) — caminho estável até a posição EXATA de origem deste
   * item dentro da refeição, para permitir substituir SÓ esse item nested
   * sem reconstruir a refeição inteira. Formato: "items[N]" (SIMPLE/fixed),
   * "options[I].items[N]" (OPTIONS) ou "choice_groups[I].items[N]"
   * (COMBINATION). Opcional (`undefined` para itens legados de
   * refine/regenerate-meal que não recalculam path) — nunca usado como
   * único identificador (a posição no array `needsReview` continua sendo a
   * chave primária de remoção), só como contexto extra pra UI/replacement.
   */
  path?: string;
}

/** R5.1 — uma alternativa completa e mutuamente exclusiva de uma refeição OPTIONS. Reaproveita o mesmo shape de `MealOptionPayload` (lib/meal-plans/flexible-structure.ts), nunca um tipo paralelo. */
export interface DraftMealOption {
  /** Identidade temporária estável só para esta sessão de draft (ex.: "option-0") — nunca persistida como id real; o Composer gera seu próprio id ao salvar. */
  id: string;
  label: string;
  items: DraftMealItem[];
  needsReview: DraftMealNeedsReview[];
}

/** R5.1 — um grupo de escolha de uma refeição COMBINATION. Reaproveita o mesmo shape de `MealChoiceGroupPayload`. */
export interface DraftMealChoiceGroup {
  id: string;
  title: string;
  min_selections: number;
  max_selections: number;
  items: DraftMealItem[];
  needsReview: DraftMealNeedsReview[];
}

export interface DraftMeal {
  /** Slot original que gerou esta refeição — permite regenerar/referenciar sem depender do nome de exibição (que muda pra título de receita quando source_recipe_id está presente). */
  mealKey: MealKey;
  name: string;
  suggested_time: string | null;
  source_recipe_id: string | null;
  /**
   * R5.1 — estrutura da refeição. `undefined`/`null`/"SIMPLE" são
   * equivalentes (mesma convenção de `MealPlanMealPayload.meal_structure` —
   * NULL é legado-compatível, sempre interpretado como SIMPLE). Nunca
   * presente em drafts anteriores a esta fase — backward compatible por
   * construção.
   */
  meal_structure?: "SIMPLE" | "OPTIONS" | "COMBINATION" | null;
  /** SIMPLE: únicos itens da refeição. COMBINATION: itens FIXOS (alguns podem ter is_optional=true). OPTIONS: só itens fixos adicionais fora das opções (raro; normalmente vazio). Só itens com identidade real — é isto (nunca needsReview) que alimenta o cálculo nutricional. */
  items: DraftMealItem[];
  needsReview: DraftMealNeedsReview[];
  /** Só presente quando meal_structure é "OPTIONS". */
  options?: DraftMealOption[];
  /** Só presente quando meal_structure é "COMBINATION". */
  choice_groups?: DraftMealChoiceGroup[];
}

export interface DraftWarning {
  level: "info" | "warning";
  mealKey?: string;
  message: string;
}

export interface MealPlanDraftResult {
  meals: DraftMeal[];
  warnings: DraftWarning[];
  /** Diagnóstico interno (observabilidade) — nunca exposto de forma crua ao usuário: qual caminho de recuperação foi usado, se algum. */
  fallbackUsed?: "none" | "partial_recovery" | "meal_by_meal";
}
