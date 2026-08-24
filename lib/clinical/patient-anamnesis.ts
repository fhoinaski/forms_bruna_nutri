import { PROTOCOL_TEMPLATE_GROUP_LABELS, PROTOCOL_TEMPLATE_TARGET_GROUPS } from "@/lib/protocol-templates/constants";

export type AnamnesisFieldKey =
  | "chief_complaint"
  | "life_stage"
  | "biological_sex"
  | "target_group"
  | "gestational_weeks"
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
  | "current_weight_kg"
  | "height_cm"
  | "pre_pregnancy_weight_kg"
  | "waist_cm"
  | "pre_surgery_weight_kg"
  | "bariatric_surgery_date"
  | "anthropometry_notes"
  | "pediatric_growth_notes"
  | "target_weight_kg"
  | "target_notes"
  | "exams"
  | "assessment"
  | "goals"
  | "care_plan"
  | "risk_flags"
  | "family_context"
  | "private_notes";

export type AnamnesisRecordLike = Record<AnamnesisFieldKey, string | null | undefined> & {
  version?: number;
  updated_at?: string | null;
};

export type AnamnesisInputType = "text" | "textarea" | "select" | "date";

export interface AnamnesisFieldDefinition {
  key: AnamnesisFieldKey;
  label: string;
  inputType: AnamnesisInputType;
  placeholder?: string;
  options?: string[];
  rows?: number;
  unit?: string;
  visibleWhen?: (record: AnamnesisRecordLike) => boolean;
  stableProfile?: boolean;
  longText?: boolean;
}

export interface AnamnesisSectionDefinition {
  id: string;
  title: string;
  description: string;
  fields: AnamnesisFieldDefinition[];
}

const LIFE_STAGE_OPTIONS = ["Gestacao", "Pos-parto", "Lactante", "Bebe", "Crianca", "Adolescente", "Adulto responsavel"];
const LIFE_STAGES_REQUIRING_GESTATION_CAPACITY = ["Gestacao", "Pos-parto", "Lactante"];

function canUseGestationalLifeStage(record: AnamnesisRecordLike): boolean {
  return record.biological_sex !== "Masculino";
}

export function availableAnamnesisLifeStages(record: AnamnesisRecordLike): string[] {
  if (!canUseGestationalLifeStage(record)) {
    return LIFE_STAGE_OPTIONS.filter((option) => !LIFE_STAGES_REQUIRING_GESTATION_CAPACITY.includes(option));
  }
  return LIFE_STAGE_OPTIONS;
}

function isPregnancy(record: AnamnesisRecordLike): boolean {
  return record.life_stage === "Gestacao";
}

function isPregnancyOrPostpartum(record: AnamnesisRecordLike): boolean {
  return ["Gestacao", "Pos-parto", "Lactante"].includes(String(record.life_stage ?? ""));
}

function isBariatric(record: AnamnesisRecordLike): boolean {
  return record.target_group === "BARIATRICO";
}

const profileFields: AnamnesisFieldDefinition[] = [
  { key: "biological_sex", label: "Sexo biologico", inputType: "select", options: ["Feminino", "Masculino", "Intersexo", "Nao informado"], stableProfile: true },
  { key: "life_stage", label: "Fase do cuidado", inputType: "select", options: LIFE_STAGE_OPTIONS, stableProfile: true },
  { key: "target_group", label: "Categoria de cuidado", inputType: "select", options: [...PROTOCOL_TEMPLATE_TARGET_GROUPS], stableProfile: true },
  { key: "gestational_weeks", label: "Semanas de gestacao", inputType: "text", placeholder: "Ex: 28 semanas", visibleWhen: isPregnancy },
  { key: "breastfeeding_context", label: "Amamentacao e contexto lactante", inputType: "textarea", rows: 3, visibleWhen: isPregnancyOrPostpartum },
  { key: "family_context", label: "Contexto familiar e rotina da casa", inputType: "textarea", rows: 3, longText: true },
];

export const ANAMNESIS_SECTIONS: AnamnesisSectionDefinition[] = [
  {
    id: "objetivo",
    title: "Objetivo e contexto",
    description: "Motivo do acompanhamento, expectativas e metas pactuadas.",
    fields: [
      { key: "chief_complaint", label: "Motivo principal do acompanhamento", inputType: "textarea", rows: 3, longText: true },
      { key: "goals", label: "Objetivos combinados", inputType: "textarea", rows: 3, longText: true },
      { key: "target_notes", label: "Metas antropometricas e clinicas", inputType: "textarea", rows: 3, longText: true },
    ],
  },
  {
    id: "perfil",
    title: "Perfil clinico",
    description: "Dados relativamente estaveis que orientam o cuidado.",
    fields: profileFields,
  },
  {
    id: "saude",
    title: "Historico de saude",
    description: "Diagnosticos, tratamentos, alergias, restricoes e sinais de atencao.",
    fields: [
      { key: "clinical_history", label: "Historico clinico e contexto atual", inputType: "textarea", rows: 4, longText: true },
      { key: "diagnoses", label: "Diagnosticos, condicoes e antecedentes", inputType: "textarea", rows: 3, stableProfile: true },
      { key: "medications", label: "Medicamentos em uso", inputType: "textarea", rows: 2, stableProfile: true },
      { key: "supplements", label: "Suplementos em uso", inputType: "textarea", rows: 2, stableProfile: true },
      { key: "allergies", label: "Alergias e reacoes", inputType: "textarea", rows: 2, stableProfile: true },
      { key: "restrictions", label: "Restricoes e cuidados alimentares", inputType: "textarea", rows: 2, stableProfile: true },
      { key: "risk_flags", label: "Sinais de atencao", inputType: "textarea", rows: 3, longText: true },
    ],
  },
  {
    id: "rotina",
    title: "Sono, intestino e rotina",
    description: "Contexto temporal do momento atual.",
    fields: [
      { key: "sleep_routine", label: "Sono e descanso", inputType: "textarea", rows: 2 },
      { key: "intestinal_health", label: "Sinais gastrointestinais", inputType: "textarea", rows: 3 },
      { key: "hydration", label: "Hidratacao", inputType: "textarea", rows: 2 },
      { key: "physical_activity", label: "Atividade fisica e movimento", inputType: "textarea", rows: 2 },
      { key: "stress_context", label: "Estresse, emocoes e suporte", inputType: "textarea", rows: 3 },
    ],
  },
  {
    id: "rotina-alimentar",
    title: "Rotina alimentar",
    description: "Padrao alimentar, preferencias, aversoes e barreiras praticas.",
    fields: [
      { key: "eating_routine", label: "Rotina alimentar", inputType: "textarea", rows: 4, longText: true },
      { key: "food_preferences", label: "Preferencias alimentares", inputType: "textarea", rows: 2, stableProfile: true },
      { key: "food_aversions", label: "Aversoes e dificuldades alimentares", inputType: "textarea", rows: 2, stableProfile: true },
    ],
  },
  {
    id: "medidas-contexto",
    title: "Medidas informadas na anamnese",
    description: "Dados autorreferidos ou de contexto, sem substituir a avaliacao antropometrica completa.",
    fields: [
      { key: "current_weight_kg", label: "Peso informado", inputType: "text", unit: "kg", placeholder: "Ex: 68,5" },
      { key: "height_cm", label: "Altura informada", inputType: "text", unit: "cm", placeholder: "Ex: 165" },
      { key: "target_weight_kg", label: "Peso/meta clinica", inputType: "text", placeholder: "Ex: manter ganho adequado" },
      { key: "pre_pregnancy_weight_kg", label: "Peso pre-gestacional", inputType: "text", unit: "kg", visibleWhen: isPregnancyOrPostpartum },
      { key: "waist_cm", label: "Cintura informada", inputType: "text", unit: "cm" },
      { key: "pre_surgery_weight_kg", label: "Peso pre-cirurgico", inputType: "text", unit: "kg", visibleWhen: isBariatric },
      { key: "bariatric_surgery_date", label: "Data da cirurgia bariatrica", inputType: "date", visibleWhen: isBariatric },
      { key: "anthropometry_notes", label: "Observacoes de medidas", inputType: "textarea", rows: 3 },
      { key: "pediatric_growth_notes", label: "Crescimento pediatrico", inputType: "textarea", rows: 3, visibleWhen: (record) => ["Bebe", "Crianca", "Adolescente"].includes(String(record.life_stage ?? "")) },
    ],
  },
  {
    id: "conduta",
    title: "Exames, avaliacao e conduta",
    description: "Leitura profissional e plano de cuidado registrado.",
    fields: [
      { key: "exams", label: "Exames e indicadores laboratoriais", inputType: "textarea", rows: 4, longText: true },
      { key: "assessment", label: "Avaliacao nutricional", inputType: "textarea", rows: 4, longText: true },
      { key: "care_plan", label: "Plano de cuidado e conduta", inputType: "textarea", rows: 5, longText: true },
      { key: "private_notes", label: "Notas privadas do atendimento", inputType: "textarea", rows: 3, longText: true },
    ],
  },
];

export const ANAMNESIS_FIELD_LABELS: Record<AnamnesisFieldKey, string> = Object.fromEntries(
  ANAMNESIS_SECTIONS.flatMap((section) => section.fields.map((field) => [field.key, field.label]))
) as Record<AnamnesisFieldKey, string>;

export function getAnamnesisField(sectionId: string, key: AnamnesisFieldKey): AnamnesisFieldDefinition | null {
  return ANAMNESIS_SECTIONS.find((section) => section.id === sectionId)?.fields.find((field) => field.key === key) ?? null;
}

export function hasAnamnesisValue(value: unknown): boolean {
  return value !== null && value !== undefined && String(value).trim().length > 0;
}

export function isAnamnesisFieldVisible(record: AnamnesisRecordLike, field: AnamnesisFieldDefinition): boolean {
  return !field.visibleWhen || field.visibleWhen(record) || hasAnamnesisValue(record[field.key]);
}

export function getVisibleAnamnesisFields(record: AnamnesisRecordLike, section: AnamnesisSectionDefinition): AnamnesisFieldDefinition[] {
  return section.fields.filter((field) => isAnamnesisFieldVisible(record, field));
}

export function countAnsweredAnamnesisFields(record: AnamnesisRecordLike, section: AnamnesisSectionDefinition): { answered: number; total: number } {
  const fields = getVisibleAnamnesisFields(record, section);
  return {
    answered: fields.filter((field) => hasAnamnesisValue(record[field.key])).length,
    total: fields.length,
  };
}

export function getKeyClinicalInfo(record: AnamnesisRecordLike): Array<{ label: string; value: string }> {
  return [
    { label: "Alergias", value: formatAnamnesisAnswer(record.allergies, { key: "allergies", inputType: "textarea" }) },
    { label: "Restricoes", value: formatAnamnesisAnswer(record.restrictions, { key: "restrictions", inputType: "textarea" }) },
    { label: "Medicamentos", value: formatAnamnesisAnswer(record.medications, { key: "medications", inputType: "textarea" }) },
    { label: "Preferencias", value: formatAnamnesisAnswer(record.food_preferences, { key: "food_preferences", inputType: "textarea" }) },
  ];
}

export function formatAnamnesisAnswer(value: unknown, field: Pick<AnamnesisFieldDefinition, "inputType" | "unit" | "key">): string {
  if (!hasAnamnesisValue(value)) return "Nao informado";
  const raw = String(value).trim();
  if (field.inputType === "date") {
    const parsed = new Date(`${raw}T00:00:00`);
    if (!Number.isNaN(parsed.getTime())) return parsed.toLocaleDateString("pt-BR");
  }
  if (field.key === "target_group") {
    return PROTOCOL_TEMPLATE_GROUP_LABELS[raw as keyof typeof PROTOCOL_TEMPLATE_GROUP_LABELS] ?? raw;
  }
  if (field.unit && !raw.toLocaleLowerCase("pt-BR").includes(field.unit.toLocaleLowerCase("pt-BR"))) {
    return `${raw} ${field.unit}`;
  }
  return raw;
}

export function sanitizeAnamnesisSectionPatch(
  section: AnamnesisSectionDefinition,
  values: Partial<Record<AnamnesisFieldKey, string | null>>
): Partial<Record<AnamnesisFieldKey, string | null>> {
  const allowed = new Set(section.fields.map((field) => field.key));
  const patch: Partial<Record<AnamnesisFieldKey, string | null>> = {};
  for (const [key, value] of Object.entries(values) as Array<[AnamnesisFieldKey, string | null | undefined]>) {
    if (!allowed.has(key)) continue;
    const normalized = typeof value === "string" ? value.trim() : value ?? null;
    patch[key] = normalized === "" ? null : normalized;
  }
  return patch;
}
