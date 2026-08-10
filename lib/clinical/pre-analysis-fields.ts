export type PreAnalysisFieldKey =
  | "summary"
  | "attention_points"
  | "main_goal"
  | "restrictions"
  | "professional_notes";

export const PRE_ANALYSIS_FIELD_ORDER: PreAnalysisFieldKey[] = [
  "summary",
  "attention_points",
  "main_goal",
  "restrictions",
  "professional_notes",
];

export const PRE_ANALYSIS_FIELD_LABELS: Record<PreAnalysisFieldKey, string> = {
  summary: "Resumo do caso (pré-relatório)",
  attention_points: "Pontos de atenção",
  main_goal: "Objetivo principal",
  restrictions: "Restrições relevantes",
  professional_notes: "Notas profissionais internas",
};
