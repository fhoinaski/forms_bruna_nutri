/**
 * R5 — Contrato de prontidão do Clinical Copilot (seções 3-6 do pedido).
 * Módulo puro (sem I/O, sem import de repositório) pra poder ser
 * reaproveitado tanto no servidor quanto no cliente (o wizard já busca o
 * mesmo contexto clínico determinístico via `/draft/context` — este módulo
 * só decide, a partir desse MESMO objeto, se é seguro propor uma
 * geração).
 *
 * Três estados explícitos — nunca um booleano "pronto/não pronto" (perderia
 * a distinção entre "não gera nada" e "gera, mas com pontos pra revisar"):
 * - NOT_READY: dado crítico ausente demais pra propor qualquer estrutura
 *   com segurança — o Copilot nunca gera nada neste estado (seção 4).
 * - READY_WITH_REVIEW: dá pra gerar, mas falta algo que merece atenção da
 *   nutricionista antes de confiar cegamente na proposta (seção 5).
 * - READY: dados críticos presentes (seção 6).
 */
export type MealPlanReadinessStatus = "NOT_READY" | "READY_WITH_REVIEW" | "READY";

export interface MealPlanReadinessInput {
  ageYears: number | null;
  weightKg: string | null;
  heightDisplay: string | null;
  /** Objetivos clínicos registrados (nutrition_records.goals) — nunca inventado, só o que já está no prontuário. */
  goals: string | null;
  /**
   * `null` = o registro de nutrição nunca foi preenchido (campo nunca
   * revisado, distinto de "revisado e vazio") — ver
   * `lib/repositories/nutrition-records.ts`. Como o modelo de dados atual
   * não distingue "revisado, sem alergias" de "nunca perguntado" nesses
   * dois campos, tratamos `null` como "ainda não revisado" — decisão
   * deliberadamente conservadora (mais segura clinicamente que assumir
   * "sem restrições" por omissão).
   */
  allergies: string | null;
  restrictions: string | null;
}

export interface MealPlanReadinessResult {
  status: MealPlanReadinessStatus;
  /** Motivos legíveis (nunca códigos internos) — usados diretamente na UI, nunca reformulados lá. */
  reasons: string[];
}

const NOT_READY_MESSAGE = "Faltam informações para gerar uma proposta segura.";

export function computeMealPlanReadiness(input: MealPlanReadinessInput): MealPlanReadinessResult {
  const hasAge = input.ageYears !== null;
  const hasWeight = Boolean(input.weightKg?.trim());
  const hasHeight = Boolean(input.heightDisplay?.trim());
  const hasAnthropometry = hasWeight && hasHeight;
  const hasGoals = Boolean(input.goals?.trim());
  const allergiesReviewed = input.allergies !== null;
  const restrictionsReviewed = input.restrictions !== null;

  // NOT_READY (seção 4): nem antropometria (peso+altura) nem objetivo
  // clínico registrado — idade sozinha (quase sempre disponível via data de
  // nascimento) não é suficiente pra propor uma estrutura com segurança;
  // sem peso/altura OU um objetivo, não há nenhuma base real pra ancorar
  // porções/estrutura, e propor aqui seria inventar contexto que não existe.
  if (!hasAnthropometry && !hasGoals) {
    return {
      status: "NOT_READY",
      reasons: [
        NOT_READY_MESSAGE,
        "Nenhuma antropometria (peso/altura) ou objetivo clínico cadastrado ainda.",
      ],
    };
  }

  const reviewReasons: string[] = [];
  if (!hasAnthropometry) reviewReasons.push("Antropometria incompleta (peso e/ou altura não cadastrados).");
  if (!hasGoals) reviewReasons.push("Nenhum objetivo clínico registrado no prontuário.");
  if (!allergiesReviewed) reviewReasons.push("Alergias ainda não foram revisadas no prontuário.");
  if (!restrictionsReviewed) reviewReasons.push("Restrições alimentares ainda não foram revisadas no prontuário.");
  if (!hasAge) reviewReasons.push("Idade não pôde ser calculada (data de nascimento ausente).");

  if (reviewReasons.length) {
    return { status: "READY_WITH_REVIEW", reasons: reviewReasons };
  }

  return { status: "READY", reasons: [] };
}
