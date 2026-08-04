// Schema moved to db/schema.sql (Cloudflare D1).
// Repository types are defined close to each feature under lib/repositories.

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
] as const;

export type ProtocolTemplateType = typeof PROTOCOL_TEMPLATE_TYPES[number];
export type ProtocolTemplateTargetGroup = typeof PROTOCOL_TEMPLATE_TARGET_GROUPS[number];
