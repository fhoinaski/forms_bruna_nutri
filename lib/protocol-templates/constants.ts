import {
  PROTOCOL_TEMPLATE_TARGET_GROUPS,
  PROTOCOL_TEMPLATE_TYPES,
  type ProtocolTemplateTargetGroup,
  type ProtocolTemplateType,
} from "@/db/schema";

export {
  PROTOCOL_TEMPLATE_TARGET_GROUPS,
  PROTOCOL_TEMPLATE_TYPES,
  type ProtocolTemplateTargetGroup,
  type ProtocolTemplateType,
};

export const PROTOCOL_TEMPLATE_TYPE_LABELS: Record<ProtocolTemplateType, string> = {
  DIETA: "Dieta",
  SUPLEMENTACAO: "Suplementação",
  SUBSTITUICAO: "Substituição",
};

export const PROTOCOL_TEMPLATE_GROUP_LABELS: Record<ProtocolTemplateTargetGroup, string> = {
  EMAGRECIMENTO: "Emagrecimento",
  HIPERTROFIA: "Ganho de massa",
  IDOSO: "Idoso",
  GESTANTE: "Gestante",
  ADULTO_SAUDAVEL: "Adulto saudável",
  CRIANCA: "Criança",
  TEA: "TEA",
  SOP: "SOP",
  VEGETARIANO_ESTRITO: "Vegetariano estrito",
  ENDURANCE: "Endurance",
  RESISTENCIA_INSULINA: "Resistência à insulina",
  BARIATRICO: "Bariátrico",
  RENAL: "Renal",
  ONCOLOGICO: "Oncológico",
};
