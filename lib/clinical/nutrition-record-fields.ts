export type NutritionRecordTextFieldKey =
  | "chief_complaint"
  | "breastfeeding_context"
  | "clinical_history"
  | "diagnoses"
  | "medications"
  | "supplements"
  | "allergies"
  | "restrictions"
  | "food_preferences"
  | "food_aversions"
  | "eating_routine"
  | "intestinal_health"
  | "sleep_routine"
  | "stress_context"
  | "physical_activity"
  | "hydration"
  | "pediatric_growth_notes"
  | "exams"
  | "assessment"
  | "goals"
  | "target_notes"
  | "care_plan"
  | "risk_flags"
  | "family_context"
  | "private_notes";

export const NUTRITION_TEXT_FIELDS: { key: NutritionRecordTextFieldKey; label: string; placeholder: string; rows?: number }[] = [
  { key: "chief_complaint", label: "Motivo principal do acompanhamento", placeholder: "O que trouxe a paciente ao atendimento, prioridade do momento e expectativa central.", rows: 3 },
  { key: "breastfeeding_context", label: "Amamentacao e contexto lactante", placeholder: "Aleitamento, dificuldades, rotina de mamadas, ordenha, retorno ao trabalho e suporte.", rows: 3 },
  { key: "clinical_history", label: "Historico clinico e contexto atual", placeholder: "Historico de saude, gestacao/pos-parto, amamentacao, rotina familiar e pontos relevantes.", rows: 4 },
  { key: "diagnoses", label: "Diagnosticos, condicoes e antecedentes", placeholder: "Condicoes clinicas, antecedentes familiares, queixas recorrentes e observacoes de risco.", rows: 3 },
  { key: "medications", label: "Medicamentos em uso", placeholder: "Medicamentos, dose quando relevante, tempo de uso e prescritor.", rows: 2 },
  { key: "supplements", label: "Suplementos em uso", placeholder: "Suplementos, dose, frequencia, adesao e tolerancia.", rows: 2 },
  { key: "allergies", label: "Alergias e reacoes", placeholder: "Alergias alimentares, medicamentosas, reacoes ja observadas e condutas necessarias.", rows: 2 },
  { key: "restrictions", label: "Restricoes e cuidados alimentares", placeholder: "Restricoes clinicas, culturais, familiares ou preferencias que precisam ser respeitadas.", rows: 2 },
  { key: "food_preferences", label: "Preferencias alimentares", placeholder: "Alimentos aceitos, refeicoes favoritas, padroes familiares e pontos que favorecem adesao.", rows: 2 },
  { key: "food_aversions", label: "Aversoes e dificuldades alimentares", placeholder: "Alimentos recusados, gatilhos, dificuldades sensoriais, enjoo, medo alimentar ou barreiras.", rows: 2 },
  { key: "eating_routine", label: "Rotina alimentar", placeholder: "Horarios, refeicoes, lanches, fome/saciedade, compras, preparo e padrao dos fins de semana.", rows: 4 },
  { key: "intestinal_health", label: "Sinais gastrointestinais", placeholder: "Intestino, refluxo, gases, distensao, dor, nauseas, evacuacoes e relacao com alimentos.", rows: 3 },
  { key: "sleep_routine", label: "Sono e descanso", placeholder: "Quantidade, qualidade, despertares, rotina noturna, cansaco e impacto no cuidado alimentar.", rows: 2 },
  { key: "stress_context", label: "Estresse, emocoes e suporte", placeholder: "Carga mental, ansiedade, rede de apoio, relacao emocional com comida e fatores de adesao.", rows: 3 },
  { key: "physical_activity", label: "Atividade fisica e movimento", placeholder: "Tipo, frequencia, limitacoes, preferencias e rotina possivel.", rows: 2 },
  { key: "hydration", label: "Hidratacao", placeholder: "Consumo de agua, aceitacao, sinais de baixa ingestao e estrategias possiveis.", rows: 2 },
  { key: "pediatric_growth_notes", label: "Crescimento pediatrico", placeholder: "Curvas, percentis informados, ganho ponderal, observacoes do pediatra e sinais para monitorar.", rows: 3 },
  { key: "exams", label: "Exames e indicadores laboratoriais", placeholder: "Exames recentes, datas, marcadores alterados e pontos para acompanhar.", rows: 4 },
  { key: "assessment", label: "Avaliacao nutricional", placeholder: "Leitura profissional do caso, prioridades clinicas e hipoteses de trabalho.", rows: 4 },
  { key: "goals", label: "Objetivos combinados", placeholder: "Objetivos terapeuticos, metas realistas, sinais de evolucao e combinados com a paciente.", rows: 3 },
  { key: "target_notes", label: "Metas antropometricas e clinicas", placeholder: "Metas pactuadas, criterio de acompanhamento, foco em composicao corporal ou crescimento saudavel.", rows: 3 },
  { key: "care_plan", label: "Plano de cuidado e conduta", placeholder: "Conduta nutricional, orientacoes, ajustes, materiais enviados e proximos passos.", rows: 5 },
  { key: "risk_flags", label: "Sinais de atencao", placeholder: "Alertas clinicos, sintomas que exigem encaminhamento, cuidados e pontos para monitorar.", rows: 3 },
  { key: "family_context", label: "Contexto familiar e rotina da casa", placeholder: "Participacao da familia, cuidadoras, escola, rede de apoio e acordos praticos.", rows: 3 },
  { key: "private_notes", label: "Notas privadas do atendimento", placeholder: "Observacoes sensiveis para uso interno profissional.", rows: 3 },
];

export const NUTRITION_TEXT_FIELD_LABELS: Record<NutritionRecordTextFieldKey, string> = Object.fromEntries(
  NUTRITION_TEXT_FIELDS.map((field) => [field.key, field.label])
) as Record<NutritionRecordTextFieldKey, string>;
