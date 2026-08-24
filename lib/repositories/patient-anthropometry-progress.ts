import { calculateWeightDelta } from "@/lib/clinical/anthropometry";
import { getClientEvolutions, getClientEvolutionById, type ClientEvolution } from "@/lib/repositories/client-evolutions";
import { getClientById } from "@/lib/repositories/clients";

export type AnthropometryMetricKey = "weight" | "bmi" | "waist" | "bodyFat" | "leanMass";

export interface PatientAnthropometryAssessment {
  id: string;
  date: string;
  weightKg: number | null;
  heightCm: number | null;
  bmi: number | null;
  waistCm: number | null;
  hipCm: number | null;
  armCm: number | null;
  abdomenCm: number | null;
  thighCm: number | null;
  bodyFatPercentage: number | null;
  fatMassKg: number | null;
  leanMassKg: number | null;
  bodyDensityGml: number | null;
  protocolLabel: string | null;
  skinfolds: {
    tricepsMm: number | null;
    subscapularMm: number | null;
    chestMm: number | null;
    midaxillaryMm: number | null;
    suprailiacMm: number | null;
    abdominalMm: number | null;
    thighMm: number | null;
  };
  notes: {
    symptoms: string | null;
    adherenceNotes: string | null;
    progressNotes: string | null;
    conductNotes: string | null;
    clinicalImpression: string | null;
    nextSteps: string | null;
  };
  createdAt: string;
}

export interface AnthropometryChangeSet {
  fromAssessmentId: string;
  toAssessmentId: string;
  weightChangeKg: number | null;
  waistChangeCm: number | null;
  bodyFatChangePercentagePoints: number | null;
  bmiChange: number | null;
  leanMassChangeKg: number | null;
}

export interface AnthropometryTrendPoint {
  assessmentId: string;
  date: string;
  weightKg: number | null;
  bmi: number | null;
  waistCm: number | null;
  bodyFatPercentage: number | null;
  leanMassKg: number | null;
}

export interface AnthropometryAvailableMetric {
  key: AnthropometryMetricKey;
  label: string;
  unit: string;
}

export interface PatientAnthropometryProgressViewModel {
  patientId: string;
  latestAssessment: PatientAnthropometryAssessment | null;
  previousAssessment: PatientAnthropometryAssessment | null;
  firstAssessment: PatientAnthropometryAssessment | null;
  changes: {
    currentVsPrevious: AnthropometryChangeSet | null;
    currentVsFirst: AnthropometryChangeSet | null;
  };
  trendSeries: AnthropometryTrendPoint[];
  availableMetrics: AnthropometryAvailableMetric[];
  assessmentHistory: PatientAnthropometryAssessment[];
}

const METRICS: AnthropometryAvailableMetric[] = [
  { key: "weight", label: "Peso", unit: "kg" },
  { key: "bmi", label: "IMC", unit: "" },
  { key: "waist", label: "Cintura", unit: "cm" },
  { key: "bodyFat", label: "% gordura", unit: "%" },
  { key: "leanMass", label: "Massa magra", unit: "kg" },
];

function roundOne(value: number): number {
  return Math.round(value * 10) / 10;
}

function numericDelta(current: number | null, baseline: number | null): number | null {
  if (current === null || baseline === null) return null;
  return roundOne(current - baseline);
}

function assessmentDate(evolution: ClientEvolution): string | null {
  return evolution.measured_at ?? evolution.created_at ?? null;
}

function hasClinicalDate(evolution: ClientEvolution): boolean {
  const date = assessmentDate(evolution);
  return Boolean(date && !Number.isNaN(new Date(date).getTime()));
}

function hasAnyAnthropometryValue(evolution: ClientEvolution): boolean {
  return [
    evolution.weight,
    evolution.height,
    evolution.bmi,
    evolution.waist_cm,
    evolution.hip_cm,
    evolution.arm_cm,
    evolution.abdomen_cm,
    evolution.thigh_cm,
    evolution.body_fat_percentage,
    evolution.fat_mass_kg,
    evolution.lean_mass_kg,
  ].some((value) => value !== null && value !== undefined);
}

function hasCompleteSkinfoldProtocol(evolution: ClientEvolution): boolean {
  return [
    evolution.skinfold_triceps_mm,
    evolution.skinfold_subscapular_mm,
    evolution.skinfold_chest_mm,
    evolution.skinfold_midaxillary_mm,
    evolution.skinfold_suprailiac_mm,
    evolution.skinfold_abdominal_mm,
    evolution.skinfold_thigh_mm,
  ].every((value) => value !== null && value !== undefined && Number.isFinite(value) && value > 0);
}

export function normalizeAnthropometryAssessment(evolution: ClientEvolution): PatientAnthropometryAssessment {
  return {
    id: evolution.id,
    date: assessmentDate(evolution) ?? evolution.created_at,
    weightKg: evolution.weight ?? null,
    heightCm: evolution.height ?? null,
    bmi: evolution.bmi ?? null,
    waistCm: evolution.waist_cm ?? null,
    hipCm: evolution.hip_cm ?? null,
    armCm: evolution.arm_cm ?? null,
    abdomenCm: evolution.abdomen_cm ?? null,
    thighCm: evolution.thigh_cm ?? null,
    bodyFatPercentage: evolution.body_fat_percentage ?? null,
    fatMassKg: evolution.fat_mass_kg ?? null,
    leanMassKg: evolution.lean_mass_kg ?? null,
    bodyDensityGml: evolution.body_density_g_ml ?? null,
    protocolLabel: hasCompleteSkinfoldProtocol(evolution) ? "Jackson & Pollock 7 dobras + Siri" : null,
    skinfolds: {
      tricepsMm: evolution.skinfold_triceps_mm ?? null,
      subscapularMm: evolution.skinfold_subscapular_mm ?? null,
      chestMm: evolution.skinfold_chest_mm ?? null,
      midaxillaryMm: evolution.skinfold_midaxillary_mm ?? null,
      suprailiacMm: evolution.skinfold_suprailiac_mm ?? null,
      abdominalMm: evolution.skinfold_abdominal_mm ?? null,
      thighMm: evolution.skinfold_thigh_mm ?? null,
    },
    notes: {
      symptoms: evolution.symptoms ?? null,
      adherenceNotes: evolution.adherence_notes ?? null,
      progressNotes: evolution.progress_notes ?? null,
      conductNotes: evolution.conduct_notes ?? null,
      clinicalImpression: evolution.clinical_impression ?? null,
      nextSteps: evolution.next_steps ?? null,
    },
    createdAt: evolution.created_at,
  };
}

export function buildAnthropometryChangeSet(
  current: PatientAnthropometryAssessment | null,
  baseline: PatientAnthropometryAssessment | null
): AnthropometryChangeSet | null {
  if (!current || !baseline || current.id === baseline.id) return null;
  return {
    fromAssessmentId: baseline.id,
    toAssessmentId: current.id,
    weightChangeKg: calculateWeightDelta(current.weightKg, baseline.weightKg),
    waistChangeCm: numericDelta(current.waistCm, baseline.waistCm),
    bodyFatChangePercentagePoints: numericDelta(current.bodyFatPercentage, baseline.bodyFatPercentage),
    bmiChange: numericDelta(current.bmi, baseline.bmi),
    leanMassChangeKg: numericDelta(current.leanMassKg, baseline.leanMassKg),
  };
}

function buildAvailableMetrics(points: AnthropometryTrendPoint[]): AnthropometryAvailableMetric[] {
  return METRICS.filter((metric) => {
    if (metric.key === "weight") return points.some((point) => point.weightKg !== null);
    if (metric.key === "bmi") return points.some((point) => point.bmi !== null);
    if (metric.key === "waist") return points.some((point) => point.waistCm !== null);
    if (metric.key === "bodyFat") return points.some((point) => point.bodyFatPercentage !== null);
    return points.some((point) => point.leanMassKg !== null);
  });
}

export function buildPatientAnthropometryProgressViewModel(
  patientId: string,
  evolutions: ClientEvolution[]
): PatientAnthropometryProgressViewModel {
  const history = evolutions
    .filter((evolution) => hasClinicalDate(evolution) && hasAnyAnthropometryValue(evolution))
    .map(normalizeAnthropometryAssessment)
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));

  const chronological = [...history].reverse();
  const latestAssessment = history[0] ?? null;
  const previousAssessment = history[1] ?? null;
  const firstAssessment = chronological[0] ?? null;
  const trendSeries: AnthropometryTrendPoint[] = chronological.map((assessment) => ({
    assessmentId: assessment.id,
    date: assessment.date,
    weightKg: assessment.weightKg,
    bmi: assessment.bmi,
    waistCm: assessment.waistCm,
    bodyFatPercentage: assessment.bodyFatPercentage,
    leanMassKg: assessment.leanMassKg,
  }));

  return {
    patientId,
    latestAssessment,
    previousAssessment,
    firstAssessment,
    changes: {
      currentVsPrevious: buildAnthropometryChangeSet(latestAssessment, previousAssessment),
      currentVsFirst: buildAnthropometryChangeSet(latestAssessment, firstAssessment),
    },
    trendSeries,
    availableMetrics: buildAvailableMetrics(trendSeries),
    assessmentHistory: history,
  };
}

export async function getPatientAnthropometryProgress(patientId: string): Promise<PatientAnthropometryProgressViewModel | null> {
  const client = await getClientById(patientId);
  if (!client) return null;
  return buildPatientAnthropometryProgressViewModel(patientId, await getClientEvolutions(patientId));
}

export async function getPatientAnthropometryAssessment(patientId: string, assessmentId: string): Promise<PatientAnthropometryAssessment | null> {
  const client = await getClientById(patientId);
  if (!client) return null;
  const evolution = await getClientEvolutionById(assessmentId);
  if (!evolution || evolution.client_id !== patientId || !hasClinicalDate(evolution) || !hasAnyAnthropometryValue(evolution)) return null;
  return normalizeAnthropometryAssessment(evolution);
}
