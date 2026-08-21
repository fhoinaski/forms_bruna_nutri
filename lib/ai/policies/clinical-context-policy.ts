/**
 * Minimizacao de dados por finalidade — camada central que decide QUAIS
 * categorias de dado uma finalidade de IA pode consumir, antes de qualquer
 * agente montar um prompt. Nao substitui `sanitizeClinicalContext`
 * (lib/ai/privacy/sanitize-context.ts, que trata O CONTEUDO como dado nunca
 * instrucao) — resolve um problema diferente: nao deixar um agente/tool
 * novo incluir, por engano, uma categoria de dado que aquela finalidade
 * nunca deveria ver (ex.: telefone/e-mail/financeiro numa finalidade
 * clinica).
 *
 * Nao e enforcement magico automatico — o TypeScript nao infere sozinho
 * "este texto pertence a categoria X". E uma checklist EXECUTAVEL e
 * TESTAVEL: cada ponto que monta contexto para uma finalidade chama
 * `assertCategoryAllowed(purpose, category)` antes de incluir o bloco
 * correspondente. Falha fechado — categoria/finalidade desconhecida nunca
 * e permitida por omissao.
 */

export type ClinicalDataCategory =
  | "identity"
  | "anthropometry"
  | "evolution"
  | "meal_plan"
  | "protocol"
  | "tasks"
  | "exams_text"
  | "notes_free_text"
  | "contact_info"
  | "financial";

export type ConsultationPurpose =
  | "consultation_brief"
  | "weight_evolution"
  | "notes_organization"
  | "meal_plan_review"
  | "protocol_review"
  | "exams_summary";

/**
 * Fonte de verdade: para cada finalidade, exatamente as categorias que ela
 * pode consumir. `contact_info` (telefone/e-mail) e `financial` nunca
 * aparecem em nenhuma finalidade clinica — se um caso de uso futuro
 * realmente precisar disso, a decisao de adicionar precisa ser deliberada
 * aqui, nunca um efeito colateral de "enviar tudo que tiver disponivel".
 */
export const CONTEXT_POLICIES: Record<ConsultationPurpose, readonly ClinicalDataCategory[]> = {
  consultation_brief: ["identity", "anthropometry", "evolution", "meal_plan", "protocol", "tasks"],
  weight_evolution: ["identity", "anthropometry", "evolution"],
  notes_organization: ["identity", "notes_free_text"],
  // "anthropometry" adicionado deliberadamente (nao um efeito colateral) para
  // o gerador de pre-plano com IA: peso/altura/IMC sao necessarios pra
  // propor uma estrutura de refeicoes clinicamente razoavel, mesma
  // categoria ja concedida a consultation_brief pelo mesmo motivo.
  meal_plan_review: ["identity", "anthropometry", "meal_plan"],
  protocol_review: ["identity", "protocol"],
  exams_summary: ["identity", "exams_text"],
};

export function isCategoryAllowed(purpose: ConsultationPurpose, category: ClinicalDataCategory): boolean {
  const allowed = CONTEXT_POLICIES[purpose];
  return Array.isArray(allowed) && allowed.includes(category);
}

export class ClinicalContextPolicyViolation extends Error {
  constructor(purpose: string, category: string) {
    super(`Politica de minimizacao de dados violada: finalidade "${purpose}" nao pode incluir a categoria "${category}".`);
    this.name = "ClinicalContextPolicyViolation";
  }
}

/** Falha fechado: lanca se a categoria nao estiver explicitamente permitida para a finalidade. */
export function assertCategoryAllowed(purpose: ConsultationPurpose, category: ClinicalDataCategory): void {
  if (!isCategoryAllowed(purpose, category)) {
    throw new ClinicalContextPolicyViolation(purpose, category);
  }
}

/** Filtra um registro de blocos de contexto, mantendo so as chaves cuja categoria e permitida para a finalidade — util para montar o prompt final sem `if` repetido por campo. */
export function filterAllowedCategories<T extends Partial<Record<ClinicalDataCategory, unknown>>>(
  purpose: ConsultationPurpose,
  data: T
): Partial<T> {
  const allowed = CONTEXT_POLICIES[purpose] ?? [];
  const result: Partial<T> = {};
  for (const category of allowed) {
    if (category in data) {
      result[category as keyof T] = data[category as keyof T];
    }
  }
  return result;
}
