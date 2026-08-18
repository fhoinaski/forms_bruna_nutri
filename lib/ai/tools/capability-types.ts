/**
 * Taxonomia de dominio/entidade usada pelo tool registry (lib/ai/tools/registry.ts)
 * para gerar o capability manifest (lib/ai/tools/capability-manifest.ts). Nao afeta
 * risco/permissao — isso continua sendo `ToolRisk` (action-policy.ts) e `profiles`
 * (permissions.ts). Este arquivo so classifica "de que assunto do CRM" cada tool fala,
 * para descoberta/documentacao — nunca para autorizacao.
 */

export const AGENT_DOMAINS = [
  "navigation",
  "patient",
  "appointment",
  "clinical",
  "meal_plan",
  "food",
  "nutrition_analysis",
  "finance",
  "request",
  "dashboard",
  "analytics",
  "content",
  "document",
  "configuration",
  "admin",
] as const;

export type AgentDomain = (typeof AGENT_DOMAINS)[number];

/**
 * Sensibilidade do DADO que a tool le/produz — ortogonal ao `ToolRisk`
 * (action-policy.ts, que decide se uma acao executa sozinha ou exige
 * confirmacao humana). `dataSensitivity` nunca autoriza nem bloqueia nada
 * sozinho; e metadata de descoberta/documentacao e um sinal para o quanto de
 * cuidado de minimizacao/sanitizacao o `execute` daquela tool precisa tomar
 * antes de devolver o resultado ao LLM (FASE 2A do roadmap de operador
 * interno — docs/AI-OPERATOR-AUDIT-ROADMAP.md).
 *
 * - "safe": nao identifica paciente, ou identifica so por nome/id sem
 *   nenhum dado de saude/financeiro/texto livre de paciente junto
 *   (ex.: busca de alimento, horarios livres, metricas agregadas).
 * - "sensitive": identifica um paciente especifico E carrega dado de
 *   negocio (financeiro, agenda com nota livre, resumo/texto de solicitacao)
 *   — nao e prontuario/diagnostico, mas ainda merece minimizacao e, quando
 *   ha texto de origem paciente, sanitizacao anti-prompt-injection.
 * - "clinical": prontuario, marcadores clinicos, plano alimentar terapeutico,
 *   antropometria/evolucao, ou qualquer coisa que hoje já passa (ou deveria
 *   passar) por `sanitizeClinicalContext`/`wrapUntrustedData`.
 */
export const DATA_SENSITIVITY_LEVELS = ["safe", "sensitive", "clinical"] as const;
export type DataSensitivity = (typeof DATA_SENSITIVITY_LEVELS)[number];

export const TOOL_ENTITY_TYPES = [
  "patient",
  "appointment",
  "meal_plan",
  "food",
  "recipe",
  "protocol",
  "nutrition_record",
  "pre_analysis",
  "task",
  "request",
  "opportunity",
  "blog_post",
  "payment",
] as const;

export type ToolEntityType = (typeof TOOL_ENTITY_TYPES)[number];
