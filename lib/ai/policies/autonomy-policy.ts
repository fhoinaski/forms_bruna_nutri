import { canAutoExecute, requiresConfirmation, type ToolRisk } from "@/lib/ai/policies/action-policy";

/**
 * Resultado da avaliacao de autonomia para uma chamada de tool concreta.
 * O orquestrador usa isso para decidir se o resultado de uma tool vira uma
 * "acao concluida" (read/low) ou uma "proposta aguardando confirmacao"
 * (sensitive/clinical) na resposta ao frontend.
 */
export interface AutonomyDecision {
  risk: ToolRisk;
  autoExecuted: boolean;
  requiresConfirmation: boolean;
}

export function evaluateAutonomy(risk: ToolRisk): AutonomyDecision {
  return {
    risk,
    autoExecuted: canAutoExecute(risk),
    requiresConfirmation: requiresConfirmation(risk),
  };
}

/**
 * Regra central e obrigatoria do copiloto:
 *   LER → RACIOCINAR → PROPOR (autonomo)
 *   PROPOSTA CLINICA/SENSIVEL → CONFIRMACAO HUMANA → EXECUCAO (nunca autonomo)
 * Documentado aqui para nao depender so de instrucao de prompt — ver
 * lib/ai/policies/action-policy.ts para o enforcement em codigo.
 */
export const AUTONOMY_RULE_DESCRIPTION =
  "IA le e propõe livremente. Ações sensitive ou clinical nunca são aplicadas sozinhas — sempre exigem confirmação humana explícita antes de qualquer escrita real no banco.";
