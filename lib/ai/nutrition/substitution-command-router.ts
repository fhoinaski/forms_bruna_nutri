/**
 * Command router determinístico para pedidos de substituição nutricional
 * feitos ao Assistente em linguagem natural (V3 do fechamento de gaps —
 * blocker A: o modelo às vezes reconhecia a intenção mas nunca chamava
 * proposeMealPlanChange, respondendo só "vou montar a proposta..."). Em vez
 * de depender do modelo decidir chamar a tool certa, este módulo CLASSIFICA
 * a mensagem de forma determinística (regex pequenas, nunca uma IA) e, para
 * escrita inequívoca, resolve e monta a proposta usando o MESMO código
 * determinístico já existente (resolveFoodCandidate(s), executeProposeMealPlanChange,
 * buildProposedAction, persistProposedAction) — nunca grava no repositório
 * diretamente, nunca pula a etapa de proposta/confirmação humana.
 *
 * Escopo deliberadamente pequeno: só reconhece pedidos que mencionam
 * explicitamente substituição/alternativa/opção (nunca intercepta um
 * "adicione arroz no almoço" comum, que continua indo pro fluxo normal via
 * LLM). Qualquer coisa fora desse escopo classifica como NONE e o chamador
 * deve seguir o fluxo antigo (orquestrador + LLM) sem nenhuma mudança.
 */
import { getActiveMealPlan, type MealPlanItemPayload, type MealPlanMealPayload, type MealPlanPayload, type MealPlanSubstitutionPayload } from "@/lib/repositories/meal-plans";
import { listPatientClinicalMarkers } from "@/lib/repositories/patient-clinical-markers";
import { toDisplayFoodName, type FoodResolution } from "@/lib/nutrition/food-resolver";
// FASE 5 (item 1) — mesmo contrato de resolveFoodCandidate, so envolvendo
// com o shadow do resolver canonico (ver lib/nutrition/canonical-food-shadow.ts).
import { resolveFoodWithCanonicalShadow } from "@/lib/nutrition/canonical-food-shadow";
import { toPersistedMealFoodSource, sourceFromMacroReference, getFoodByReference } from "@/lib/nutrition/food-catalog";
import { executeProposeMealPlanChange } from "@/lib/ai/agents/nutrition/meal-plan-change-agent";
import { PROPOSE_MEAL_PLAN_CHANGE_TOOL_NAME } from "@/lib/ai/agents/nutrition/meal-plan-change-agent";
import { buildProposedAction } from "@/lib/ai/tools/proposal-builders";
import { persistProposedAction } from "@/lib/ai/core/proposal-store";
import type { AssistantOption, AssistantResponseEnvelope } from "@/lib/ai/core/ai-response";

type SubstitutionOperation = "add_substitution" | "remove_substitution" | "approve_substitution";

type Classification =
  | { intent: "NONE" }
  | { intent: "READ" }
  | { intent: "AMBIGUOUS"; reason: string }
  | { intent: "WRITE"; operation: SubstitutionOperation; baseFoodText: string | null; candidateFoodText: string };

// Padrões pequenos e explícitos (não uma gramática genérica) — cada um cobre
// uma forma comum de pedir, testados em tests/substitution-command-router.test.ts.
const ADD_PATTERN = /\b(?:adicion\w*|inclu\w*|colo(?:c\w*|que\w*)|acrescent\w*)\s+(.+?)\s+como\s+(?:opç[aã]o\s+de\s+)?(?:substitui[çc][aã]o|alternativa)\s*(?:a[oà]?|de|do|da|para)?\s*(.+)$/i;
const ADD_PATTERN_LIST = /\b(?:adicion\w*|inclu\w*|colo(?:c\w*|que\w*)|acrescent\w*)\s+(.+?)\s+(?:como\s+)?(?:op[çc][oõ]es|alternativas)\s*(?:a[oà]?|de|do|da|para)?\s*(.+)$/i;
const REMOVE_PATTERN = /\b(?:remov\w*|tir\w*|retir\w*|exclu\w*|apag\w*)\s+(.+?)\s+d\w+\s+substitui[çc][oõ]es\s*(?:de|do|da)?\s*(.+)$/i;
const APPROVE_PATTERN = /\b(?:aprov\w*|confirm\w*)\s+(.+?)\s+(?:como\s+substitui[çc][aã]o)?/i;
const READ_PATTERN = /^(?:quais|que|o que|posso trocar|posso substituir|posso usar)\b/i;
const SUBSTITUTION_CONTEXT = /\b(substitui[çc][aã]o(?:es|ões)?|alternativa(?:s)?|op[çc][aã]o(?:oes|ões)?)\b/i;
const CHANGE_INTENT_NO_TARGET = /\b(mudar|troc\w*|alter\w*)\b/i;
const STATEMENT_SWAP = /^(.+?)\s+no\s+lugar\s+(?:de|do|da)\s+(.+)$/i;

function stripTrailingPunctuation(text: string): string {
  return text.replace(/[.!?]+$/g, "").trim();
}

/** Compara nomes de alimento ignorando pontuação/acentos/maiúsculas — só usado localmente para o heurístico de "candidato único de baixa confiança", nunca para resolver identidade. */
function normalizeForComparison(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[.,]/g, "").replace(/\s+/g, " ").trim();
}

/** Classifica uma mensagem isolada (sem histórico) — usada tanto na mensagem atual quanto ao reexaminar o histórico em busca do pedido original. */
export function classifySubstitutionMessage(rawText: string): Classification {
  const text = stripTrailingPunctuation(rawText.trim());
  if (!text) return { intent: "NONE" };

  if (READ_PATTERN.test(text) && SUBSTITUTION_CONTEXT.test(text) === false) {
    // Perguntas tipo "o que posso usar no lugar do X" quase sempre mencionam
    // o alimento, não a palavra "substituição" — READ não exige o substantivo.
    return { intent: "READ" };
  }
  if (READ_PATTERN.test(text)) return { intent: "READ" };

  const addMatch = text.match(ADD_PATTERN) ?? text.match(ADD_PATTERN_LIST);
  if (addMatch) {
    return { intent: "WRITE", operation: "add_substitution", candidateFoodText: addMatch[1].trim(), baseFoodText: addMatch[2].trim() };
  }

  const removeMatch = text.match(REMOVE_PATTERN);
  if (removeMatch) {
    return { intent: "WRITE", operation: "remove_substitution", candidateFoodText: removeMatch[1].trim(), baseFoodText: removeMatch[2].trim() };
  }

  const approveMatch = text.match(APPROVE_PATTERN);
  if (approveMatch && SUBSTITUTION_CONTEXT.test(text)) {
    return { intent: "WRITE", operation: "approve_substitution", candidateFoodText: approveMatch[1].trim(), baseFoodText: null };
  }

  // Contém vocabulário de substituição mas nenhum padrão estruturado bateu —
  // não é seguro nem chutar NONE (deixaria o LLM narrar sem agir) nem
  // inventar uma operação. Pede esclarecimento de forma determinística.
  if (SUBSTITUTION_CONTEXT.test(text)) {
    return { intent: "AMBIGUOUS", reason: "Entendi que você quer mexer nas opções de substituição, mas não identifiquei claramente o quê fazer. Pode reformular? Ex.: \"adicione batata como substituição do arroz\"." };
  }

  if (STATEMENT_SWAP.test(text)) {
    return { intent: "AMBIGUOUS", reason: "Você quer adicionar isso como uma opção de substituição? Se sim, me diga algo como \"adicione [alimento] como substituição do [alimento prescrito]\"." };
  }

  if (CHANGE_INTENT_NO_TARGET.test(text)) {
    return { intent: "AMBIGUOUS", reason: "O que exatamente você quer mudar? Pode ser trocar o alimento, ajustar a quantidade, ou adicionar uma opção de substituição — me diga qual." };
  }

  return { intent: "NONE" };
}

/**
 * Reexamina o histórico pra continuar uma operação pendente (FASE 6): se a
 * mensagem atual sozinha não classifica como WRITE nem AMBIGUOUS (ex.: só
 * "Batata inglesa cozida." respondendo a uma pergunta de esclarecimento),
 * procura a última mensagem do usuário classificada como WRITE ou AMBIGUOUS
 * pra reaproveitar o baseFoodText/operation, usando a mensagem atual como
 * candidateFoodText — sem exigir a nutricionista repetir o comando inteiro.
 * Não usa nenhum estado persistido — só o histórico que o cliente já envia.
 */
export function classifySubstitutionIntent(
  messages: { role: "user" | "assistant"; content: string }[]
): Classification {
  if (!messages.length) return { intent: "NONE" };
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  if (!lastUser) return { intent: "NONE" };

  const direct = classifySubstitutionMessage(lastUser.content);
  if (direct.intent !== "NONE") return direct;

  // Mensagem atual não bateu nenhum padrão sozinha — só tenta reaproveitar
  // contexto se a resposta anterior do assistente veio de uma AMBIGUOUS
  // deste próprio router (nunca de uma pergunta qualquer da IA).
  const lastUserIndex = messages.lastIndexOf(lastUser);
  const priorAssistant = messages[lastUserIndex - 1];
  if (!priorAssistant || priorAssistant.role !== "assistant" || !priorAssistant.content.includes("[[substitution-router-clarify]]")) {
    return { intent: "NONE" };
  }
  // Acha a última mensagem do usuário ANTES dessa, que foi classificada WRITE.
  for (let i = lastUserIndex - 1; i >= 0; i -= 1) {
    if (messages[i].role !== "user") continue;
    const previous = classifySubstitutionMessage(messages[i].content);
    if (previous.intent === "WRITE") {
      return { ...previous, candidateFoodText: lastUser.content.trim() ? stripTrailingPunctuation(lastUser.content) : previous.candidateFoodText };
    }
  }
  return { intent: "NONE" };
}

export interface SubstitutionCommandContext {
  clientId: string;
  adminId: string;
}

/**
 * Marcador invisível (não aparece pro usuário — a UI já renderiza `message`
 * como markdown/texto puro, nunca mostrando comentários HTML) usado só pra
 * classifySubstitutionIntent reconhecer, no próximo turno, que a pergunta
 * anterior veio deste router — nunca por um heurística de texto frágil tipo
 * "a resposta continha um ponto de interrogação".
 */
const CLARIFY_MARKER = "\n\n<!-- [[substitution-router-clarify]] -->";

function findMealAndItemByFoodText(plan: MealPlanPayload, foodText: string): { meal: MealPlanMealPayload; item: MealPlanItemPayload; index: number }[] {
  const needle = foodText.toLowerCase();
  const matches: { meal: MealPlanMealPayload; item: MealPlanItemPayload; index: number }[] = [];
  for (const meal of plan.meals) {
    meal.items.forEach((item, index) => {
      if (item.food.toLowerCase().includes(needle) || needle.includes(item.food.toLowerCase().split(",")[0].trim())) {
        matches.push({ meal, item, index });
      }
    });
  }
  return matches;
}

function findExistingSubstitution(plan: MealPlanPayload, candidateText: string, baseFoodText: string | null): MealPlanSubstitutionPayload[] {
  const needle = candidateText.toLowerCase();
  return plan.substitutions.filter((sub) => {
    const matchesCandidate = sub.option_food.toLowerCase().includes(needle) || needle.includes(sub.option_food.toLowerCase().split(",")[0].trim());
    if (!matchesCandidate) return false;
    if (!baseFoodText) return true;
    const baseNeedle = baseFoodText.toLowerCase();
    return sub.base_food.toLowerCase().includes(baseNeedle) || baseNeedle.includes(sub.base_food.toLowerCase().split(",")[0].trim());
  });
}

function clarify(reason: string): AssistantResponseEnvelope {
  return { message: reason + CLARIFY_MARKER.replace(/\n\n/, " ") };
}

function optionsFromCandidates(candidates: FoodResolution["candidates"]): AssistantOption[] {
  return candidates.slice(0, 5).map((c) => ({ id: `${c.ref.source}:${c.ref.sourceId}`, label: c.displayName }));
}

/**
 * Ponto de entrada chamado pelo orquestrador ANTES do loop do LLM. Retorna
 * `null` se a mensagem não é sobre substituições (o chamador deve seguir o
 * fluxo normal, sem nenhuma mudança de comportamento). Se retornar um
 * envelope, o turno termina AQUI — nunca chama o modelo pra esse pedido.
 */
export async function tryHandleSubstitutionCommand(
  messages: { role: "user" | "assistant"; content: string }[],
  ctx: SubstitutionCommandContext
): Promise<AssistantResponseEnvelope | null> {
  const classification = classifySubstitutionIntent(messages);
  if (classification.intent === "NONE" || classification.intent === "READ") return null;
  if (classification.intent === "AMBIGUOUS") return clarify(classification.reason);

  const plan = await getActiveMealPlan(ctx.clientId);
  if (!plan) {
    return clarify("Este cliente ainda não tem um plano alimentar ativo — substituições só podem ser adicionadas a um plano ativo. Peça pra ativar o plano primeiro, ou use o editor pra criar um.");
  }

  const { operation, baseFoodText, candidateFoodText } = classification;

  if (operation === "approve_substitution" || operation === "remove_substitution") {
    const existing = findExistingSubstitution(plan, candidateFoodText, baseFoodText);
    if (existing.length === 0) {
      return clarify(`Não encontrei nenhuma substituição com "${candidateFoodText}"${baseFoodText ? ` para "${baseFoodText}"` : ""} neste plano.`);
    }
    if (existing.length > 1) {
      return clarify(`Encontrei mais de uma substituição parecida com "${candidateFoodText}" — pode ser mais específica (qual refeição/alimento prescrito)?`);
    }
    const sub = existing[0];
    if (
      !sub.base_food_source || !sub.base_food_ref_id || !sub.option_food_source || !sub.option_food_ref_id ||
      sub.option_food_source === "USDA"
    ) {
      return clarify(`Essa substituição foi cadastrada sem vínculo estruturado ao catálogo — só é possível ${operation === "approve_substitution" ? "aprovar" : "remover"} pelo editor do plano.`);
    }
    const match = findMealAndItemByFoodText(plan, sub.base_food);
    if (match.length !== 1) {
      return clarify(`Não consegui identificar de forma inequívoca o item "${sub.base_food}" no plano atual — use o editor pra essa alteração.`);
    }
    return proposeAndReturn(ctx, plan, {
      operation,
      mealId: match[0].meal.id!,
      itemId: match[0].item.id!,
      optionFoodSource: sub.option_food_source,
      optionFoodRefId: sub.option_food_ref_id,
    });
  }

  // add_substitution
  if (!baseFoodText) return clarify("Qual alimento prescrito você quer que essa opção substitua?");
  const baseMatches = findMealAndItemByFoodText(plan, baseFoodText);
  if (baseMatches.length === 0) {
    return clarify(`Não encontrei "${baseFoodText}" no plano alimentar ativo. Confira o nome do alimento prescrito.`);
  }
  if (baseMatches.length > 1) {
    return clarify(`Encontrei mais de um item parecido com "${baseFoodText}" no plano (${baseMatches.map((m) => `${m.item.food} — ${m.meal.name}`).join("; ")}) — qual deles?`);
  }
  const base = baseMatches[0];

  const markers = await listPatientClinicalMarkers(ctx.clientId);
  let resolution = await resolveFoodWithCanonicalShadow(candidateFoodText, markers);

  // scoreText (lib/nutrition/food-catalog.ts) só aceita rank 0 (exato) se o
  // texto bater literalmente com "Alimento, atributo1, atributo2" — texto
  // livre digitado sem as vírgulas do catálogo (o normal em linguagem
  // natural) cai pra rank 4 e vira AMBIGUOUS mesmo com um único candidato.
  // Não altera o resolver compartilhado (usado em várias outras telas) —
  // só reconsulta com o nome técnico exato do único candidato encontrado,
  // reaproveitando 100% da mesma lógica de segurança clínica do resolver.
  if (resolution.status === "AMBIGUOUS" && resolution.candidates.length === 1 && normalizeForComparison(resolution.candidates[0].displayName) === normalizeForComparison(candidateFoodText)) {
    resolution = await resolveFoodWithCanonicalShadow(resolution.candidates[0].name, markers);
  }

  if (resolution.status === "AMBIGUOUS") {
    const envelope = clarify(`A busca por "${candidateFoodText}" trouxe mais de uma opção — qual delas? ${resolution.candidates.map((c) => c.displayName).join(", ")}.`);
    envelope.options = optionsFromCandidates(resolution.candidates);
    return envelope;
  }
  if (resolution.status === "NOT_FOUND") {
    return clarify(`Não encontrei "${candidateFoodText}" na base de alimentos.`);
  }
  if (resolution.status === "CLINICAL_CONFLICT") {
    return clarify(`"${resolution.name}" conflita com uma restrição/alergia cadastrada deste cliente — não posso propor como substituição. ${resolution.reason}`);
  }
  if (resolution.status === "CLINICAL_UNKNOWN") {
    return clarify(`Não consegui confirmar a segurança clínica de "${resolution.name}" para este cliente — revise manualmente pelo editor antes de adicionar.`);
  }

  const persistedSource = toPersistedMealFoodSource(sourceFromMacroReference((await getFoodByReference(resolution.ref!))!.macroReference));
  if (!persistedSource) {
    return clarify(`"${resolution.displayName}" não tem uma fonte que o plano alimentar suporta como substituição.`);
  }

  return proposeAndReturn(ctx, plan, {
    operation: "add_substitution",
    mealId: base.meal.id!,
    itemId: base.item.id!,
    optionFood: { foodName: resolution.name!, source: persistedSource, refId: resolution.ref!.sourceId },
  });
}

async function proposeAndReturn(
  ctx: SubstitutionCommandContext,
  plan: MealPlanPayload,
  operation:
    | { operation: "add_substitution"; mealId: string; itemId: string; optionFood: { foodName: string; source: "TACO" | "CUSTOM" | "MANUFACTURER"; refId: string } }
    | { operation: "remove_substitution" | "approve_substitution"; mealId: string; itemId: string; optionFoodSource: "TACO" | "CUSTOM" | "MANUFACTURER"; optionFoodRefId: string }
): Promise<AssistantResponseEnvelope> {
  const output = await executeProposeMealPlanChange({
    mealPlanId: plan.id,
    baseVersion: plan.version,
    changes: [operation as Parameters<typeof executeProposeMealPlanChange>[0]["changes"][number]],
  });
  if ("error" in output) {
    return { message: `Não foi possível preparar a proposta: ${output.error}` };
  }
  const built = buildProposedAction(PROPOSE_MEAL_PLAN_CHANGE_TOOL_NAME, { mealPlanId: plan.id, baseVersion: plan.version, changes: [] }, { clientId: ctx.clientId }, output);
  if (!built) {
    return { message: "Não foi possível preparar a proposta — tente novamente pelo editor do plano." };
  }
  const proposedAction = await persistProposedAction(ctx.adminId, PROPOSE_MEAL_PLAN_CHANGE_TOOL_NAME, built, { clientId: ctx.clientId });
  return {
    message: "Preparei uma proposta de substituição. Revise os campos abaixo antes de confirmar — a quantidade foi calculada pela engine de equivalência, nunca por mim.",
    proposedAction,
  };
}
