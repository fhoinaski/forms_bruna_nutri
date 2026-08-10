/**
 * Classificacao de risco das acoes/tools que o assistente de IA pode executar.
 *
 * - read: consulta dados existentes, nao muda nada. Executa automaticamente.
 * - low: efeito colateral reversivel e nao clinico (ex.: navegar de tela). Executa automaticamente.
 * - sensitive: cria/altera dado de negocio nao clinico (agendamento, tarefa, cadastro, conteudo publico).
 *   Sempre exige confirmacao humana antes de aplicar.
 * - clinical: toca prontuario, conduta, protocolo ou qualquer dado de saude do paciente.
 *   Sempre exige confirmacao humana antes de aplicar — sem excecao, independente de instrucao de prompt.
 */
export type ToolRisk = "read" | "low" | "sensitive" | "clinical";

export const TOOL_RISK_ORDER: Record<ToolRisk, number> = {
  read: 0,
  low: 1,
  sensitive: 2,
  clinical: 3,
};

/**
 * Unica fonte de verdade sobre quando uma acao exige confirmacao humana.
 * Nao depende do texto do prompt — mesmo que a IA "esqueca" a instrucao,
 * o codigo nunca aplica uma acao sensitive/clinical sem essa confirmacao.
 */
export function requiresConfirmation(risk: ToolRisk): boolean {
  return risk === "sensitive" || risk === "clinical";
}

export function canAutoExecute(risk: ToolRisk): boolean {
  return risk === "read" || risk === "low";
}

/**
 * Nunca existe (e nunca deve existir) um caminho de codigo que grave direto
 * no banco a partir de uma tool "clinical" sem passar por uma rota REST de
 * negocio real disparada por um clique explicito da nutricionista.
 */
export function assertNeverAutoAppliesClinical(risk: ToolRisk, autoApplied: boolean): void {
  if (risk === "clinical" && autoApplied) {
    throw new Error(
      "Violacao de politica: uma acao clinica nao pode ser aplicada automaticamente pela IA. Isso e um bug, nao uma configuracao."
    );
  }
}
