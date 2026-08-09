// Database structure lives in immutable SQL migrations under db/.
// Runtime repository types remain close to each feature under lib/repositories.

export const PROTOCOL_TEMPLATE_TYPES = [
  "DIETA",
  "SUPLEMENTACAO",
  "SUBSTITUICAO",
] as const;

export const PROTOCOL_TEMPLATE_TARGET_GROUPS = [
  "EMAGRECIMENTO",
  "HIPERTROFIA",
  "IDOSO",
  "GESTANTE",
  "ADULTO_SAUDAVEL",
  "CRIANCA",
  "TEA",
  "SOP",
  "VEGETARIANO_ESTRITO",
  "ENDURANCE",
  "RESISTENCIA_INSULINA",
  "BARIATRICO",
  "RENAL",
  "ONCOLOGICO",
] as const;

export type ProtocolTemplateType = typeof PROTOCOL_TEMPLATE_TYPES[number];
export type ProtocolTemplateTargetGroup = typeof PROTOCOL_TEMPLATE_TARGET_GROUPS[number];

export const AI_PROVIDERS = ["openai", "anthropic", "google"] as const;
export type AIProvider = typeof AI_PROVIDERS[number];
