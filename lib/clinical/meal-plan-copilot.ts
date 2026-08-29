/**
 * Deterministic pre-analysis for the meal-plan copilot.
 *
 * This is deliberately provider-free: it makes missing data and conflicts
 * explicit before an optional AI step can compose a draft.  Values retain a
 * source pointer so a clinical conclusion never becomes an untraceable fact.
 */
import type { NutritionRecord } from "@/lib/repositories/nutrition-records";

export type ClinicalDataState = "KNOWN" | "MISSING" | "UNCERTAIN" | "CONFLICTING";
export type ClinicalSource = "nutrition_record" | "pre_consultation";
export type DraftGenerationReadiness = "READY" | "READY_WITH_REVIEW" | "NOT_READY";

export interface ClinicalFact {
  key: string;
  label: string;
  state: ClinicalDataState;
  value: string | null;
  source: ClinicalSource | null;
  sourcePath: string | null;
  conflictingValue?: string;
}

export interface QuickQuestion {
  key: string;
  question: string;
  input: "short_text" | "time" | "single_choice";
  reason: string;
}

export interface ClinicalCopilotAnalysis {
  facts: ClinicalFact[];
  completion: { known: number; required: number; percent: number };
  questions: QuickQuestion[];
  canGenerateDraft: boolean;
  /** Deterministic gate for the existing structured draft generator. */
  generationReadiness: DraftGenerationReadiness;
  blockingFacts: ClinicalFact[];
  brief: {
    objective: ClinicalFact;
    routine: ClinicalFact;
    eatingPattern: ClinicalFact;
    preferences: ClinicalFact;
    attentionPoints: ClinicalFact[];
  };
}

type FactDefinition = {
  key: string; label: string; record: keyof NutritionRecord; intake: string[]; required?: boolean;
};

const FACTS: FactDefinition[] = [
  { key: "objective", label: "Objetivo", record: "goals", intake: ["objetivo", "expectativas"], required: true },
  { key: "weight", label: "Peso atual", record: "current_weight_kg", intake: ["peso", "pesoAtual"], required: true },
  { key: "height", label: "Altura", record: "height_cm", intake: ["altura"], required: true },
  { key: "routine", label: "Rotina", record: "eating_routine", intake: ["rotina", "diaAlimentar", "rotinaAlimentar"], required: true },
  { key: "preferences", label: "Preferências alimentares", record: "food_preferences", intake: ["favoritos", "preferencias", "gosta"] },
  { key: "aversions", label: "Alimentos rejeitados", record: "food_aversions", intake: ["naoGosta", "aversoes"] },
  { key: "allergies", label: "Alergias", record: "allergies", intake: ["alergias", "alergia"], required: true },
  { key: "restrictions", label: "Restrições", record: "restrictions", intake: ["restricoes", "restricao", "naoPodeComer"] },
  { key: "activity", label: "Atividade física", record: "physical_activity", intake: ["atividadeFisica", "exercicio"] },
  { key: "medications", label: "Medicações", record: "medications", intake: ["medicacao", "medicamentos"] },
];

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function comparable(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
}

function intakeValue(answers: Record<string, unknown>, keys: string[]): { value: string | null; path: string | null } {
  for (const key of keys) {
    const value = text(answers[key]);
    if (value) return { value, path: `pre_consultation.${key}` };
  }
  return { value: null, path: null };
}

function makeFact(def: FactDefinition, record: NutritionRecord | null, answers: Record<string, unknown>): ClinicalFact {
  const recordValue = record ? text(record[def.record]) : null;
  const intake = intakeValue(answers, def.intake);
  if (recordValue && intake.value && comparable(recordValue) !== comparable(intake.value)) {
    return { key: def.key, label: def.label, state: "CONFLICTING", value: recordValue, source: "nutrition_record", sourcePath: `nutrition_record.${def.record}`, conflictingValue: intake.value };
  }
  if (recordValue) return { key: def.key, label: def.label, state: "KNOWN", value: recordValue, source: "nutrition_record", sourcePath: `nutrition_record.${def.record}` };
  if (intake.value) return { key: def.key, label: def.label, state: "KNOWN", value: intake.value, source: "pre_consultation", sourcePath: intake.path };
  return { key: def.key, label: def.label, state: "MISSING", value: null, source: null, sourcePath: null };
}

const QUESTION_BY_KEY: Record<string, QuickQuestion> = {
  routine: { key: "routine", question: "Como são seus horários de acordar, dormir e fazer refeições?", input: "short_text", reason: "define a distribuição prática das refeições" },
  preferences: { key: "preferences", question: "Quais alimentos você gostaria de manter no plano?", input: "short_text", reason: "aumenta a adesão" },
  aversions: { key: "aversions", question: "Há alimentos que você não consome ou prefere evitar?", input: "short_text", reason: "evita sugestões inadequadas" },
  activity: { key: "activity", question: "Você faz atividade física? Em quais dias e horários?", input: "short_text", reason: "pode alterar a estratégia e horários" },
  allergies: { key: "allergies", question: "Você possui alguma alergia alimentar?", input: "single_choice", reason: "é uma restrição de segurança" },
  restrictions: { key: "restrictions", question: "Há alguma restrição alimentar ou orientação médica atual?", input: "short_text", reason: "evita contraindicações" },
};

export function buildMealPlanCopilotAnalysis(record: NutritionRecord | null, answers: Record<string, unknown> = {}): ClinicalCopilotAnalysis {
  const facts = FACTS.map((definition) => makeFact(definition, record, answers));
  const required = FACTS.filter((definition) => definition.required).length;
  const known = facts.filter((fact) => FACTS.find((definition) => definition.key === fact.key)?.required && fact.state === "KNOWN").length;
  const byKey = new Map(facts.map((fact) => [fact.key, fact]));
  const questions = FACTS
    .map((definition) => definition.key)
    .filter((key) => byKey.get(key)?.state === "MISSING" && QUESTION_BY_KEY[key])
    .map((key) => QUESTION_BY_KEY[key])
    .slice(0, 8);

  const requiredFacts = facts.filter((fact) => FACTS.find((definition) => definition.key === fact.key)?.required);
  const blockingFacts = requiredFacts.filter((fact) => fact.state === "MISSING" || fact.state === "UNCERTAIN");
  const hasRelevantConflict = requiredFacts.some((fact) => fact.state === "CONFLICTING");
  const generationReadiness: DraftGenerationReadiness = blockingFacts.length
    ? "NOT_READY"
    : hasRelevantConflict ? "READY_WITH_REVIEW" : "READY";

  const objective = byKey.get("objective")!;
  const routine = byKey.get("routine")!;
  return {
    facts,
    completion: { known, required, percent: required ? Math.round((known / required) * 100) : 100 },
    questions,
    canGenerateDraft: generationReadiness !== "NOT_READY",
    generationReadiness,
    blockingFacts,
    brief: {
      objective,
      routine,
      eatingPattern: routine,
      preferences: byKey.get("preferences")!,
      attentionPoints: facts.filter((fact) => ["allergies", "restrictions", "medications"].includes(fact.key) && fact.state !== "MISSING"),
    },
  };
}
