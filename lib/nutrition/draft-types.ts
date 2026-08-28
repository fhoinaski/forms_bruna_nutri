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
  /** Intenção de preparo comunicada pela IA; metadado transitório do draft. */
  preparation?: string | null;
  /** Item opcional preservado ao entrar no editor Meal Flex. */
  is_optional?: boolean;
}

/** Candidato que NÃO virou um item calculável — precisa de decisão humana antes de entrar no plano. */
export interface DraftMealNeedsReview {
  /** Endereço determinístico da sugestão no draft; não é id persistido. */
  path?: string;
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
}

export interface DraftMeal {
  /** Slot original que gerou esta refeição — permite regenerar/referenciar sem depender do nome de exibição (que muda pra título de receita quando source_recipe_id está presente). */
  mealKey: MealKey;
  name: string;
  suggested_time: string | null;
  source_recipe_id: string | null;
  /** NULL é aceito pelo legado e equivale a SIMPLE. */
  meal_structure?: "SIMPLE" | "OPTIONS" | "COMBINATION" | null;
  /** Só itens com identidade real — é isto (nunca needsReview) que alimenta calculatePlanNutrients. */
  items: DraftMealItem[];
  /** Alternativas completas, nunca aditivas entre si. */
  options?: Array<{ label: string; description?: string | null; items: DraftMealItem[] }>;
  /** Grupos de escolha combináveis; os itens fixos continuam em `items`. */
  choice_groups?: Array<{ title: string; description?: string | null; min_selections: number; max_selections: number; items: DraftMealItem[] }>;
  needsReview: DraftMealNeedsReview[];
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
