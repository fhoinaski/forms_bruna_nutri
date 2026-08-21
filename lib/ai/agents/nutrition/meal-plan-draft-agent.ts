import { z } from "zod";
import { generateStructuredResult } from "@/lib/ai/gateway/ai-gateway";
import { AiConfigError, AiProviderError, AiValidationError } from "@/lib/ai/core/ai-errors";
import { sanitizeClinicalContext } from "@/lib/ai/privacy/sanitize-context";
import { assertCategoryAllowed } from "@/lib/ai/policies/clinical-context-policy";
import { getClientById, type Client } from "@/lib/repositories/clients";
import { getExistingNutritionRecord } from "@/lib/repositories/nutrition-records";
import { listPatientClinicalMarkers, type PatientClinicalMarker } from "@/lib/repositories/patient-clinical-markers";
import { getActiveMealPlan } from "@/lib/repositories/meal-plans";
import { getRecipes, getRecipeById, type RecipePayload } from "@/lib/repositories/recipes";
import { calculateAgeInYears, calculateBmiValue, formatHeightDisplay } from "@/lib/clinical/anthropometry";
import { scaleRecipeIngredientsToPortions } from "@/lib/nutrition/recipes";
import { resolveFoodCandidate, resolveFoodCandidates, toDisplayFoodName, type FoodResolution } from "@/lib/nutrition/food-resolver";
import {
  MEAL_KEYS,
  MEAL_KEY_LABELS,
  type MealKey,
  type RequestedMeal,
  type DraftMeal,
  type DraftMealItem,
  type DraftMealNeedsReview,
  type DraftWarning,
  type MealPlanDraftResult,
} from "@/lib/nutrition/draft-types";

export { MEAL_KEYS, MEAL_KEY_LABELS };
export type { MealKey, RequestedMeal, DraftMeal, DraftMealItem, DraftMealNeedsReview, DraftWarning, MealPlanDraftResult };

/**
 * Gerador de PRE-PLANO alimentar guiado por IA (nunca ativa, nunca publica
 * sozinho — quem chama decide quando aplicar ao editor real). Regra
 * central: "IA PROPÕE. RESOLVER IDENTIFICA. ENGINE CALCULA. OPTIMIZER
 * AJUSTA. CRITIC REVISA. NUTRICIONISTA DECIDE." Este arquivo nunca calcula
 * kcal/macros (schema do LLM não tem campo numérico de nutriente) e nunca
 * resolve alimento por conta própria — delega para
 * lib/nutrition/food-resolver.ts (resolução rigorosa, nunca "primeiro
 * resultado cego") e lib/nutrition/draft-nutrition.ts (cálculo real via
 * calculatePlanNutrients).
 */

export interface MealPlanDraftContext {
  clientId: string;
  clientName: string;
  ageYears: number | null;
  biologicalSex: string | null;
  weightKg: string | null;
  heightDisplay: string | null;
  bmi: string | null;
  lifeStage: string | null;
  goals: string | null;
  allergies: string | null;
  restrictions: string | null;
  foodPreferences: string | null;
  foodAversions: string | null;
  clinicalMarkers: { type: string; label: string; severity: string; status: string }[];
  activePlan: { title: string; targetEnergyKcal: number | null } | null;
}

/**
 * Contexto DETERMINÍSTICO montado só de repositórios reais — nenhuma
 * informação inventada, nenhum campo não solicitado. É este mesmo objeto
 * que alimenta tanto a prévia da etapa 1 do wizard quanto o prompt da
 * geração — fonte única.
 */
export async function buildMealPlanDraftContext(clientId: string): Promise<MealPlanDraftContext | null> {
  const client = await getClientById(clientId);
  if (!client) return null;

  const [record, markers, activePlan] = await Promise.all([
    getExistingNutritionRecord(clientId),
    listPatientClinicalMarkers(clientId),
    getActiveMealPlan(clientId),
  ]);

  return {
    clientId,
    clientName: client.name,
    ageYears: calculateAgeInYears(client.birth_date),
    biologicalSex: record?.biological_sex ?? null,
    weightKg: record?.current_weight_kg ?? null,
    heightDisplay: formatHeightDisplay(record?.height_cm ?? null),
    bmi: record?.bmi ?? (record?.current_weight_kg && record?.height_cm ? String(calculateBmiValue(record.current_weight_kg, record.height_cm) ?? "") || null : null),
    lifeStage: record?.life_stage ?? null,
    goals: record?.goals ?? null,
    allergies: record?.allergies ?? null,
    restrictions: record?.restrictions ?? null,
    foodPreferences: record?.food_preferences ?? null,
    foodAversions: record?.food_aversions ?? null,
    clinicalMarkers: markers.map((marker) => ({ type: marker.type, label: marker.label ?? marker.normalized_code, severity: marker.severity, status: marker.status })),
    activePlan: activePlan ? { title: activePlan.title, targetEnergyKcal: activePlan.target_energy_kcal ?? null } : null,
  };
}

function formatContextForPrompt(context: MealPlanDraftContext): string {
  const lines: string[] = [];
  if (context.ageYears !== null) lines.push(`Idade: ${context.ageYears} anos`);
  if (context.biologicalSex) lines.push(`Sexo biológico: ${context.biologicalSex}`);
  if (context.weightKg) lines.push(`Peso atual: ${context.weightKg} kg`);
  if (context.heightDisplay) lines.push(`Altura: ${context.heightDisplay}`);
  if (context.bmi) lines.push(`IMC: ${context.bmi}`);
  if (context.lifeStage) lines.push(`Fase do cuidado: ${context.lifeStage}`);
  if (context.goals) lines.push(`Objetivos registrados: ${context.goals}`);
  if (context.allergies) lines.push(`Alergias registradas: ${context.allergies}`);
  if (context.restrictions) lines.push(`Restrições registradas: ${context.restrictions}`);
  if (context.foodPreferences) lines.push(`Preferências alimentares registradas: ${context.foodPreferences}`);
  if (context.foodAversions) lines.push(`Aversões alimentares registradas: ${context.foodAversions}`);
  if (context.clinicalMarkers.length) {
    lines.push(`Marcadores clínicos ativos: ${context.clinicalMarkers.map((m) => `${m.label} (${m.type}, ${m.severity}, ${m.status})`).join("; ")}`);
  }
  if (context.activePlan) lines.push(`Plano ativo atual: "${context.activePlan.title}"${context.activePlan.targetEnergyKcal ? ` (meta ${context.activePlan.targetEnergyKcal} kcal)` : ""}`);
  return lines.length ? lines.join("\n") : "Nenhum dado clínico estruturado disponível.";
}

// ── Schema pedido ao LLM — SÓ identidade (nome/quantidade/unidade),
// literalmente nenhum campo de kcal/macro existe aqui, então o modelo não
// pode fornecer um número nutricional mesmo que tente (strict() descarta
// qualquer chave extra no parse). ────────────────────────────────────────
const draftFoodItemSchema = z.object({
  query: z.string().min(1).max(120),
  quantity: z.number().positive().max(5000),
  unit: z.string().min(1).max(20),
}).strict();

const draftMealLlmSchema = z.object({
  mealKey: z.enum(MEAL_KEYS),
  /** Só um id REAL da lista de receitas fornecida no prompt — nunca inventado (validado de novo no resolver). */
  recipeId: z.string().max(80).nullable().optional(),
  // 6 (nao 8): com as 6 refeicoes marcadas, 8 itens cada gerava uma saida
  // grande o bastante pra estourar o orcamento de tempo do provedor em
  // testes reais (bug observado: "Falha persistente do provedor de IA" —
  // todas as tentativas expirando contra o mesmo relogio compartilhado).
  // 6 itens por refeicao ja e generoso pro caso comum.
  items: z.array(draftFoodItemSchema).max(6).default([]),
  rationale: z.string().max(160).nullable().optional(),
}).strict();

const mealPlanDraftLlmSchema = z.object({
  meals: z.array(draftMealLlmSchema).min(1).max(6),
}).strict();

const DRAFT_SYSTEM_PROMPT = `Você ajuda uma nutricionista a montar a ESTRUTURA de um pré-plano alimentar.

Regras absolutas:
- Você NUNCA fornece kcal, calorias, gramas de proteína/carboidrato/gordura ou qualquer valor nutricional — o sistema calcula isso depois com uma engine determinística. Se você incluir esses campos eles serão descartados.
- Para cada refeição solicitada, proponha alimentos como NOMES ESPECÍFICOS e reais (ex.: "arroz branco cozido", "peito de frango grelhado", "banana prata") — NUNCA um nome genérico demais (ex.: "arroz", "frango", "peixe") que pode combinar com vários alimentos diferentes no catálogo; quanto mais específico, maior a chance de resolução automática.
- "recipeId" só pode ser um id EXATO da lista de receitas reais fornecida no contexto — nunca invente um id, nunca invente uma receita.
- Respeite rigorosamente alergias/restrições/aversões informadas — nunca proponha um alimento que contradiga isso.
- Só proponha refeições cujas chaves (mealKey) estejam na lista de "Refeições solicitadas" — nunca adicione uma refeição extra.
- Evite repetir o mesmo alimento em muitas refeições diferentes — priorize variedade quando fizer sentido para o objetivo.

Formato de resposta OBRIGATÓRIO — responda APENAS este JSON, sem markdown, sem texto antes ou depois:
{"meals":[{"mealKey":"cafe_da_manha","recipeId":null,"items":[{"query":"arroz branco cozido","quantity":100,"unit":"g"}],"rationale":"texto curto opcional"}]}

Regras de formato (violar qualquer uma invalida a resposta inteira):
- "mealKey" deve ser copiado EXATAMENTE (sem traduzir, sem espaços, sem maiúsculas) de uma destas strings: cafe_da_manha, lanche_manha, almoco, lanche_tarde, jantar, ceia.
- "quantity" é sempre um NÚMERO json (ex.: 100), nunca uma string (nunca "100" nem "100g").
- "unit" é uma string curta (ex.: "g", "ml", "unidade", "colher de sopa").
- "recipeId" é null OU uma string com um id exato da lista de receitas — nunca invente, nunca deixe um texto que não seja um id real.
- "items" é sempre um array, mesmo com 1 item só; nunca omita o campo.
- Não inclua nenhum campo além dos mostrados no exemplo (nada de kcal/calories/protein/carbs/fat/macros).`;

export interface GenerateMealPlanDraftInput {
  clientId: string;
  adminId?: string | null;
  objectiveLabel: string;
  targetEnergyKcal: number | null;
  targetProteinG: number | null;
  targetCarbohydrateG: number | null;
  targetFatG: number | null;
  requestedMeals: RequestedMeal[];
  prioritizeFoods: string | null;
  avoidFoods: string | null;
  useRecipes: boolean;
  /** Refeições já existentes no draft (usado por regenerateMealInDraft para dar contexto de variedade ao LLM). */
  otherMealsContext?: DraftMeal[];
  /** Pula direto pro fallback refeição-por-refeição (seção 20 do pedido de robustez: botão manual "Gerar refeição por refeição" no wizard). */
  forceMealByMeal?: boolean;
}

/**
 * Correções MECÂNICAS e semântica-preservantes aplicadas ANTES do zod
 * (seção 5 do pedido de robustez) — nunca inventa conteúdo, só corrige
 * formato óbvio: "100" (string estritamente numérica) → 100 (number).
 * NUNCA aceita "100g"/"uma porção" — essas continuam falhando no zod de
 * propósito (ambiguidade real, não erro mecânico de formato).
 */
function normalizeMealPlanDraftRaw(raw: unknown): unknown {
  if (!raw || typeof raw !== "object") return raw;
  const obj = raw as Record<string, unknown>;
  if (!Array.isArray(obj.meals)) return raw;
  const meals = obj.meals.map((meal) => {
    if (!meal || typeof meal !== "object") return meal;
    const next = { ...(meal as Record<string, unknown>) };
    if (Array.isArray(next.items)) {
      next.items = next.items.map((item) => {
        if (!item || typeof item !== "object") return item;
        const nextItem = { ...(item as Record<string, unknown>) };
        if (typeof nextItem.quantity === "string" && /^\d+(\.\d+)?$/.test(nextItem.quantity.trim())) {
          nextItem.quantity = Number(nextItem.quantity.trim());
        }
        return nextItem;
      });
    }
    return next;
  });
  return { ...obj, meals };
}

/** Sinônimos conhecidos e fechados (seção 15) — nunca inventa peso de medida caseira, só normaliza grafias óbvias da mesma unidade. */
const UNIT_SYNONYMS: Record<string, string> = {
  grama: "g", gramas: "g", g: "g",
  mililitro: "ml", mililitros: "ml", ml: "ml",
  unidade: "unidade", unidades: "unidade", un: "unidade", unid: "unidade",
};
function normalizeUnit(unit: string): string {
  const key = unit.trim().toLowerCase();
  return UNIT_SYNONYMS[key] ?? unit.trim();
}

async function candidateRecipesForMeals(requestedMeals: RequestedMeal[]): Promise<RecipePayload[]> {
  const recipes = await getRecipes({ includeInactive: false });
  const requestedKeys = new Set(requestedMeals.map((m) => m.key));
  // Mapeamento tosco chave-de-refeicao -> grupo de receita: so pra filtrar
  // o que mostrar ao LLM (nao restringe o calculo, so reduz ruido no prompt).
  const keyToGroup: Record<MealKey, string[]> = {
    cafe_da_manha: ["cafe_da_manha", "lanche"],
    lanche_manha: ["lanche", "bebida"],
    almoco: ["almoco"],
    lanche_tarde: ["lanche", "bebida"],
    jantar: ["jantar", "almoco"],
    ceia: ["lanche", "sobremesa", "bebida"],
  };
  const allowedGroups = new Set(Array.from(requestedKeys).flatMap((key) => keyToGroup[key]));
  // Sem limite aqui, uma biblioteca grande (e com todas as 6 refeicoes
  // selecionadas, quase todo grupo entra no filtro) inflava o prompt sem
  // limite, aumentando risco real de timeout/truncamento na geracao —
  // causa provavel de um 502 observado em teste manual com todas as
  // refeicoes + receitas habilitadas. 15 candidatos e mais que suficiente
  // pro LLM escolher bem sem inflar o contexto.
  return recipes.filter((recipe) => allowedGroups.has(recipe.meal_group)).slice(0, 15);
}

/** Converte uma FoodResolution já feita em item calculável ou entrada "precisa de revisão" — nunca deixa um item sem identidade real entrar silenciamente no cálculo. */
function resolutionToMealParts(
  resolution: FoodResolution,
  quantity: string,
  unitRaw: string
): { item: DraftMealItem | null; needsReview: DraftMealNeedsReview | null } {
  const unit = normalizeUnit(unitRaw);
  if (resolution.status === "RESOLVED" || resolution.status === "CLINICAL_UNKNOWN") {
    return {
      item: {
        food: resolution.name!,
        displayName: resolution.displayName!,
        quantity,
        unit,
        food_source: resolution.ref!.source === "USDA" || resolution.ref!.source === "CUSTOM" || resolution.ref!.source === "MANUFACTURER" ? resolution.ref!.source : "TACO",
        food_ref_id: resolution.ref!.sourceId,
        ai_suggested: true,
        needsSafetyReview: resolution.status === "CLINICAL_UNKNOWN",
      },
      needsReview: null,
    };
  }
  return {
    item: null,
    needsReview: {
      query: resolution.query,
      quantity,
      unit,
      status: resolution.status,
      reason: resolution.reason,
      candidates: resolution.candidates,
    },
  };
}

export async function generateMealPlanDraft(input: GenerateMealPlanDraftInput): Promise<MealPlanDraftResult> {
  assertCategoryAllowed("meal_plan_review", "identity");
  assertCategoryAllowed("meal_plan_review", "anthropometry");
  assertCategoryAllowed("meal_plan_review", "meal_plan");

  const context = await buildMealPlanDraftContext(input.clientId);
  if (!context) throw new Error("Paciente não encontrado.");
  if (!input.requestedMeals.length) throw new Error("Selecione ao menos uma refeição.");

  const [markers, candidateRecipes] = await Promise.all([
    listPatientClinicalMarkers(input.clientId),
    input.useRecipes ? candidateRecipesForMeals(input.requestedMeals) : Promise.resolve([]),
  ]);

  const otherMealsText = input.otherMealsContext?.length
    ? input.otherMealsContext.map((meal) => `${meal.name}: ${meal.items.map((item) => item.displayName).join(", ") || "(vazio)"}`).join("\n")
    : null;

  const sections = [
    { label: "DADOS_CLINICOS", content: formatContextForPrompt(context) },
    { label: "OBJETIVO_DO_PLANO", content: input.objectiveLabel },
    {
      label: "META_NUTRICIONAL_INFORMADA_PELA_NUTRICIONISTA",
      content: [
        input.targetEnergyKcal !== null ? `Energia: ${input.targetEnergyKcal} kcal` : null,
        input.targetProteinG !== null ? `Proteína: ${input.targetProteinG} g` : null,
        input.targetCarbohydrateG !== null ? `Carboidrato: ${input.targetCarbohydrateG} g` : null,
        input.targetFatG !== null ? `Gordura: ${input.targetFatG} g` : null,
      ].filter(Boolean).join("\n") || "Nenhuma meta numérica informada — proponha uma estrutura equilibrada sem se ancorar em um valor específico.",
    },
    {
      label: "REFEICOES_SOLICITADAS",
      content: input.requestedMeals.map((m) => `${m.key}${m.suggestedTime ? ` às ${m.suggestedTime}` : " (sem horário definido)"}`).join("\n"),
    },
    {
      label: "PREFERENCIAS_DA_NUTRICIONISTA",
      content: [
        input.prioritizeFoods ? `Priorizar: ${input.prioritizeFoods}` : null,
        input.avoidFoods ? `Evitar: ${input.avoidFoods}` : null,
      ].filter(Boolean).join("\n") || "Nenhuma preferência adicional informada.",
    },
    {
      label: "RECEITAS_REAIS_DISPONIVEIS",
      content: input.useRecipes && candidateRecipes.length
        ? candidateRecipes.map((r) => `id=${r.id} | ${r.title} | grupo=${r.meal_group}`).join("\n")
        : "Nenhuma receita disponível — não use recipeId.",
    },
    ...(otherMealsText ? [{ label: "OUTRAS_REFEICOES_JA_NO_PLANO", content: `${otherMealsText}\n\nEvite repetir demais os mesmos alimentos já usados acima.` }] : []),
  ];

  const { pseudonym, contextBlock } = sanitizeClinicalContext(context.clientName, sections);

  let data: z.infer<typeof mealPlanDraftLlmSchema> | null = null;
  const preAssembleWarnings: DraftWarning[] = [];
  let fallbackUsed: MealPlanDraftResult["fallbackUsed"] = "none";

  if (!input.forceMealByMeal) {
    try {
      const result = await generateStructuredResult({
        agent: "meal-plan-draft",
        adminId: input.adminId,
        system: DRAFT_SYSTEM_PROMPT,
        prompt: `Paciente: ${pseudonym}.\n\n${contextBlock}\n\nProponha a estrutura do pré-plano alimentar.`,
        schema: mealPlanDraftLlmSchema,
        normalize: normalizeMealPlanDraftRaw,
        // Uma proposta completa de plano (ate 6 refeicoes x 6 itens, mais
        // rationale por refeicao e ate 15 receitas candidatas no prompt) e
        // uma saida bem maior que os agentes curtos deste app. O timeout do
        // gateway (`timeoutMs`) e um relogio UNICO compartilhado entre TODAS
        // as tentativas (nao por tentativa) — com o default de 3 tentativas,
        // se a primeira chamada real ja consumir a maior parte do orcamento,
        // as tentativas seguintes abortam quase instantaneamente contra o
        // MESMO sinal ja expirado, e o gateway acaba lancando "Falha
        // persistente do provedor de IA" mesmo com um provider saudavel (bug
        // real observado em teste manual). maxAttempts:2 concentra o
        // orcamento em menos tentativas (ainda com 1 chance de recuperacao
        // de formato) em vez de dilui-lo em 3. 4000 tokens mostrou truncamento
        // real em teste manual com 4 refeicoes + meta + JSON de receitas
        // candidatas no prompt — 6000 da mais folga; timeoutMs sobe junto
        // (120s) porque e um relogio UNICO compartilhado entre as 2
        // tentativas (ver comentario acima) — sem essa folga, a 1a tentativa
        // mais lenta (mais tokens) deixava a 2a sem tempo real de rodar.
        maxOutputTokens: 6000,
        timeoutMs: 120_000,
        maxAttempts: 2,
      });
      data = result.data;
    } catch (cause) {
      if (cause instanceof AiConfigError || cause instanceof AiProviderError) throw cause;
      if (cause instanceof AiValidationError) {
        // Recuperação parcial (seção 12/13): reaproveita o ÚLTIMO payload
        // que já passou no JSON.parse (mesmo tendo falhado no zod do
        // envelope inteiro) — valida CADA refeição individualmente, sem
        // gastar uma nova chamada de IA. Uma refeição ruim nunca derruba as
        // boas.
        const recovered = recoverPartialMeals(cause, input.requestedMeals);
        if (recovered.meals.length) {
          data = { meals: recovered.meals };
          fallbackUsed = "partial_recovery";
          preAssembleWarnings.push(...recovered.warnings);
        }
      } else {
        throw cause;
      }
    }
  }

  if (!data) {
    // Nada foi recuperável do envelope inteiro (ou forceMealByMeal pedido
    // explicitamente) — cai pro fallback refeição-por-refeição (seção
    // 17/18): saídas bem menores, muito mais fáceis de validar. Só faz
    // sentido quando há mais de 1 refeição pedida — para 1 só, o fallback
    // seria idêntico à chamada que já falhou.
    if (input.requestedMeals.length <= 1) {
      throw new AiValidationError(
        "A IA nao retornou um resultado no formato esperado.",
        undefined,
        "structured_invalid",
        false,
        "UNKNOWN"
      );
    }
    const fallback = await generateMealPlanDraftMealByMeal(input);
    return { meals: fallback.meals, warnings: [...preAssembleWarnings, ...fallback.warnings], fallbackUsed: "meal_by_meal" };
  }

  const assembled = await assembleDraft(data.meals, input.requestedMeals, candidateRecipes, markers);
  return { meals: assembled.meals, warnings: [...preAssembleWarnings, ...assembled.warnings], fallbackUsed };
}

/**
 * Valida CADA refeição do último payload (JSON válido, mas o envelope
 * inteiro falhou no zod) individualmente contra `draftMealLlmSchema` — só
 * refeições que se encaixam sozinhas sobrevivem; as outras viram warning,
 * nunca são "consertadas" com conteúdo inventado.
 */
function recoverPartialMeals(
  cause: AiValidationError,
  requestedMeals: RequestedMeal[]
): { meals: z.infer<typeof mealPlanDraftLlmSchema>["meals"]; warnings: DraftWarning[] } {
  const warnings: DraftWarning[] = [];
  const rawData = cause.rawData as { meals?: unknown[] } | undefined;
  if (!rawData || !Array.isArray(rawData.meals)) return { meals: [], warnings };

  const requestedKeys = new Set(requestedMeals.map((m) => m.key));
  const meals: z.infer<typeof mealPlanDraftLlmSchema>["meals"] = [];
  rawData.meals.forEach((rawMeal, index) => {
    const parsed = draftMealLlmSchema.safeParse(rawMeal);
    if (parsed.success && requestedKeys.has(parsed.data.mealKey)) {
      meals.push(parsed.data);
      return;
    }
    warnings.push({
      level: "warning",
      message: parsed.success
        ? `A IA propôs uma refeição fora do que foi pedido (posição ${index + 1}) — ignorada.`
        : `Refeição na posição ${index + 1} veio em formato inválido e foi descartada (recuperação parcial aplicada às demais).`,
    });
  });
  return { meals, warnings };
}

const MEAL_BY_MEAL_FALLBACK_CONCURRENCY = 2;

/**
 * Fallback de última instância (seção 17/18): gera CADA refeição pedida com
 * uma chamada estruturada separada e bem menor — reaproveita
 * `generateMealPlanDraft` (mesmo schema, mesmo resolver, mesma engine),
 * nunca uma segunda lógica paralela. Só roda quando o envelope inteiro
 * falhou E a recuperação parcial não salvou nada. Concorrência limitada
 * (nunca N chamadas simultâneas sem controle — seção 36/37).
 */
async function generateMealPlanDraftMealByMeal(input: GenerateMealPlanDraftInput): Promise<MealPlanDraftResult> {
  const meals: DraftMeal[] = [];
  const warnings: DraftWarning[] = [];
  const queue = [...input.requestedMeals];

  async function worker(): Promise<void> {
    for (;;) {
      const meal = queue.shift();
      if (!meal) return;
      try {
        const single = await generateMealPlanDraft({ ...input, requestedMeals: [meal], otherMealsContext: input.otherMealsContext, forceMealByMeal: false });
        meals.push(...single.meals);
        warnings.push(...single.warnings);
      } catch {
        warnings.push({ level: "warning", mealKey: meal.key, message: `Não foi possível gerar "${MEAL_KEY_LABELS[meal.key]}" mesmo no modo refeição por refeição — tente novamente ou adicione manualmente.` });
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(MEAL_BY_MEAL_FALLBACK_CONCURRENCY, queue.length) }, worker));
  if (!meals.length) warnings.push({ level: "warning", message: "Não foi possível montar nenhuma refeição, mesmo tentando refeição por refeição — tente novamente ou continue manualmente." });
  return { meals, warnings };
}

async function assembleDraft(
  llmMeals: z.infer<typeof mealPlanDraftLlmSchema>["meals"],
  requestedMeals: RequestedMeal[],
  candidateRecipes: RecipePayload[],
  markers: PatientClinicalMarker[]
): Promise<MealPlanDraftResult> {
  const warnings: DraftWarning[] = [];
  const requestedByKey = new Map(requestedMeals.map((m) => [m.key, m]));

  // Separa refeições que usam receita (não passam pelo resolver de texto
  // livre) das que precisam resolver itens — depois resolve TODOS os itens
  // de TODAS as refeições em UMA chamada em lote (cache por query +
  // paralelo), em vez de uma busca serializada por item por refeição
  // (seção 30/31 do pedido: evitar N+1).
  type PendingMeal = { llmMeal: (typeof llmMeals)[number]; requested: RequestedMeal; recipe?: RecipePayload };
  const pending: PendingMeal[] = [];
  for (const llmMeal of llmMeals) {
    const requested = requestedByKey.get(llmMeal.mealKey);
    if (!requested) continue; // IA nunca pode adicionar uma refeicao fora do que foi pedido.
    if (llmMeal.recipeId) {
      const recipe = candidateRecipes.find((r) => r.id === llmMeal.recipeId) ?? await getRecipeById(llmMeal.recipeId);
      if (!recipe) {
        warnings.push({ level: "warning", mealKey: llmMeal.mealKey, message: "Receita sugerida não encontrada na biblioteca — ignorada." });
      } else {
        pending.push({ llmMeal, requested, recipe });
        continue;
      }
    }
    pending.push({ llmMeal, requested });
  }

  const queries: { query: string; key: string }[] = [];
  pending.forEach((entry, mealIndex) => {
    if (entry.recipe) return;
    entry.llmMeal.items.forEach((item, itemIndex) => {
      queries.push({ query: item.query, key: `${mealIndex}:${itemIndex}` });
    });
  });
  const resolutions = await resolveFoodCandidates(queries, markers);

  const meals: DraftMeal[] = [];
  pending.forEach((entry, mealIndex) => {
    if (entry.recipe) {
      const scaled = scaleRecipeIngredientsToPortions(entry.recipe.ingredients, entry.recipe.servings, 1);
      const items: DraftMealItem[] = scaled
        .filter((ing) => ing.taco_number && ing.grams)
        .map((ing) => ({
          food: ing.food_name,
          displayName: toDisplayFoodName(ing.food_name),
          quantity: String(ing.grams),
          unit: "g",
          food_source: "TACO" as const,
          food_ref_id: String(ing.taco_number),
          ai_suggested: true as const,
        }));
      if (items.length) {
        meals.push({ mealKey: entry.llmMeal.mealKey, name: entry.recipe.title, suggested_time: entry.requested.suggestedTime, source_recipe_id: entry.recipe.id, items, needsReview: [] });
        return;
      }
      warnings.push({ level: "warning", mealKey: entry.llmMeal.mealKey, message: `Receita "${entry.recipe.title}" não resultou em ingredientes calculáveis.` });
      return;
    }

    const items: DraftMealItem[] = [];
    const needsReview: DraftMealNeedsReview[] = [];
    entry.llmMeal.items.forEach((candidate, itemIndex) => {
      const resolution = resolutions.get(`${mealIndex}:${itemIndex}`);
      if (!resolution) return;
      const { item, needsReview: review } = resolutionToMealParts(resolution, String(candidate.quantity), candidate.unit);
      if (item) items.push(item);
      if (review) needsReview.push(review);
      if (resolution.status !== "RESOLVED") {
        warnings.push({ level: resolution.status === "CLINICAL_UNKNOWN" ? "info" : "warning", mealKey: entry.llmMeal.mealKey, message: resolution.reason });
      }
    });

    if (!items.length && !needsReview.length) {
      warnings.push({ level: "warning", mealKey: entry.llmMeal.mealKey, message: `Nenhum alimento proposto para ${MEAL_KEY_LABELS[entry.llmMeal.mealKey]}.` });
      return;
    }
    meals.push({ mealKey: entry.llmMeal.mealKey, name: MEAL_KEY_LABELS[entry.llmMeal.mealKey], suggested_time: entry.requested.suggestedTime, source_recipe_id: null, items, needsReview });
  });

  if (!meals.length) warnings.push({ level: "warning", message: "Não foi possível montar nenhuma refeição — tente novamente ou continue manualmente." });
  return { meals, warnings };
}

/** Regenera SÓ uma refeição do draft (seção 20 do pedido) — recebe as outras refeições como contexto (evitar repetição) e devolve o draft inteiro com só essa refeição substituída. */
export async function regenerateMealInDraft(
  input: GenerateMealPlanDraftInput & { mealKey: MealKey; currentMeals: DraftMeal[] }
): Promise<MealPlanDraftResult> {
  const requestedMeals: RequestedMeal[] = [{ key: input.mealKey, suggestedTime: input.requestedMeals.find((m) => m.key === input.mealKey)?.suggestedTime ?? null }];
  // mealKey (não o nome de exibição, que vira título de receita quando
  // source_recipe_id está presente) identifica com precisão qual refeição
  // é a alvo, mesmo com múltiplas refeições de nomes parecidos.
  const otherMeals = input.currentMeals.filter((meal) => meal.mealKey !== input.mealKey);
  const singleMealDraft = await generateMealPlanDraft({ ...input, requestedMeals, otherMealsContext: otherMeals });
  const replacementMeal = singleMealDraft.meals[0] ?? null;
  if (!replacementMeal) return { meals: input.currentMeals, warnings: singleMealDraft.warnings };

  const hadTarget = input.currentMeals.some((meal) => meal.mealKey === input.mealKey);
  const nextMeals = hadTarget
    ? input.currentMeals.map((meal) => (meal.mealKey === input.mealKey ? replacementMeal : meal))
    : [...input.currentMeals, replacementMeal];
  return { meals: nextMeals, warnings: singleMealDraft.warnings };
}

// ── Refinamento por linguagem natural sobre o DRAFT (nunca sobre o plano
// real — nada aqui e persistido; quem chama decide se aplica o resultado). ─
const draftOperationSchema = z.discriminatedUnion("operation", [
  z.object({ operation: z.literal("add_item"), mealIndex: z.number().int().min(0), item: draftFoodItemSchema }).strict(),
  z.object({ operation: z.literal("remove_item"), mealIndex: z.number().int().min(0), itemIndex: z.number().int().min(0) }).strict(),
  z.object({ operation: z.literal("replace_item"), mealIndex: z.number().int().min(0), itemIndex: z.number().int().min(0), item: draftFoodItemSchema }).strict(),
  z.object({ operation: z.literal("change_quantity"), mealIndex: z.number().int().min(0), itemIndex: z.number().int().min(0), quantity: z.number().positive().max(5000) }).strict(),
  z.object({ operation: z.literal("remove_meal"), mealIndex: z.number().int().min(0) }).strict(),
  z.object({ operation: z.literal("change_time"), mealIndex: z.number().int().min(0), suggestedTime: z.string().max(10).nullable() }).strict(),
]);

const refineOperationsSchema = z.object({ operations: z.array(draftOperationSchema).min(1).max(10) }).strict();

const REFINE_SYSTEM_PROMPT = `Você recebe um rascunho de plano alimentar (refeições indexadas a partir de 0, itens indexados a partir de 0 dentro de cada refeição) e um pedido em linguagem natural da nutricionista.

Traduza o pedido em uma lista pequena de OPERAÇÕES ESTRUTURADAS sobre esse rascunho — nunca em texto livre, nunca em valores nutricionais (kcal/macros não existem no schema). Use os índices EXATOS mostrados no rascunho.

Formato de resposta OBRIGATÓRIO — responda APENAS este JSON, sem markdown, sem texto antes ou depois:
{"operations":[
  {"operation":"add_item","mealIndex":0,"item":{"query":"banana prata","quantity":100,"unit":"g"}},
  {"operation":"remove_item","mealIndex":0,"itemIndex":1},
  {"operation":"replace_item","mealIndex":0,"itemIndex":1,"item":{"query":"mamão","quantity":150,"unit":"g"}},
  {"operation":"change_quantity","mealIndex":0,"itemIndex":1,"quantity":200},
  {"operation":"remove_meal","mealIndex":2},
  {"operation":"change_time","mealIndex":0,"suggestedTime":"07:30"}
]}

Cada objeto no array "operations" tem "operation" mais SÓ os campos do exemplo correspondente acima — nunca misture campos de operações diferentes, nunca invente um campo novo. "quantity" é sempre um NÚMERO json, nunca string. "mealIndex"/"itemIndex" são sempre números inteiros, nunca strings. Para pedidos como "aumente a proteína" ou "deixe mais leve", ajuste QUANTIDADES de itens já existentes (change_quantity) em vez de trocar alimentos, a menos que o pedido peça uma troca explícita.`;

export interface RefineMealPlanDraftInput {
  clientId: string;
  adminId?: string | null;
  currentMeals: DraftMeal[];
  instruction: string;
}

function formatDraftForPrompt(meals: DraftMeal[]): string {
  return meals.map((meal, mealIndex) => {
    const itemsText = meal.items.map((item, itemIndex) => `  [${itemIndex}] ${item.displayName} — ${item.quantity} ${item.unit}`).join("\n");
    return `Refeição [${mealIndex}] ${meal.name}${meal.suggested_time ? ` (${meal.suggested_time})` : ""}:\n${itemsText || "  (sem itens)"}`;
  }).join("\n\n");
}

export async function refineMealPlanDraft(input: RefineMealPlanDraftInput): Promise<MealPlanDraftResult> {
  if (!input.currentMeals.length) throw new Error("Nenhum rascunho para refinar.");

  const markers = await listPatientClinicalMarkers(input.clientId);

  let data: z.infer<typeof refineOperationsSchema>;
  try {
    const result = await generateStructuredResult({
      agent: "meal-plan-draft-refine",
      adminId: input.adminId,
      system: REFINE_SYSTEM_PROMPT,
      prompt: `RASCUNHO_ATUAL:\n${formatDraftForPrompt(input.currentMeals)}\n\nPEDIDO: ${input.instruction}`,
      schema: refineOperationsSchema,
      maxOutputTokens: 1200,
      timeoutMs: 25_000,
    });
    data = result.data;
  } catch (cause) {
    if (cause instanceof AiConfigError || cause instanceof AiProviderError || cause instanceof AiValidationError) throw cause;
    throw cause;
  }

  return applyDraftOperations(input.currentMeals, data.operations, markers);
}

export async function applyDraftOperations(
  meals: DraftMeal[],
  operations: z.infer<typeof draftOperationSchema>[],
  markers: PatientClinicalMarker[]
): Promise<MealPlanDraftResult> {
  const warnings: DraftWarning[] = [];
  let next = meals.map((meal) => ({ ...meal, items: meal.items.map((item) => ({ ...item })), needsReview: meal.needsReview.map((entry) => ({ ...entry })) }));

  for (const op of operations) {
    if (op.mealIndex < 0 || op.mealIndex >= next.length) {
      warnings.push({ level: "warning", message: `Operação "${op.operation}" referenciou uma refeição inexistente — ignorada.` });
      continue;
    }
    const meal = next[op.mealIndex];
    const mealKey = meal.name;

    if (op.operation === "remove_meal") {
      next = next.filter((_, index) => index !== op.mealIndex);
      continue;
    }
    if (op.operation === "change_time") {
      meal.suggested_time = op.suggestedTime;
      continue;
    }
    if (op.operation === "add_item") {
      const resolution = await resolveFoodCandidate(op.item.query, markers);
      const { item, needsReview } = resolutionToMealParts(resolution, String(op.item.quantity), op.item.unit);
      if (resolution.status !== "RESOLVED") warnings.push({ level: resolution.status === "CLINICAL_UNKNOWN" ? "info" : "warning", mealKey, message: resolution.reason });
      if (item) meal.items = [...meal.items, item];
      if (needsReview) meal.needsReview = [...meal.needsReview, needsReview];
      continue;
    }
    if (op.itemIndex < 0 || op.itemIndex >= meal.items.length) {
      warnings.push({ level: "warning", mealKey, message: `Operação "${op.operation}" referenciou um item inexistente — ignorada.` });
      continue;
    }
    if (op.operation === "remove_item") {
      meal.items = meal.items.filter((_, index) => index !== op.itemIndex);
    } else if (op.operation === "change_quantity") {
      meal.items = meal.items.map((item, index) => index === op.itemIndex ? { ...item, quantity: String(op.quantity) } : item);
    } else if (op.operation === "replace_item") {
      const resolution = await resolveFoodCandidate(op.item.query, markers);
      const { item, needsReview } = resolutionToMealParts(resolution, String(op.item.quantity), op.item.unit);
      if (resolution.status !== "RESOLVED") warnings.push({ level: resolution.status === "CLINICAL_UNKNOWN" ? "info" : "warning", mealKey, message: resolution.reason });
      // Conflito/ambiguidade no replace: mantem o item original em vez de
      // apagar (uma substituicao que resultaria em remocao silenciosa seria
      // mais confusa que so nao aplicar a troca) — o aviso ja avisa a nutricionista.
      if (item) meal.items = meal.items.map((existing, index) => index === op.itemIndex ? item : existing);
      if (needsReview) meal.needsReview = [...meal.needsReview, needsReview];
    }
  }

  return { meals: next, warnings };
}

// ── Tool do assistente de chat (risk: read) ──────────────────────────────
// Mesma funcao/engine do wizard "Criar com IA" (nunca uma segunda logica
// paralela) — so muda o ponto de entrada: a nutricionista pode pedir por
// conversa ("crie um pre-plano de emagrecimento pra este paciente") em vez
// de passar pelas etapas do wizard. risk="read" porque a tool NUNCA
// persiste nada — devolve so um rascunho pra revisao humana, exatamente
// como a etapa de revisao do wizard; aplicar ao plano de verdade continua
// exigindo o clique explicito "Aplicar ao editor" -> "Salvar rascunho"/
// "Ativar no portal", nunca a partir do chat.
export const GENERATE_MEAL_PLAN_DRAFT_TOOL_NAME = "generateMealPlanDraft";

export const generateMealPlanDraftToolInputSchema = z.object({
  clientId: z.string().min(1),
  objectiveLabel: z.string().min(1).max(160),
  targetEnergyKcal: z.number().positive().max(20000).nullable().optional(),
  targetProteinG: z.number().positive().max(2000).nullable().optional(),
  targetCarbohydrateG: z.number().positive().max(2000).nullable().optional(),
  targetFatG: z.number().positive().max(2000).nullable().optional(),
  requestedMeals: z.array(z.object({
    key: z.enum(MEAL_KEYS),
    suggestedTime: z.string().max(10).nullable().optional(),
  })).min(1).max(6),
  prioritizeFoods: z.string().max(400).nullable().optional(),
  avoidFoods: z.string().max(400).nullable().optional(),
  useRecipes: z.boolean().optional(),
}).strict();

export type GenerateMealPlanDraftToolInput = z.infer<typeof generateMealPlanDraftToolInputSchema>;

export async function executeGenerateMealPlanDraft(input: GenerateMealPlanDraftToolInput): Promise<MealPlanDraftResult> {
  return generateMealPlanDraft({
    clientId: input.clientId,
    objectiveLabel: input.objectiveLabel,
    targetEnergyKcal: input.targetEnergyKcal ?? null,
    targetProteinG: input.targetProteinG ?? null,
    targetCarbohydrateG: input.targetCarbohydrateG ?? null,
    targetFatG: input.targetFatG ?? null,
    requestedMeals: input.requestedMeals.map((meal) => ({ key: meal.key, suggestedTime: meal.suggestedTime ?? null })),
    prioritizeFoods: input.prioritizeFoods ?? null,
    avoidFoods: input.avoidFoods ?? null,
    useRecipes: input.useRecipes ?? true,
  });
}

export type { Client };
