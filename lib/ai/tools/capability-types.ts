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
  "content",
  "document",
  "configuration",
  "admin",
] as const;

export type AgentDomain = (typeof AGENT_DOMAINS)[number];

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
