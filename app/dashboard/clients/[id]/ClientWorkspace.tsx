"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, Save, FileText, Printer,
  User, BookOpen, CheckSquare, TrendingUp, Clock,
  Plus, Check, X, Trash2, ChevronRight, ChevronDown,
  CalendarDays, WalletCards, KeyRound, ShieldCheck, RefreshCw, ExternalLink,
  Copy, Play,
  Utensils, AlertTriangle, Activity, Stethoscope,
  MoreHorizontal,
} from "lucide-react";
import { format, parseISO, isValid } from "date-fns";
import dynamic from "next/dynamic";
import { ClinicalEvolutionForm } from "@/components/dashboard/ClinicalEvolutionForm";
import { NutritionRecordHistory } from "@/components/dashboard/NutritionRecordHistory";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ANAMNESIS_SECTIONS,
  availableAnamnesisLifeStages,
  countAnsweredAnamnesisFields,
  formatAnamnesisAnswer,
  getKeyClinicalInfo,
  getVisibleAnamnesisFields,
  hasAnamnesisValue,
  sanitizeAnamnesisSectionPatch,
  type AnamnesisFieldDefinition,
  type AnamnesisFieldKey,
  type AnamnesisSectionDefinition,
} from "@/lib/clinical/patient-anamnesis";
import {
  calculateAgeInYears,
  calculateWaistHeightRatio,
  calculateWaistHipRatio,
  classifyWaistHeightRatio,
  classifyWaistHipRatio,
} from "@/lib/clinical/anthropometry";
import { PROTOCOL_TEMPLATE_GROUP_LABELS } from "@/lib/protocol-templates/constants";
import { CLINICAL_MARKER_CODE_LABELS, FOOD_RESTRICTION_CODES } from "@/lib/clinical/structured-markers";
import type { ClientSnapshot } from "@/lib/clinical/client-snapshot";
import type { PatientRecordSummaryViewModel } from "@/lib/repositories/patient-record-summary";
import type { PatientTimelineEvent, PatientTimelineFilter, PatientTimelineResult } from "@/lib/repositories/patient-record-timeline";

const MealPlanEditor = dynamic(() => import("@/components/dashboard/MealPlanEditor").then((mod) => mod.MealPlanEditor));
const EvolutionChart = dynamic(() => import("@/components/dashboard/EvolutionChart").then((mod) => mod.EvolutionChart));

function formatDateSafe(value: string | null, fmt = "dd/MM/yyyy"): string {
  if (!value) return "—";
  try {
    const d = parseISO(value);
    return isValid(d) ? format(d, fmt) : "—";
  } catch { return "—"; }
}

// ── Types ─────────────────────────────────────────────────────────────────

interface ClientDetail {
  id: string; name: string; email: string | null; phone: string | null;
  birth_date: string | null; source_submission_id: string | null;
  status: string; notes: string | null; created_at: string; updated_at: string;
}
interface ClientProtocol {
  id: string; protocol_id: string; source_draft_id: string | null;
  status: string; started_at: string; completed_at: string | null;
  review_date: string | null; professional_notes: string | null;
  protocol_title: string | null; protocol_category: string | null;
  protocol_kind: "standard" | "personalized"; protocol_description: string | null;
  phase_count: number; task_count: number; completed_task_count: number;
}
interface ProtocolLibraryItem {
  id: string; title: string; description: string | null; category: string | null;
  source_draft_id: string | null; is_active: number;
}
interface ClientTask {
  id: string; client_protocol_id: string | null; title: string;
  description: string | null; due_date: string | null; status: string;
  completed_at: string | null; created_at: string;
}
interface ClientEvolution {
  id: string; client_protocol_id: string | null; measured_at: string | null;
  weight: number | null; height: number | null; bmi: number | null;
  waist_cm: number | null; hip_cm: number | null; arm_cm: number | null;
  abdomen_cm: number | null; thigh_cm: number | null;
  body_fat_percentage: number | null;
  skinfold_triceps_mm: number | null; skinfold_subscapular_mm: number | null;
  skinfold_chest_mm: number | null; skinfold_midaxillary_mm: number | null;
  skinfold_suprailiac_mm: number | null; skinfold_abdominal_mm: number | null;
  skinfold_thigh_mm: number | null;
  body_density_g_ml: number | null; fat_mass_kg: number | null; lean_mass_kg: number | null;
  blood_pressure: string | null;
  energy_level: number | null; appetite: string | null; bowel_pattern: string | null;
  sleep_quality: string | null; symptoms: string | null;
  adherence_notes: string | null; adherence_score: number | null;
  progress_notes: string | null; conduct_notes: string | null;
  clinical_impression: string | null; next_steps: string | null; created_at: string;
}
interface ClientAppointment {
  id: string; title: string; appointment_type: string; starts_at: string;
  ends_at: string | null; status: string; location: string | null; notes: string | null;
}
interface ClientPayment {
  id: string; description: string; amount_cents: number; due_date: string | null;
  paid_at: string | null; status: string; payment_method: string | null; notes: string | null;
}
interface ClientPortalAccessState {
  exists: boolean;
  is_active: boolean;
  last_used_at: string | null;
  updated_at: string | null;
  login_url: string;
}
interface NutritionRecord {
  id: string; client_id: string;
  chief_complaint: string | null; life_stage: string | null; biological_sex: string | null;
  target_group: string | null;
  gestational_weeks: string | null; breastfeeding_context: string | null;
  clinical_history: string | null; diagnoses: string | null;
  medications: string | null; supplements: string | null; allergies: string | null;
  restrictions: string | null; food_preferences: string | null; food_aversions: string | null;
  eating_routine: string | null; intestinal_health: string | null; sleep_routine: string | null;
  stress_context: string | null; physical_activity: string | null; hydration: string | null;
  current_weight_kg: string | null; height_cm: string | null; bmi: string | null; pre_pregnancy_weight_kg: string | null; waist_cm: string | null;
  pre_surgery_weight_kg: string | null; bariatric_surgery_date: string | null;
  anthropometry_notes: string | null; pediatric_growth_notes: string | null;
  target_weight_kg: string | null; target_notes: string | null; exams: string | null; assessment: string | null;
  goals: string | null; care_plan: string | null; risk_flags: string | null;
  family_context: string | null; private_notes: string | null;
  version: number;
  created_at: string; updated_at: string;
}

type StructuredRestrictionType = "ALLERGY" | "INTOLERANCE" | "DIETARY_RESTRICTION" | "FOOD_AVOIDANCE" | "CLINICAL_FLAG" | "PREGNANCY" | "BARIATRIC";
type StructuredRestrictionStatus = "ACTIVE" | "SUSPECTED" | "RESOLVED";
type StructuredRestrictionSeverity = "unknown" | "mild" | "moderate" | "severe";

interface StructuredRestriction {
  id: string;
  type: StructuredRestrictionType;
  normalized_code: string;
  label: string | null;
  severity: StructuredRestrictionSeverity;
  status: StructuredRestrictionStatus;
  source: string;
  evidence_text: string | null;
}

interface StructuredRestrictionSuggestion {
  type: StructuredRestrictionType;
  normalizedCode: string;
  label: string;
  status: "SUSPECTED";
  severity: "unknown";
  evidenceText: string;
  confidence: "low" | "medium";
}

interface ClinicalGrowthResponse {
  pediatric: {
    applicable: boolean;
    sex: string | null;
    age: { days: number; months: number; years: number } | null;
    results: Array<{
      indicator: string;
      label: string;
      value: number;
      zScore: number;
      cautionLabel: string;
      technicalKey: string | null;
      technicalRule: string | null;
    }>;
    chartReferenceLines: Array<{
      measured_at?: string | null;
      created_at?: string | null;
      p3: number | null;
      p50: number | null;
      p97: number | null;
    }>;
  };
  gestational: {
    applicable: boolean;
    prePregnancyBmi: number | null;
    prePregnancyClassification: { category: string; label: string; interpretation: string } | null;
    recommendedTotalGain: { ganho_min_kg: number; ganho_max_kg: number; observacao?: string } | null;
    weeklyGainRate: number | null;
    weeklyGainClassification: { classification: string; label: string; p25: number; p75: number } | null;
    referenceNote: string;
  };
  bariatric: {
    applicable: boolean;
    preSurgeryWeightKg: number | null;
    idealWeightKg: number | null;
    currentWeightKg: number | null;
    progress: { percentTotalWeightLoss: number; percentExcessWeightLoss: number | null; weightLostKg: number } | null;
  };
}

// ── Constants ─────────────────────────────────────────────────────────────

const STATUS_OPTIONS = [
  { value: "ativo", label: "Ativo" },
  { value: "inativo", label: "Inativo" },
  { value: "arquivado", label: "Arquivado" },
];
const STATUS_BADGE: Record<string, string> = {
  ativo: "brand-badge brand-badge-finalizado",
  inativo: "brand-badge brand-badge-andamento",
  arquivado: "brand-badge brand-badge-arquivado",
};
const STATUS_LABEL: Record<string, string> = { ativo: "Ativo", inativo: "Inativo", arquivado: "Arquivado" };

const TASK_STATUS_COLORS: Record<string, string> = {
  pendente: "bg-[#EAD8C2] text-[#8C6E52]",
  concluida: "bg-[#D4EDDA] text-[#4A7C59]",
  cancelada: "bg-red-100 text-red-700",
};
const TASK_STATUS_LABELS: Record<string, string> = {
  pendente: "Pendente", concluida: "Concluída", cancelada: "Cancelada",
};
const APPOINTMENT_STATUS_LABELS: Record<string, string> = {
  agendado: "Agendado", confirmado: "Confirmado", realizado: "Realizado", cancelado: "Cancelado",
};
const PAYMENT_STATUS_LABELS: Record<string, string> = {
  pendente: "Pendente", pago: "Pago", vencido: "Vencido", cancelado: "Cancelado",
};
const PROTOCOL_STATUS_COLORS: Record<string, string> = {
  ativo: "brand-badge brand-badge-finalizado",
  pausado: "brand-badge brand-badge-andamento",
  concluido: "brand-badge brand-badge-andamento",
  cancelado: "brand-badge brand-badge-arquivado",
};
const PROTOCOL_STATUS_LABELS: Record<string, string> = {
  ativo: "Ativo", pausado: "Pausado", concluido: "Concluído", cancelado: "Cancelado",
};

const STRUCTURED_RESTRICTION_TYPE_LABELS: Record<StructuredRestrictionType, string> = {
  ALLERGY: "Alergia",
  INTOLERANCE: "Intolerancia",
  DIETARY_RESTRICTION: "Restricao alimentar",
  FOOD_AVOIDANCE: "Alimento evitado",
  CLINICAL_FLAG: "Flag clinica",
  PREGNANCY: "Gestacao",
  BARIATRIC: "Bariatrica",
};
const STRUCTURED_RESTRICTION_STATUS_LABELS: Record<StructuredRestrictionStatus, string> = {
  ACTIVE: "Ativo",
  SUSPECTED: "Suspeito",
  RESOLVED: "Resolvido",
};
const STRUCTURED_RESTRICTION_SEVERITY_LABELS: Record<StructuredRestrictionSeverity, string> = {
  unknown: "Nao informada",
  mild: "Leve",
  moderate: "Moderada",
  severe: "Grave",
};

const TABS = [
  { id: "resumo", label: "Resumo", icon: User },
  { id: "consultas", label: "Consultas", icon: CalendarDays },
  { id: "anamnese", label: "Anamnese", icon: FileText },
  { id: "antropometria", label: "Antropometria", icon: Activity },
  { id: "plano-alimentar", label: "Plano alimentar", icon: Utensils },
  { id: "evolucao", label: "Evolução", icon: TrendingUp },
  { id: "mais", label: "Mais", icon: MoreHorizontal },
] as const;

type TabId = typeof TABS[number]["id"];

function resolveTabFromParam(param: string | null): TabId {
  return (TABS.some((tab) => tab.id === param) ? param : "resumo") as TabId;
}

function formatMoney(cents: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(cents / 100);
}

// ── Evolution form ─────────────────────────────────────────────────────────

function EvolutionForm({ clientId, onSuccess }: { clientId: string; onSuccess: () => void }) {
  const [weight, setWeight] = useState("");
  const [height, setHeight] = useState("");
  const [symptoms, setSymptoms] = useState("");
  const [adherenceNotes, setAdherenceNotes] = useState("");
  const [progressNotes, setProgressNotes] = useState("");
  const [conductNotes, setConductNotes] = useState("");
  const [nextSteps, setNextSteps] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true); setError("");
    try {
      const res = await fetch(`/api/admin/clients/${clientId}/evolutions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          weight: weight ? Number(weight) : null,
          height: height ? Number(height) : null,
          symptoms: symptoms || null,
          adherence_notes: adherenceNotes || null,
          progress_notes: progressNotes || null,
          conduct_notes: conductNotes || null,
          next_steps: nextSteps || null,
        }),
      });
      if (!res.ok) throw new Error();
      setWeight(""); setHeight(""); setSymptoms(""); setAdherenceNotes("");
      setProgressNotes(""); setConductNotes(""); setNextSteps("");
      onSuccess();
    } catch {
      setError("Não foi possível registrar a evolução.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 border border-[#EAD8C2] rounded-2xl p-5 bg-[#FAF7F2]/60">
      <h3 className="font-serif font-semibold text-[#B47F6A]">Nova evolução</h3>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="brand-label">Peso (kg)</label>
          <input type="number" step="0.1" value={weight} onChange={(e) => setWeight(e.target.value)}
            placeholder="Ex: 68.5" className="brand-input" />
        </div>
        <div>
          <label className="brand-label">Altura (cm)</label>
          <input type="number" step="0.1" value={height} onChange={(e) => setHeight(e.target.value)}
            placeholder="Ex: 165" className="brand-input" />
        </div>
      </div>
      {weight && height && (
        <p className="text-xs text-[#7A9A74]">
          IMC calculado:{" "}
          <strong>{(Number(weight) / Math.pow(Number(height) / 100, 2)).toFixed(1)}</strong>
        </p>
      )}
      <div>
        <label className="brand-label">Sintomas relatados</label>
        <textarea value={symptoms} onChange={(e) => setSymptoms(e.target.value)}
          rows={2} className="brand-input resize-none" placeholder="Queixas, sintomas atuais..." />
      </div>
      <div>
        <label className="brand-label">Adesão ao protocolo</label>
        <textarea value={adherenceNotes} onChange={(e) => setAdherenceNotes(e.target.value)}
          rows={2} className="brand-input resize-none" placeholder="Observações sobre adesão..." />
      </div>
      <div>
        <label className="brand-label">Progressos observados</label>
        <textarea value={progressNotes} onChange={(e) => setProgressNotes(e.target.value)}
          rows={2} className="brand-input resize-none" placeholder="Evolução clínica e mudanças observadas..." />
      </div>
      <div>
        <label className="brand-label">Conduta adotada</label>
        <textarea value={conductNotes} onChange={(e) => setConductNotes(e.target.value)}
          rows={2} className="brand-input resize-none" placeholder="Ajustes, condutas, orientações..." />
      </div>
      <div>
        <label className="brand-label">Próximos passos</label>
        <textarea value={nextSteps} onChange={(e) => setNextSteps(e.target.value)}
          rows={2} className="brand-input resize-none" placeholder="Plano para o próximo período..." />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button type="submit" disabled={saving} className="brand-btn-primary">
        <Plus className="w-4 h-4" />
        {saving ? "Registrando..." : "Registrar evolução"}
      </button>
    </form>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────

function EvolutionMetric({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div className="rounded-lg bg-[#FBF7F1] p-3">
      <p className="brand-label mb-1">{label}</p>
      <p className="text-sm font-semibold text-[#3A3028]">{value}</p>
    </div>
  );
}

function EvolutionHistoryItem({ evolution, onDelete }: { evolution: ClientEvolution; onDelete: (id: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const waistHipRatio = calculateWaistHipRatio(evolution.waist_cm, evolution.hip_cm);
  const waistHeightRatio = calculateWaistHeightRatio(evolution.waist_cm, evolution.height);
  const hasMeasurements = [
    evolution.weight, evolution.height, evolution.bmi, evolution.waist_cm, evolution.hip_cm,
    evolution.arm_cm, evolution.abdomen_cm, evolution.thigh_cm, evolution.body_fat_percentage,
    evolution.fat_mass_kg, evolution.lean_mass_kg,
  ].some((value) => value !== null && value !== undefined);

  return (
    <li className="border border-[#EAD8C2] rounded-xl p-5 bg-[#FAF7F2]/60">
      <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <p className="text-xs text-[#A8927D]">{formatDateSafe(evolution.measured_at ?? evolution.created_at, "dd/MM/yyyy 'às' HH:mm")}</p>
        <div className="flex flex-wrap items-center gap-3">
          {evolution.weight && (
            <span className="text-xs font-semibold text-[#7A9A74]">{evolution.weight}kg</span>
          )}
          {evolution.bmi && (
            <span className="text-xs bg-[#EAD8C2] text-[#8C6E52] px-2 py-0.5 rounded-full">
              IMC {evolution.bmi}
            </span>
          )}
          {hasMeasurements && (
            <button
              type="button"
              onClick={() => setExpanded((value) => !value)}
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-[#607A56] hover:bg-[#EAF0E4]"
            >
              <ChevronDown className={`h-3.5 w-3.5 transition-transform ${expanded ? "rotate-180" : ""}`} />
              {expanded ? "Ocultar dados" : "Ver dados"}
            </button>
          )}
          <button onClick={() => onDelete(evolution.id)}
            title="Remover"
            className="p-1 rounded-lg text-[#A8927D] hover:bg-red-50 hover:text-red-600 transition-colors">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {expanded && hasMeasurements && (
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <EvolutionMetric label="Peso" value={evolution.weight ? `${evolution.weight} kg` : null} />
          <EvolutionMetric label="Altura" value={evolution.height ? `${evolution.height} cm` : null} />
          <EvolutionMetric label="IMC" value={evolution.bmi ? String(evolution.bmi) : null} />
          <EvolutionMetric label="Cintura" value={evolution.waist_cm ? `${evolution.waist_cm} cm` : null} />
          <EvolutionMetric label="Quadril" value={evolution.hip_cm ? `${evolution.hip_cm} cm` : null} />
          <EvolutionMetric label="Braço" value={evolution.arm_cm ? `${evolution.arm_cm} cm` : null} />
          <EvolutionMetric label="Abdômen" value={evolution.abdomen_cm ? `${evolution.abdomen_cm} cm` : null} />
          <EvolutionMetric label="Coxa" value={evolution.thigh_cm ? `${evolution.thigh_cm} cm` : null} />
          <EvolutionMetric
            label="RCQ (cintura/quadril)"
            value={waistHipRatio !== null ? waistHipRatio.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : null}
          />
          <EvolutionMetric
            label="RCE (cintura/estatura)"
            value={waistHeightRatio !== null ? waistHeightRatio.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : null}
          />
          <EvolutionMetric label="Gordura corporal" value={evolution.body_fat_percentage ? `${evolution.body_fat_percentage}%` : null} />
          <EvolutionMetric label="Massa gorda" value={evolution.fat_mass_kg ? `${evolution.fat_mass_kg.toFixed(1)} kg` : null} />
          <EvolutionMetric label="Massa livre de gordura" value={evolution.lean_mass_kg ? `${evolution.lean_mass_kg.toFixed(1)} kg` : null} />
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
        {evolution.symptoms && (
          <div><p className="brand-label mb-1">Sintomas</p><p className="text-[#3A2B1F]">{evolution.symptoms}</p></div>
        )}
        {evolution.adherence_notes && (
          <div><p className="brand-label mb-1">Adesão</p><p className="text-[#3A2B1F]">{evolution.adherence_notes}</p></div>
        )}
        {evolution.progress_notes && (
          <div className="md:col-span-2"><p className="brand-label mb-1">Progressos</p><p className="text-[#3A2B1F]">{evolution.progress_notes}</p></div>
        )}
        {evolution.conduct_notes && (
          <div className="md:col-span-2"><p className="brand-label mb-1">Conduta</p><p className="text-[#3A2B1F]">{evolution.conduct_notes}</p></div>
        )}
        {evolution.next_steps && (
          <div className="md:col-span-2"><p className="brand-label mb-1">Próximos passos</p><p className="text-[#3A2B1F]">{evolution.next_steps}</p></div>
        )}
      </div>
    </li>
  );
}

function formatComparisonDelta(current: number | null, initial: number | null, unit: string, decimals = 1): string {
  if (current === null || initial === null) return "—";
  const delta = Math.round((current - initial) * 10 ** decimals) / 10 ** decimals;
  const prefix = delta > 0 ? "+" : "";
  const formatted = delta.toLocaleString("pt-BR", { maximumFractionDigits: decimals, minimumFractionDigits: decimals });
  return unit ? `${prefix}${formatted} ${unit}` : `${prefix}${formatted}`;
}

function formatComparisonValue(value: number | null, unit: string, decimals = 1): string {
  if (value === null) return "—";
  const formatted = value.toLocaleString("pt-BR", { maximumFractionDigits: decimals, minimumFractionDigits: decimals });
  return unit ? `${formatted} ${unit}` : formatted;
}

const REASSESSMENT_ROWS: { key: string; label: string; unit: string; decimals?: number; getValue: (ev: ClientEvolution) => number | null }[] = [
  { key: "weight", label: "Peso", unit: "kg", getValue: (ev) => ev.weight },
  { key: "body_fat_percentage", label: "% de gordura", unit: "%", getValue: (ev) => ev.body_fat_percentage },
  { key: "fat_mass_kg", label: "Massa gorda", unit: "kg", getValue: (ev) => ev.fat_mass_kg },
  { key: "lean_mass_kg", label: "Massa livre de gordura", unit: "kg", getValue: (ev) => ev.lean_mass_kg },
  { key: "waist_cm", label: "Cintura", unit: "cm", decimals: 0, getValue: (ev) => ev.waist_cm },
  { key: "hip_cm", label: "Quadril", unit: "cm", decimals: 0, getValue: (ev) => ev.hip_cm },
  { key: "waist_hip_ratio", label: "RCQ (cintura/quadril)", unit: "", decimals: 2, getValue: (ev) => calculateWaistHipRatio(ev.waist_cm, ev.hip_cm) },
  { key: "waist_height_ratio", label: "RCE (cintura/estatura)", unit: "", decimals: 2, getValue: (ev) => calculateWaistHeightRatio(ev.waist_cm, ev.height) },
];

function ReassessmentTable({ evolutions }: { evolutions: ClientEvolution[] }) {
  // A lista chega ordenada da mais recente para a mais antiga; para a
  // comparacao, trabalhar em ordem cronologica (mais antiga primeiro) fica
  // mais intuitivo para escolher "de" / "ate".
  const chronological = useMemo(
    () => [...evolutions].sort((a, b) => new Date(a.measured_at ?? a.created_at).getTime() - new Date(b.measured_at ?? b.created_at).getTime()),
    [evolutions]
  );
  const [fromId, setFromId] = useState<string>("");
  const [toId, setToId] = useState<string>("");

  const defaultFromId = chronological[0]?.id ?? "";
  const defaultToId = chronological[chronological.length - 1]?.id ?? "";
  const fromEvolution = chronological.find((item) => item.id === (fromId || defaultFromId)) ?? null;
  const toEvolution = chronological.find((item) => item.id === (toId || defaultToId)) ?? null;

  if (chronological.length < 2) {
    return (
      <div className="rounded-2xl border border-dashed border-[#D9C4B2] bg-white p-6 text-center">
        <p className="text-sm text-[#75675E]">Registre uma nova avaliação para ver a comparação com a primeira medição.</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-[#EAD8C2] bg-white">
      <div className="border-b border-[#EAD8C2] bg-[#FAF7F2]/60 px-5 py-3">
        <h3 className="font-serif text-base font-semibold text-[#B47F6A]">Reavaliação</h3>
        <p className="mt-1 text-xs leading-5 text-[#8C6E52]">Escolha duas avaliações para comparar — por padrão, a primeira e a mais recente.</p>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="brand-label">De</label>
            <select value={fromId || defaultFromId} onChange={(event) => setFromId(event.target.value)} className="brand-input">
              {chronological.map((item) => (
                <option key={item.id} value={item.id}>{formatDateSafe(item.measured_at ?? item.created_at)}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="brand-label">Até</label>
            <select value={toId || defaultToId} onChange={(event) => setToId(event.target.value)} className="brand-input">
              {chronological.map((item) => (
                <option key={item.id} value={item.id}>{formatDateSafe(item.measured_at ?? item.created_at)}</option>
              ))}
            </select>
          </div>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[10px] font-bold uppercase tracking-[0.1em] text-[#8C6E52]">
              <th className="px-5 py-3">Indicador</th>
              <th className="px-3 py-3">Inicial</th>
              <th className="px-3 py-3">Atual</th>
              <th className="px-3 py-3">Diferença</th>
            </tr>
          </thead>
          <tbody>
            {REASSESSMENT_ROWS.map((row) => {
              const initialValue = fromEvolution ? row.getValue(fromEvolution) : null;
              const latestValue = toEvolution ? row.getValue(toEvolution) : null;
              return (
                <tr key={row.key} className="border-t border-[#EDE1D6]">
                  <td className="px-5 py-3 font-medium text-[#3A3028]">{row.label}</td>
                  <td className="px-3 py-3 text-[#75675E]">{formatComparisonValue(initialValue, row.unit, row.decimals)}</td>
                  <td className="px-3 py-3 text-[#75675E]">{formatComparisonValue(latestValue, row.unit, row.decimals)}</td>
                  <td className="px-3 py-3 font-semibold text-[#7A9A74]">{formatComparisonDelta(latestValue, initialValue, row.unit, row.decimals)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function formatDelta(value: number | null): string {
  if (value === null) return "sem comparativo";
  const prefix = value > 0 ? "+" : "";
  return `${prefix}${value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} kg`;
}

function weightDelta(current: ClientEvolution, next?: ClientEvolution): number | null {
  if (!current.weight || !next?.weight) return null;
  return Math.round((current.weight - next.weight) * 10) / 10;
}

function StructuredRestrictionsPanel({ clientId, onChanged }: { clientId: string; onChanged: () => void }) {
  const [items, setItems] = useState<StructuredRestriction[]>([]);
  const [suggestions, setSuggestions] = useState<StructuredRestrictionSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    type: "ALLERGY" as StructuredRestrictionType,
    normalizedCode: "MILK",
    severity: "unknown" as StructuredRestrictionSeverity,
    status: "ACTIVE" as Exclude<StructuredRestrictionStatus, "RESOLVED">,
    evidenceText: "",
  });

  async function loadItems() {
    const res = await fetch(`/api/admin/clients/${clientId}/nutrition-record/structured-restrictions`, { cache: "no-store" });
    if (!res.ok) throw new Error();
    const data = await res.json() as { items: StructuredRestriction[] };
    setItems(data.items ?? []);
  }

  useEffect(() => {
    setLoading(true);
    loadItems()
      .catch(() => setError("Nao foi possivel carregar as restricoes estruturadas."))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  async function createMarker(input?: Partial<typeof form> & { source?: string; label?: string | null }) {
    setSaving(true); setError(""); setMessage("");
    const payload = { ...form, ...input };
    try {
      const res = await fetch(`/api/admin/clients/${clientId}/nutrition-record/structured-restrictions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: payload.type,
          normalizedCode: payload.normalizedCode,
          label: payload.label ?? CLINICAL_MARKER_CODE_LABELS[payload.normalizedCode as keyof typeof CLINICAL_MARKER_CODE_LABELS] ?? payload.normalizedCode,
          severity: payload.severity,
          status: payload.status,
          source: payload.source ?? "manual",
          evidenceText: payload.evidenceText || null,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.message ?? "Nao foi possivel salvar.");
      }
      await loadItems();
      onChanged();
      setForm((prev) => ({ ...prev, evidenceText: "" }));
      setMessage("Restricao estruturada salva.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Nao foi possivel salvar.");
    } finally {
      setSaving(false);
    }
  }

  async function resolveMarker(marker: StructuredRestriction) {
    setSaving(true); setError(""); setMessage("");
    try {
      const res = await fetch(`/api/admin/clients/${clientId}/nutrition-record/structured-restrictions/${marker.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "RESOLVED" }),
      });
      if (!res.ok) throw new Error();
      await loadItems();
      onChanged();
      setMessage("Restricao resolvida.");
    } catch {
      setError("Nao foi possivel resolver a restricao.");
    } finally {
      setSaving(false);
    }
  }

  async function loadSuggestions() {
    setSaving(true); setError(""); setMessage("");
    try {
      const res = await fetch(`/api/admin/clients/${clientId}/nutrition-record/structured-restrictions/suggestions`, { cache: "no-store" });
      if (!res.ok) throw new Error();
      const data = await res.json() as { items: StructuredRestrictionSuggestion[] };
      setSuggestions(data.items ?? []);
      setMessage((data.items ?? []).length ? "Sugestoes carregadas para revisao." : "Nenhuma sugestao encontrada no texto atual.");
    } catch {
      setError("Nao foi possivel gerar sugestoes.");
    } finally {
      setSaving(false);
    }
  }

  async function rejectSuggestion(suggestion: StructuredRestrictionSuggestion) {
    setSaving(true); setError(""); setMessage("");
    try {
      await fetch(`/api/admin/clients/${clientId}/nutrition-record/structured-restrictions/suggestions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ suggestion }),
      });
      setSuggestions((prev) => prev.filter((item) => item !== suggestion));
      setMessage("Sugestao ignorada.");
    } catch {
      setError("Nao foi possivel registrar a rejeicao.");
    } finally {
      setSaving(false);
    }
  }

  const grouped = items.reduce<Record<string, StructuredRestriction[]>>((acc, item) => {
    const label = STRUCTURED_RESTRICTION_TYPE_LABELS[item.type] ?? item.type;
    acc[label] = [...(acc[label] ?? []), item];
    return acc;
  }, {});

  return (
    <section className="rounded-2xl border border-[#D9E4D3] bg-[#F8FBF5] p-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h3 className="font-serif text-base font-semibold text-[#607A56]">Restricoes estruturadas</h3>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-[#75675E]">
            Dados normalizados para regras e alertas. O texto completo do prontuario permanece preservado nos campos clinicos.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <button type="button" onClick={() => setEditing((prev) => !prev)} disabled={saving} className="brand-btn-secondary w-full text-xs md:w-auto">
            {editing ? "Fechar edicao" : "Adicionar marcador"}
          </button>
          <button type="button" onClick={loadSuggestions} disabled={saving} className="brand-btn-secondary w-full text-xs md:w-auto">
            Sugerir a partir do texto
          </button>
        </div>
      </div>

      {loading ? (
        <p className="mt-4 text-sm text-[#A8927D]">Carregando restricoes...</p>
      ) : items.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-[#D9E4D3] bg-white p-4 text-sm text-[#8C6E52]">
          Nenhuma restricao estruturada cadastrada.
        </p>
      ) : (
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {Object.entries(grouped).map(([group, groupItems]) => (
            <div key={group} className="rounded-xl border border-[#D9E4D3] bg-white p-4">
              <p className="mb-2 text-xs font-bold uppercase tracking-[0.12em] text-[#607A56]">{group}</p>
              <ul className="space-y-2">
                {groupItems.map((item) => (
                  <li key={item.id} className="flex items-start justify-between gap-3 rounded-lg bg-[#FAF7F2] p-3">
                    <div>
                      <p className="text-sm font-semibold text-[#3A3028]">{item.label || item.normalized_code}</p>
                      <p className="mt-1 text-xs text-[#75675E]">
                        {STRUCTURED_RESTRICTION_STATUS_LABELS[item.status]} · {STRUCTURED_RESTRICTION_SEVERITY_LABELS[item.severity]}
                      </p>
                      {item.evidence_text && <p className="mt-1 line-clamp-2 text-xs text-[#8C6E52]">{item.evidence_text}</p>}
                    </div>
                    {item.status !== "RESOLVED" && (
                      <button type="button" onClick={() => resolveMarker(item)} disabled={saving} className="shrink-0 text-xs font-semibold text-[#8C6E52] underline underline-offset-2">
                        Resolver
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <div className="mt-5 rounded-xl border border-[#D9E4D3] bg-white p-4">
          <p className="mb-3 text-sm font-semibold text-[#3A3028]">Adicionar marcador</p>
          <div className="grid gap-3 md:grid-cols-5">
            <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as StructuredRestrictionType })} className="brand-input" aria-label="Tipo de marcador">
              {(["ALLERGY", "INTOLERANCE", "DIETARY_RESTRICTION", "FOOD_AVOIDANCE"] as StructuredRestrictionType[]).map((type) => (
                <option key={type} value={type}>{STRUCTURED_RESTRICTION_TYPE_LABELS[type]}</option>
              ))}
            </select>
            <select value={form.normalizedCode} onChange={(e) => setForm({ ...form, normalizedCode: e.target.value })} className="brand-input" aria-label="Alimento ou marcador">
              {FOOD_RESTRICTION_CODES.map((code) => (
                <option key={code} value={code}>{CLINICAL_MARKER_CODE_LABELS[code]}</option>
              ))}
            </select>
            <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as Exclude<StructuredRestrictionStatus, "RESOLVED"> })} className="brand-input" aria-label="Status do marcador">
              <option value="ACTIVE">Ativo</option>
              <option value="SUSPECTED">Suspeito</option>
            </select>
            <select value={form.severity} onChange={(e) => setForm({ ...form, severity: e.target.value as StructuredRestrictionSeverity })} className="brand-input" aria-label="Gravidade do marcador">
              {Object.entries(STRUCTURED_RESTRICTION_SEVERITY_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
            <button type="button" onClick={() => createMarker()} disabled={saving} className="brand-btn-primary">
              <Plus className="h-4 w-4" />
              Adicionar
            </button>
          </div>
          <label className="brand-label mt-3" htmlFor="structured-restriction-evidence">Evidencia curta</label>
          <textarea
            id="structured-restriction-evidence"
            value={form.evidenceText}
            onChange={(e) => setForm({ ...form, evidenceText: e.target.value })}
            className="brand-input mt-1 min-h-20 resize-y"
            placeholder="Evidencia curta ou observacao profissional. O texto completo continua no prontuario."
          />
        </div>
      )}

      {suggestions.length > 0 && (
        <div className="mt-5 rounded-xl border border-[#EAD8C2] bg-[#FFFDFC] p-4">
          <p className="mb-3 text-sm font-semibold text-[#3A3028]">Sugestoes para confirmar</p>
          <ul className="space-y-2">
            {suggestions.map((suggestion, index) => (
              <li key={`${suggestion.type}-${suggestion.normalizedCode}-${index}`} className="rounded-lg border border-[#EAD8C2] bg-[#FAF7F2] p-3">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-[#3A3028]">
                      {STRUCTURED_RESTRICTION_TYPE_LABELS[suggestion.type]} · {suggestion.label}
                    </p>
                    <p className="mt-1 line-clamp-2 text-xs text-[#75675E]">{suggestion.evidenceText}</p>
                    <p className="mt-1 text-[11px] text-[#A8927D]">Status sugerido: suspeito · confiança {suggestion.confidence}</p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => createMarker({ ...suggestion, source: "ai_suggestion_confirmed" }).then(() => setSuggestions((prev) => prev.filter((item) => item !== suggestion)))}
                      className="rounded-full bg-[#D4EDDA] px-3 py-1.5 text-xs font-semibold text-[#4A7C59]"
                    >
                      Confirmar
                    </button>
                    <button type="button" disabled={saving} onClick={() => rejectSuggestion(suggestion)} className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-[#8C6E52]">
                      Ignorar
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {message && <p className="mt-3 text-sm text-[#4F6847]">{message}</p>}
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
    </section>
  );
}

function NutritionRecordEditor({ clientId, onSaved }: { clientId: string; onSaved: () => void }) {
  const [record, setRecord] = useState<NutritionRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingSectionId, setEditingSectionId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Partial<Record<AnamnesisFieldKey, string>>>({});
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedSection, setSavedSection] = useState<string | null>(null);
  const [error, setError] = useState("");

  const loadRecord = () => {
    setLoading(true);
    setError("");
    fetch(`/api/admin/clients/${clientId}/nutrition-record`)
      .then((res) => {
        if (!res.ok) throw new Error();
        return res.json() as Promise<NutritionRecord>;
      })
      .then(setRecord)
      .catch(() => setError("Nao foi possivel carregar o prontuario."))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadRecord();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  const editingSection = ANAMNESIS_SECTIONS.find((section) => section.id === editingSectionId) ?? null;
  const answeredTotal = record
    ? ANAMNESIS_SECTIONS.reduce((total, section) => total + countAnsweredAnamnesisFields(record, section).answered, 0)
    : 0;

  function guardDirty(action: () => void) {
    if (dirty && !window.confirm("Existem alteracoes nao salvas nesta secao. Deseja descartar?")) return;
    action();
  }

  function startSectionEdit(section: AnamnesisSectionDefinition) {
    if (!record) return;
    guardDirty(() => {
      const sectionDraft: Partial<Record<AnamnesisFieldKey, string>> = {};
      for (const field of getVisibleAnamnesisFields(record, section)) {
        sectionDraft[field.key] = String(record[field.key] ?? "");
      }
      setDraft(sectionDraft);
      setEditingSectionId(section.id);
      setDirty(false);
      setError("");
      setSavedSection(null);
      window.setTimeout(() => document.getElementById(`anamnesis-editor-${section.id}`)?.focus(), 0);
    });
  }

  function updateDraft(field: AnamnesisFieldDefinition, value: string) {
    setDraft((prev) => {
      const next = { ...prev, [field.key]: value };
      if (field.key === "biological_sex" && value === "Masculino") {
        const lifeStage = next.life_stage;
        if (lifeStage && !availableAnamnesisLifeStages({ ...(record ?? {}), ...next } as NutritionRecord).includes(lifeStage)) {
          next.life_stage = "";
        }
      }
      return next;
    });
    setDirty(true);
    setSavedSection(null);
  }

  function cancelEdit() {
    guardDirty(() => {
      setEditingSectionId(null);
      setDraft({});
      setDirty(false);
      setError("");
    });
  }

  const handleSaveSection = async () => {
    if (!record || !editingSection) return;
    setSaving(true);
    setError("");
    const payload = sanitizeAnamnesisSectionPatch(editingSection, draft);
    try {
      const res = await fetch(`/api/admin/clients/${clientId}/nutrition-record`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...payload,
          expectedVersion: record.version,
          reason: `Atualizacao da secao ${editingSection.title}`,
        }),
      });
      if (res.status === 409) {
        const body = await res.json().catch(() => null);
        setError(body?.message ?? "O prontuário foi atualizado em outra sessão. Recarregue antes de salvar.");
        return;
      }
      if (!res.ok) throw new Error();
      setRecord(await res.json());
      setSavedSection(editingSection.id);
      setEditingSectionId(null);
      setDraft({});
      setDirty(false);
      onSaved();
      setTimeout(() => setSavedSection(null), 3000);
    } catch {
      setError("Nao foi possivel salvar esta secao. As respostas digitadas foram mantidas.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <AnamnesisSkeleton />;
  if (!record) {
    return (
      <section className="rounded-xl border border-[#F1D0C8] bg-[#FFF7F5] p-5">
        <h2 className="font-serif text-lg font-semibold text-[#3A3028]">Nao foi possivel carregar a anamnese.</h2>
        <p className="mt-2 text-sm text-[#8C6E52]">{error || "Tente novamente em alguns instantes."}</p>
        <button type="button" onClick={loadRecord} className="brand-btn-secondary mt-4 w-full sm:w-auto">
          <RefreshCw className="h-4 w-4" />
          Tentar novamente
        </button>
      </section>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="font-serif font-semibold text-lg text-[#B47F6A]">Anamnese</h2>
          <p className="mt-1 max-w-2xl text-sm text-[#8C6E52]">
            Prontuario estruturado para leitura rapida. Abra apenas a secao que precisa revisar ou atualizar.
          </p>
        </div>
        <div className="flex flex-col items-start gap-2 md:items-end">
          <div className="text-xs text-[#A8927D] md:text-right">
            <p>Atualizado em {formatDateSafe(record.updated_at, "dd/MM/yyyy HH:mm")}</p>
            <p>Versao {record.version} · {answeredTotal > 0 ? "registro parcial permitido" : "ainda sem respostas"}</p>
          </div>
          <a href="#nutrition-record-history" className="inline-flex items-center gap-1.5 rounded-full border border-[#D9C4B2] px-3 py-1.5 text-xs font-semibold text-[#8C6E52] transition hover:bg-white">
            Ver historico
          </a>
        </div>
      </div>

      {answeredTotal === 0 && (
        <section className="rounded-xl border border-dashed border-[#D9C4B2] bg-[#FFFDFC] p-5">
          <h3 className="font-serif text-base font-semibold text-[#3A3028]">Anamnese ainda nao preenchida.</h3>
          <p className="mt-2 text-sm text-[#8C6E52]">Comece pela primeira secao e salve parcialmente quando necessario.</p>
          <button type="button" onClick={() => startSectionEdit(ANAMNESIS_SECTIONS[0])} className="brand-btn-primary mt-4 w-full sm:w-auto">
            Comecar anamnese
          </button>
        </section>
      )}

      <section className="rounded-xl border border-[#EDE1D6] bg-[#FFFDFC] p-4">
        <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
          <div>
            <h3 className="font-serif text-base font-semibold text-[#3A3028]">Informacoes-chave</h3>
            <p className="mt-1 text-xs text-[#8C6E52]">Resumo clinico permanente, sem substituir os detalhes das secoes.</p>
          </div>
          {savedSection && <p className="text-sm font-semibold text-[#4F6847]" aria-live="polite">Secao salva.</p>}
        </div>
        <dl className="mt-4 grid gap-3 md:grid-cols-4">
          {getKeyClinicalInfo(record).map((item) => (
            <div key={item.label} className="min-w-0 rounded-lg border border-[#F1E5DA] bg-[#FBF7F1] p-3">
              <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[#8C6E52]">{item.label}</dt>
              <dd className="mt-1 line-clamp-3 text-sm text-[#3A3028]">{item.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <div className="grid gap-5 lg:grid-cols-[220px_minmax(0,1fr)]">
        <nav aria-label="Secoes da anamnese" className="lg:sticky lg:top-20 lg:self-start">
          <div className="grid gap-2 rounded-xl border border-[#EDE1D6] bg-[#FFFDFC] p-2 sm:grid-cols-2 lg:grid-cols-1">
            {ANAMNESIS_SECTIONS.map((section) => {
              const stats = countAnsweredAnamnesisFields(record, section);
              return (
                <a key={section.id} href={`#anamnesis-section-${section.id}`} className="rounded-lg px-3 py-2 text-left text-sm transition hover:bg-[#FBF7F1]">
                  <span className="font-semibold text-[#3A3028]">{section.title}</span>
                  <span className="mt-0.5 block text-xs text-[#8C6E52]">{stats.answered}/{stats.total} preenchidos</span>
                </a>
              );
            })}
          </div>
        </nav>

        <div className="space-y-4">
          {ANAMNESIS_SECTIONS.map((section) => {
            if (editingSection?.id === section.id) {
              return (
                <AnamnesisSectionEditor
                  key={section.id}
                  record={{ ...record, ...draft } as NutritionRecord}
                  section={section}
                  draft={draft}
                  saving={saving}
                  error={error}
                  onChange={updateDraft}
                  onCancel={cancelEdit}
                  onSave={handleSaveSection}
                />
              );
            }
            return (
              <AnamnesisSectionCard
                key={section.id}
                record={record}
                section={section}
                onEdit={() => startSectionEdit(section)}
              />
            );
          })}
        </div>
      </div>

      <StructuredRestrictionsPanel clientId={clientId} onChanged={onSaved} />
    </div>
  );
}

function AnamnesisSkeleton() {
  return (
    <div className="space-y-4" aria-label="Carregando anamnese">
      {[0, 1, 2].map((item) => (
        <div key={item} className="rounded-xl border border-[#EDE1D6] bg-[#FFFDFC] p-5">
          <div className="h-4 w-40 rounded bg-[#F1E5DA]" />
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <div className="h-16 rounded bg-[#FBF7F1]" />
            <div className="h-16 rounded bg-[#FBF7F1]" />
          </div>
        </div>
      ))}
    </div>
  );
}

function AnamnesisSectionCard({ record, section, onEdit }: { record: NutritionRecord; section: AnamnesisSectionDefinition; onEdit: () => void }) {
  const fields = getVisibleAnamnesisFields(record, section);
  const stats = countAnsweredAnamnesisFields(record, section);
  const hasAnyAnswer = stats.answered > 0;
  return (
    <section id={`anamnesis-section-${section.id}`} className="scroll-mt-24 rounded-xl border border-[#EDE1D6] bg-[#FFFDFC] p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="font-serif text-base font-semibold text-[#3A3028]">{section.title}</h3>
          <p className="mt-1 text-xs leading-5 text-[#8C6E52]">{section.description}</p>
        </div>
        <button type="button" onClick={onEdit} className="brand-btn-secondary w-full text-xs sm:w-auto">
          {hasAnyAnswer ? "Editar secao" : "Preencher"}
        </button>
      </div>
      {!hasAnyAnswer ? (
        <p className="mt-4 rounded-lg border border-dashed border-[#EAD8C2] bg-[#FBF7F1] p-4 text-sm text-[#8C6E52]">Nao preenchido</p>
      ) : (
        <dl className="mt-4 grid gap-x-6 gap-y-4 md:grid-cols-2">
          {fields.map((field) => (
            <AnamnesisReadField key={field.key} record={record} field={field} />
          ))}
        </dl>
      )}
    </section>
  );
}

function AnamnesisReadField({ record, field }: { record: NutritionRecord; field: AnamnesisFieldDefinition }) {
  const formatted = formatAnamnesisAnswer(record[field.key], field);
  const isEmpty = !hasAnamnesisValue(record[field.key]);
  return (
    <div className={field.longText ? "md:col-span-2" : undefined}>
      <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[#8C6E52]">{field.label}</dt>
      <dd className={`mt-1 whitespace-pre-wrap text-sm leading-6 ${isEmpty ? "text-[#A8927D]" : "text-[#3A3028]"} ${field.longText ? "line-clamp-4" : ""}`}>
        {formatted}
      </dd>
    </div>
  );
}

function AnamnesisSectionEditor({
  record,
  section,
  draft,
  saving,
  error,
  onChange,
  onCancel,
  onSave,
}: {
  record: NutritionRecord;
  section: AnamnesisSectionDefinition;
  draft: Partial<Record<AnamnesisFieldKey, string>>;
  saving: boolean;
  error: string;
  onChange: (field: AnamnesisFieldDefinition, value: string) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  const fields = getVisibleAnamnesisFields(record, section);
  return (
    <section
      id={`anamnesis-section-${section.id}`}
      className="scroll-mt-24 rounded-xl border border-[#D9E4D3] bg-[#F8FBF5] p-5"
      tabIndex={-1}
      aria-labelledby={`anamnesis-editor-title-${section.id}`}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 id={`anamnesis-editor-title-${section.id}`} className="font-serif text-base font-semibold text-[#3A3028]">
            Editar {section.title}
          </h3>
          <p className="mt-1 text-xs leading-5 text-[#607A56]">Somente esta secao esta em edicao. Cancelar restaura o estado salvo.</p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={onCancel} disabled={saving} className="brand-btn-secondary text-xs">
            Cancelar
          </button>
          <button type="button" onClick={onSave} disabled={saving} className="brand-btn-primary text-xs">
            <Save className="h-4 w-4" />
            {saving ? "Salvando..." : "Salvar secao"}
          </button>
        </div>
      </div>

      {error && <p className="mt-3 rounded-lg border border-red-200 bg-white p-3 text-sm text-red-600" role="alert">{error}</p>}

      <fieldset className="mt-4 grid gap-4 md:grid-cols-2">
        <legend className="sr-only">{section.title}</legend>
        {fields.map((field) => (
          <AnamnesisInput key={field.key} record={record} field={field} value={draft[field.key] ?? ""} onChange={(value) => onChange(field, value)} />
        ))}
      </fieldset>
    </section>
  );
}

function AnamnesisInput({ record, field, value, onChange }: { record: NutritionRecord; field: AnamnesisFieldDefinition; value: string; onChange: (value: string) => void }) {
  const inputId = `anamnesis-${field.key}`;
  const wrapperClassName = field.inputType === "textarea" || field.longText ? "md:col-span-2" : undefined;
  const options = field.key === "life_stage" ? availableAnamnesisLifeStages(record) : field.options;

  return (
    <div className={wrapperClassName}>
      <label htmlFor={inputId} className="brand-label">{field.label}</label>
      {field.inputType === "select" ? (
        <select id={inputId} value={value} onChange={(event) => onChange(event.target.value)} className="brand-input">
          <option value="">Nao informado</option>
          {(options ?? []).map((option) => (
            <option key={option} value={option}>
              {field.key === "target_group" ? PROTOCOL_TEMPLATE_GROUP_LABELS[option as keyof typeof PROTOCOL_TEMPLATE_GROUP_LABELS] ?? option : option}
            </option>
          ))}
        </select>
      ) : field.inputType === "textarea" ? (
        <textarea
          id={inputId}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          rows={field.rows ?? 2}
          className="brand-input resize-y"
          placeholder={field.placeholder ?? "Registrar resposta clinica."}
        />
      ) : (
        <input
          id={inputId}
          type={field.inputType === "date" ? "date" : "text"}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="brand-input"
          placeholder={field.placeholder ?? "Nao informado"}
        />
      )}
    </div>
  );
}

function SecondaryNavigation({ items, value, onChange }: {
  items: Array<{ id: string; label: string }>;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="mb-6 min-w-0">
      <div className="grid w-full min-w-0 grid-cols-2 gap-1 rounded-lg border border-[#EDE1D6] bg-[#FBF7F1] p-1 sm:inline-grid sm:w-auto sm:grid-flow-col sm:auto-cols-max sm:grid-cols-none">
        {items.map((item) => (
          <button key={item.id} type="button" onClick={() => onChange(item.id)} className={`min-h-10 min-w-0 rounded-md px-3 text-center text-[11px] font-semibold leading-tight transition-colors sm:h-9 sm:whitespace-nowrap sm:text-xs ${value === item.id ? "bg-[#FFFDFC] text-[#607A56] shadow-sm" : "text-[#75675E] hover:text-[#3A3028]"}`}>
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function formatDateTime(value: string | null): string {
  return formatDateSafe(value, "dd/MM/yyyy HH:mm");
}

function formatAgeLabel(ageYears: number | null): string {
  return ageYears === null ? "Idade não informada" : `${ageYears} anos`;
}

function formatWeight(value: number | null | undefined): string | null {
  return typeof value === "number" ? `${value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} kg` : null;
}

function formatTrend(trend: PatientRecordSummaryViewModel["weightTrend"]): string | null {
  if (!trend) return null;
  if (trend.direction === "stable") return "Sem variação desde a última avaliação";
  const arrow = trend.direction === "down" ? "↓" : "↑";
  return `${arrow} ${Math.abs(trend.absoluteChangeKg).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} kg desde a última avaliação`;
}

function SummaryCard({
  title,
  value,
  detail,
  action,
}: {
  title: string;
  value: string;
  detail?: string | null;
  action?: ReactNode;
}) {
  return (
    <section className="rounded-lg border border-[#EDE1D6] bg-[#FFFDFC] p-4">
      <div className="flex min-h-28 flex-col justify-between gap-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#8C6E52]">{title}</p>
          <p className="mt-2 text-lg font-semibold leading-tight text-[#3A3028]">{value}</p>
          {detail && <p className="mt-1 text-xs leading-5 text-[#75675E]">{detail}</p>}
        </div>
        {action}
      </div>
    </section>
  );
}

function WeightSparkline({ series }: { series: PatientRecordSummaryViewModel["weightSeries"] }) {
  if (series.length < 2) return null;
  const values = series.map((point) => point.weightKg);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const points = series.map((point, index) => {
    const x = series.length === 1 ? 0 : (index / (series.length - 1)) * 100;
    const y = 36 - ((point.weightKg - min) / span) * 28;
    return `${x},${y}`;
  }).join(" ");
  return (
    <svg viewBox="0 0 100 40" role="img" aria-label="Evolução recente de peso" className="h-16 w-full">
      <polyline points={points} fill="none" stroke="#607A56" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      {series.map((point, index) => {
        const x = series.length === 1 ? 0 : (index / (series.length - 1)) * 100;
        const y = 36 - ((point.weightKg - min) / span) * 28;
        return <circle key={`${point.date}-${index}`} cx={x} cy={y} r="2.6" fill="#B47F6A" />;
      })}
    </svg>
  );
}

const TIMELINE_FILTERS: Array<{ id: PatientTimelineFilter; label: string }> = [
  { id: "all", label: "Todos" },
  { id: "consultations", label: "Consultas" },
  { id: "anthropometry", label: "Avaliações" },
  { id: "meal_plans", label: "Planos" },
  { id: "protocols", label: "Protocolos" },
];

function timelineIcon(event: PatientTimelineEvent) {
  if (event.type === "CONSULTATION_COMPLETED") return Stethoscope;
  if (event.type === "ANTHROPOMETRY_RECORDED") return Activity;
  if (event.type === "MEAL_PLAN_PUBLISHED") return Utensils;
  return BookOpen;
}

function formatTimelineDate(value: string, fmt = "dd MMM yyyy"): string {
  return formatDateSafe(value, fmt).replace(".", "");
}

function TimelineEventList({ events, compact = false }: { events: PatientTimelineEvent[]; compact?: boolean }) {
  return (
    <div className="relative">
      <div className="absolute bottom-0 left-4 top-0 w-px bg-[#EAD8C2]" aria-hidden="true" />
      <ul className="space-y-3 pl-10" aria-label={compact ? "Atividade clinica recente" : "Timeline clinica"}>
        {events.map((event) => {
          const Icon = timelineIcon(event);
          return (
            <li key={event.id} className="relative">
              <span className="absolute -left-[2.35rem] top-1 flex h-8 w-8 items-center justify-center rounded-full border border-[#EAD8C2] bg-[#FFFDFC] text-[#607A56]">
                <Icon className="h-4 w-4" aria-hidden="true" />
              </span>
              <div className="rounded-lg border border-[#EDE1D6] bg-[#FFFDFC] p-4">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <time dateTime={event.occurredAt} className="text-xs font-semibold uppercase text-[#8C6E52]">
                      {formatTimelineDate(event.occurredAt, compact ? "dd MMM" : "dd MMM yyyy")}
                    </time>
                    <p className="mt-1 font-semibold text-[#3A3028]">{event.title}</p>
                  </div>
                  <span className="w-fit rounded-full bg-[#FBF7F1] px-2.5 py-1 text-[11px] font-semibold text-[#75675E]">
                    {event.type.replaceAll("_", " ").toLowerCase()}
                  </span>
                </div>
                {event.summary.length > 0 && (
                  <ul className="mt-3 space-y-1 text-sm text-[#75675E]">
                    {event.summary.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                )}
                {event.href && (
                  <Link href={event.href} className="mt-3 inline-flex min-h-8 items-center gap-1 text-xs font-semibold text-[#607A56] hover:text-[#3A3028]">
                    {event.type === "MEAL_PLAN_PUBLISHED" ? "Abrir plano" : event.type === "ANTHROPOMETRY_RECORDED" ? "Ver avaliação" : event.type === "CONSULTATION_COMPLETED" ? "Ver consulta" : "Abrir"}
                    <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </Link>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function RecentActivity({
  events,
  onOpenTimeline,
  onStartConsultation,
  onNewAnthropometry,
  archived,
}: {
  events: PatientTimelineEvent[];
  onOpenTimeline: () => void;
  onStartConsultation: () => void;
  onNewAnthropometry: () => void;
  archived: boolean;
}) {
  return (
    <section className="rounded-lg border border-[#EDE1D6] bg-[#FFFDFC] p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="brand-kicker">Atividade clínica recente</p>
          <h3 className="mt-1 font-serif text-lg font-semibold text-[#3A3028]">Linha do tempo</h3>
        </div>
        <button type="button" onClick={onOpenTimeline} className="brand-btn-secondary w-full sm:w-auto">
          <Clock className="h-4 w-4" />
          Ver histórico completo
        </button>
      </div>
      {events.length ? (
        <div className="mt-5">
          <TimelineEventList events={events.slice(0, 5)} compact />
        </div>
      ) : (
        <div className="mt-4 rounded-lg border border-dashed border-[#D9C4B2] p-5 text-sm text-[#75675E]">
          <p>Ainda não há eventos clínicos registrados.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={onStartConsultation} disabled={archived} className="brand-btn-secondary disabled:cursor-not-allowed disabled:opacity-50">Iniciar consulta</button>
            <button type="button" onClick={onNewAnthropometry} disabled={archived} className="brand-btn-secondary disabled:cursor-not-allowed disabled:opacity-50">Registrar avaliação</button>
          </div>
        </div>
      )}
    </section>
  );
}

function TimelineSkeleton() {
  return (
    <div className="space-y-3" aria-label="Carregando histórico clínico">
      {[0, 1, 2].map((item) => (
        <div key={item} className="h-24 animate-pulse rounded-lg border border-[#EDE1D6] bg-[#FBF7F1]" />
      ))}
    </div>
  );
}

function PatientClinicalTimeline({
  result,
  filter,
  loading,
  error,
  onFilterChange,
  onLoadMore,
  onRetry,
  onStartConsultation,
  onNewAnthropometry,
  archived,
}: {
  result: PatientTimelineResult | null;
  filter: PatientTimelineFilter;
  loading: boolean;
  error: string;
  onFilterChange: (filter: PatientTimelineFilter) => void;
  onLoadMore: () => void;
  onRetry: () => void;
  onStartConsultation: () => void;
  onNewAnthropometry: () => void;
  archived: boolean;
}) {
  const events = result?.events ?? [];
  return (
    <div className="space-y-5" data-testid="patient-clinical-timeline">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="brand-kicker">Histórico clínico</p>
          <h2 className="mt-1 font-serif text-2xl font-semibold text-[#3A3028]">Timeline clínica</h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-[#75675E]">
            Sequência de consultas finalizadas, avaliações, planos publicados e protocolos.
          </p>
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filtros da timeline">
          {TIMELINE_FILTERS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onFilterChange(item.id)}
              className={`min-h-9 rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
                filter === item.id
                  ? "border-[#607A56] bg-[#607A56] text-white"
                  : "border-[#EAD8C2] bg-[#FFFDFC] text-[#8C6E52] hover:bg-[#FBF7F1]"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {loading && !result ? (
        <TimelineSkeleton />
      ) : error ? (
        <div className="rounded-lg border border-[#E8C3BA] bg-[#FFF7F5] p-5 text-sm text-[#9A5C4E]">
          <p>Não foi possível carregar o histórico.</p>
          <button type="button" onClick={onRetry} className="mt-3 text-xs font-semibold text-[#607A56] hover:text-[#3A3028]">Tentar novamente</button>
        </div>
      ) : events.length === 0 ? (
        <div className="rounded-lg border border-dashed border-[#D9C4B2] bg-[#FFFDFC] p-8 text-center">
          <Clock className="mx-auto mb-3 h-9 w-9 text-[#D9C4B2]" aria-hidden="true" />
          <p className="text-sm font-semibold text-[#3A3028]">Ainda não há eventos clínicos registrados.</p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <button type="button" onClick={onStartConsultation} disabled={archived} className="brand-btn-secondary disabled:cursor-not-allowed disabled:opacity-50">Iniciar consulta</button>
            <button type="button" onClick={onNewAnthropometry} disabled={archived} className="brand-btn-secondary disabled:cursor-not-allowed disabled:opacity-50">Registrar avaliação</button>
          </div>
        </div>
      ) : (
        <>
          <TimelineEventList events={events} />
          {result?.hasMore && (
            <div className="flex justify-center">
              <button type="button" onClick={onLoadMore} disabled={loading} className="brand-btn-secondary">
                {loading ? "Carregando..." : "Carregar mais"}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function PatientOverview({
  summary,
  recentActivity,
  onStartConsultation,
  onOpenPlan,
  onNewAnthropometry,
  onOpenTimeline,
}: {
  summary: PatientRecordSummaryViewModel;
  recentActivity: PatientTimelineEvent[];
  onStartConsultation: () => void;
  onOpenPlan: () => void;
  onNewAnthropometry: () => void;
  onOpenTimeline: () => void;
}) {
  const archived = summary.patient.status === "arquivado";
  const weightValue = formatWeight(summary.latestAnthropometry?.weightKg);
  const trend = formatTrend(summary.weightTrend);
  const bmi = summary.latestAnthropometry?.bmi;

  return (
    <div className="space-y-6" data-testid="patient-record-overview">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          <section className="rounded-lg border border-[#EDE1D6] bg-[#FFFDFC] p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="brand-kicker">Estado clínico atual</p>
                <h2 className="mt-1 font-serif text-xl font-semibold text-[#3A3028]">Resumo do prontuário</h2>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={onStartConsultation} disabled={archived} className="brand-btn-primary disabled:cursor-not-allowed disabled:opacity-50">
                  <Stethoscope className="h-4 w-4" />
                  {summary.activeConsultation ? "Retomar consulta" : "Iniciar consulta"}
                </button>
                <button type="button" onClick={onNewAnthropometry} disabled={archived} className="brand-btn-secondary disabled:cursor-not-allowed disabled:opacity-50">
                  <Activity className="h-4 w-4" />
                  Nova avaliação
                </button>
                <button type="button" onClick={onOpenPlan} className="brand-btn-secondary">
                  <Utensils className="h-4 w-4" />
                  Abrir plano
                </button>
              </div>
            </div>
          </section>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <SummaryCard
              title="Última consulta"
              value={summary.latestConsultation ? formatDateSafe(summary.latestConsultation.date) : "Nenhuma consulta registrada"}
              detail={summary.latestConsultation ? `Status: ${summary.latestConsultation.status}` : "Comece o primeiro atendimento pelo Modo Consulta."}
              action={!summary.latestConsultation ? (
                <button type="button" onClick={onStartConsultation} disabled={archived} className="text-left text-xs font-semibold text-[#607A56] hover:text-[#3A3028] disabled:opacity-50">Iniciar primeira consulta</button>
              ) : null}
            />
            <SummaryCard
              title="Próxima consulta"
              value={summary.nextAppointment ? formatDateTime(summary.nextAppointment.date) : "Nenhum retorno agendado"}
              detail={summary.nextAppointment?.title ?? "Agenda completa permanece no módulo de agenda."}
              action={!summary.nextAppointment ? (
                <Link href="/dashboard/agenda" className="text-xs font-semibold text-[#607A56] hover:text-[#3A3028]">Agendar retorno</Link>
              ) : null}
            />
            <SummaryCard
              title="Peso atual"
              value={weightValue ?? "Nenhuma avaliação registrada"}
              detail={trend ?? (summary.latestAnthropometry?.date ? formatDateSafe(summary.latestAnthropometry.date) : "Registre a primeira avaliação para acompanhar evolução.")}
              action={!weightValue ? (
                <button type="button" onClick={onNewAnthropometry} disabled={archived} className="text-left text-xs font-semibold text-[#607A56] hover:text-[#3A3028] disabled:opacity-50">Registrar avaliação</button>
              ) : null}
            />
            <SummaryCard
              title="Plano alimentar"
              value={summary.activeMealPlan ? `Ativo · v${summary.activeMealPlan.version}` : "Nenhum plano ativo"}
              detail={summary.activeMealPlan ? `${summary.activeMealPlan.title} · atualizado em ${formatDateSafe(summary.activeMealPlan.updatedAt)}` : "Crie ou publique um plano antes de entregar ao portal."}
              action={<button type="button" onClick={onOpenPlan} className="text-left text-xs font-semibold text-[#607A56] hover:text-[#3A3028]">{summary.activeMealPlan ? "Abrir plano" : "Criar plano"}</button>}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.65fr)]">
            <section className="rounded-lg border border-[#EDE1D6] bg-[#FFFDFC] p-5">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="brand-kicker">Evolução corporal</p>
                  <h3 className="mt-1 font-serif text-lg font-semibold text-[#3A3028]">Peso e indicadores recentes</h3>
                </div>
                {bmi !== null && bmi !== undefined && (
                  <span className="w-fit rounded-full bg-[#EAF0E4] px-3 py-1 text-xs font-semibold text-[#4F6847]">IMC {bmi.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}</span>
                )}
              </div>
              {summary.latestAnthropometry ? (
                <div className="mt-4 grid gap-4 sm:grid-cols-[0.9fr_1.1fr]">
                  <div className="space-y-3 text-sm">
                    <p className="flex justify-between gap-3"><span className="text-[#75675E]">Data</span><strong className="text-[#3A3028]">{formatDateSafe(summary.latestAnthropometry.date)}</strong></p>
                    <p className="flex justify-between gap-3"><span className="text-[#75675E]">Cintura</span><strong className="text-[#3A3028]">{summary.latestAnthropometry.waistCm ?? "—"}</strong></p>
                    <p className="flex justify-between gap-3"><span className="text-[#75675E]">% gordura</span><strong className="text-[#3A3028]">{summary.latestAnthropometry.bodyFatPercent ?? "—"}</strong></p>
                  </div>
                  <div className="rounded-lg bg-[#FBF7F1] p-3">
                    <WeightSparkline series={summary.weightSeries} />
                    {summary.weightSeries.length < 2 && <p className="text-sm text-[#75675E]">Registre ao menos duas avaliações para ver tendência.</p>}
                  </div>
                </div>
              ) : (
                <div className="mt-4 rounded-lg border border-dashed border-[#D9C4B2] p-5 text-sm text-[#75675E]">
                  Nenhuma avaliação antropométrica registrada.
                </div>
              )}
            </section>

            <section className="rounded-lg border border-[#EDE1D6] bg-[#FFFDFC] p-5">
              <p className="brand-kicker">Pendências objetivas</p>
              <h3 className="mt-1 font-serif text-lg font-semibold text-[#3A3028]">Próximas ações</h3>
              {summary.pendingActions.length ? (
                <ul className="mt-4 space-y-2">
                  {summary.pendingActions.map((action) => (
                    <li key={action.id} className="rounded-lg border border-[#EDE1D6] bg-[#FBF7F1] p-3 text-sm">
                      <p className="font-semibold text-[#3A3028]">{action.title}</p>
                      {action.href && <Link href={action.href} className="mt-1 inline-block text-xs font-semibold text-[#607A56] hover:text-[#3A3028]">Abrir</Link>}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-4 text-sm text-[#75675E]">Nenhuma pendência objetiva no resumo.</p>
              )}
            </section>
          </div>

          <RecentActivity
            events={recentActivity}
            onOpenTimeline={onOpenTimeline}
            onStartConsultation={onStartConsultation}
            onNewAnthropometry={onNewAnthropometry}
            archived={archived}
          />
        </div>

        <aside className="space-y-4">
          <section className="rounded-lg border border-[#EDE1D6] bg-[#FFFDFC] p-5">
            <p className="brand-kicker">Informações importantes</p>
            <h3 className="mt-1 font-serif text-lg font-semibold text-[#3A3028]">Restrições e alertas</h3>
            {summary.keyRestrictions.length ? (
              <ul className="mt-4 space-y-2">
                {summary.keyRestrictions.map((restriction) => (
                  <li key={restriction.id} className="rounded-lg bg-[#FBEAE4] px-3 py-2 text-sm text-[#7D3D2A]">
                    <span className="font-semibold">{restriction.label}</span>
                    <span className="ml-2 text-xs opacity-80">{restriction.type}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-4 text-sm text-[#75675E]">Nenhuma restrição estruturada ativa registrada.</p>
            )}
          </section>

          <section className="rounded-lg border border-[#EDE1D6] bg-[#FFFDFC] p-5">
            <p className="brand-kicker">Plano e protocolos</p>
            <h3 className="mt-1 font-serif text-lg font-semibold text-[#3A3028]">Acompanhamento ativo</h3>
            <div className="mt-4 space-y-3 text-sm">
              {summary.draftMealPlan && (
                <div className="rounded-lg border border-[#EAD8C2] bg-[#FBF7F1] p-3">
                  <p className="font-semibold text-[#3A3028]">Rascunho v{summary.draftMealPlan.version} em andamento</p>
                  <button type="button" onClick={onOpenPlan} className="mt-1 text-xs font-semibold text-[#607A56] hover:text-[#3A3028]">Continuar edição</button>
                </div>
              )}
              {summary.activeProtocols.length ? summary.activeProtocols.map((protocol) => (
                <div key={protocol.id} className="rounded-lg border border-[#D9E4D3] bg-[#F4F8F1] p-3">
                  <p className="font-semibold text-[#3A3028]">{protocol.title ?? "Protocolo ativo"}</p>
                  <p className="text-xs text-[#75675E]">Iniciado em {formatDateSafe(protocol.startedAt)}</p>
                </div>
              )) : <p className="text-sm text-[#75675E]">Nenhum protocolo ativo vinculado.</p>}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}

export default function ClientWorkspace({
  initialData,
  initialSummary,
  initialRecentActivity,
}: {
  initialData: ClientSnapshot;
  initialSummary: PatientRecordSummaryViewModel;
  initialRecentActivity: PatientTimelineResult;
}) {
  const id = initialData.client.id;
  const router = useRouter();
  const searchParams = useSearchParams();

  const [activeTab, setActiveTab] = useState<TabId>(() => resolveTabFromParam(searchParams.get("tab")));

  useEffect(() => {
    setActiveTab(resolveTabFromParam(searchParams.get("tab")));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams.get("tab")]);
  const [planView, setPlanView] = useState<"dieta" | "protocolos">("dieta");
  const [evolutionView, setEvolutionView] = useState<"timeline" | "agenda" | "tarefas" | "financeiro" | "relatorios">("timeline");
  const [moreView, setMoreView] = useState<"cadastro" | "portal" | "administrativo">("cadastro");
  const data = initialData.client;
  const clinicalSummary = initialData.clinicalSummary;
  const [patientSummary, setPatientSummary] = useState(initialSummary);
  const [recentActivity, setRecentActivity] = useState(initialRecentActivity.events);
  const [clinicalTimeline, setClinicalTimeline] = useState<PatientTimelineResult | null>(null);
  const [timelineFilter, setTimelineFilter] = useState<PatientTimelineFilter>("all");
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [timelineError, setTimelineError] = useState("");


  // Resumo edit state
  const [name, setName] = useState(initialData.client.name);
  const [email, setEmail] = useState(initialData.client.email ?? "");
  const [phone, setPhone] = useState(initialData.client.phone ?? "");
  const [birthDate, setBirthDate] = useState(initialData.client.birth_date ?? "");
  const [status, setStatus] = useState(initialData.client.status);
  const [notes, setNotes] = useState(initialData.client.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingClient, setDeletingClient] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  async function startConsultation() {
    if (patientSummary.patient.status === "arquivado") return;
    try {
      await fetch(`/api/admin/clients/${id}/consultation`, { method: "POST" });
    } finally {
      router.push(`/dashboard/clients/${id}/consulta`);
    }
  }

  async function reloadPatientSummary() {
    const response = await fetch(`/api/admin/clients/${id}/record-summary`, { cache: "no-store" });
    if (response.ok) setPatientSummary(await response.json() as PatientRecordSummaryViewModel);
  }

  async function loadRecentActivity() {
    const response = await fetch(`/api/admin/clients/${id}/record-timeline?limit=5`, { cache: "no-store" });
    if (response.ok) {
      const result = await response.json() as PatientTimelineResult;
      setRecentActivity(result.events);
    }
  }

  async function loadClinicalTimeline(options: { filter?: PatientTimelineFilter; offset?: number; append?: boolean } = {}) {
    const nextFilter = options.filter ?? timelineFilter;
    const nextOffset = options.offset ?? 0;
    setTimelineLoading(true);
    setTimelineError("");
    try {
      const params = new URLSearchParams({
        limit: "20",
        offset: String(nextOffset),
        filter: nextFilter,
      });
      const response = await fetch(`/api/admin/clients/${id}/record-timeline?${params}`, { cache: "no-store" });
      if (!response.ok) throw new Error();
      const result = await response.json() as PatientTimelineResult;
      setClinicalTimeline((current) => options.append && current
        ? { ...result, events: [...current.events, ...result.events] }
        : result);
    } catch {
      setTimelineError("Não foi possível carregar o histórico.");
    } finally {
      setTimelineLoading(false);
    }
  }

  function openPlanTab() {
    setActiveTab("plano-alimentar");
    setPlanView("dieta");
  }

  function openTimelineTab() {
    setActiveTab("evolucao");
  }

  function openNewAnthropometry() {
    if (patientSummary.patient.status === "arquivado") return;
    setActiveTab("antropometria");
    setShowEvolutionForm(true);
  }

  // Protocols
  const [protocols, setProtocols] = useState<ClientProtocol[]>([]);
  const [protocolsLoading, setProtocolsLoading] = useState(false);
  const [protocolLibrary, setProtocolLibrary] = useState<ProtocolLibraryItem[]>([]);
  const [selectedProtocolId, setSelectedProtocolId] = useState("");
  const [protocolStartDate, setProtocolStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [protocolReviewDate, setProtocolReviewDate] = useState("");
  const [protocolProfessionalNotes, setProtocolProfessionalNotes] = useState("");
  const [personalizedTitle, setPersonalizedTitle] = useState("");
  const [createProtocolTasks, setCreateProtocolTasks] = useState(true);
  const [protocolActionLoading, setProtocolActionLoading] = useState(false);
  const [protocolMessage, setProtocolMessage] = useState("");
  const [createdPersonalizedProtocolId, setCreatedPersonalizedProtocolId] = useState("");

  // Tasks
  const [tasks, setTasks] = useState<ClientTask[]>([]);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [taskStatusFilter, setTaskStatusFilter] = useState("");

  // Evolutions
  const [evolutions, setEvolutions] = useState<ClientEvolution[]>([]);
  const [evolutionsLoading, setEvolutionsLoading] = useState(false);
  const [showEvolutionForm, setShowEvolutionForm] = useState(false);
  const [clinicalGrowth, setClinicalGrowth] = useState<ClinicalGrowthResponse | null>(null);
  const [clinicalGrowthLoading, setClinicalGrowthLoading] = useState(false);

  // Agenda and finance
  const [appointments, setAppointments] = useState<ClientAppointment[]>([]);
  const [appointmentsLoading, setAppointmentsLoading] = useState(false);
  const [payments, setPayments] = useState<ClientPayment[]>([]);
  const [paymentsLoading, setPaymentsLoading] = useState(false);
  const [portalAccess, setPortalAccess] = useState<ClientPortalAccessState | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);
  const [portalCode, setPortalCode] = useState("");
  const [portalError, setPortalError] = useState("");



  useEffect(() => {
    if (activeTab === "plano-alimentar" && planView === "protocolos" && protocols.length === 0) {
      setProtocolsLoading(true);
      Promise.all([
        fetch(`/api/admin/clients/${id}/protocols`).then((r) => r.json() as Promise<ClientProtocol[]>),
        fetch("/api/admin/protocols?kind=standard&isActive=true&pageSize=100").then((r) => r.json() as Promise<{ items: ProtocolLibraryItem[] }>),
      ])
        .then(([assigned, library]) => {
          setProtocols(assigned ?? []);
          setProtocolLibrary(library.items ?? []);
        })
        .catch(() => null).finally(() => setProtocolsLoading(false));
    }
    if (activeTab === "mais" && moreView === "portal" && !portalAccess) {
      reloadPortalAccess();
    }
    if ((activeTab === "consultas" || (activeTab === "evolucao" && evolutionView === "agenda")) && appointments.length === 0) {
      setAppointmentsLoading(true);
      fetch(`/api/admin/appointments?clientId=${id}`)
        .then((r) => r.json()).then((d: { items: ClientAppointment[] }) => setAppointments(d.items ?? []))
        .catch(() => null).finally(() => setAppointmentsLoading(false));
    }
    if (((activeTab === "mais" && moreView === "administrativo") || (activeTab === "evolucao" && evolutionView === "financeiro")) && payments.length === 0) {
      setPaymentsLoading(true);
      fetch(`/api/admin/payments?clientId=${id}`)
        .then((r) => r.json()).then((d: { items: ClientPayment[] }) => setPayments(d.items ?? []))
        .catch(() => null).finally(() => setPaymentsLoading(false));
    }
    if (activeTab === "antropometria" && evolutions.length === 0) {
      setEvolutionsLoading(true);
      fetch(`/api/admin/clients/${id}/evolutions`)
        .then((r) => r.json()).then((d: ClientEvolution[]) => setEvolutions(d ?? []))
        .catch(() => null).finally(() => setEvolutionsLoading(false));
    }
    if (activeTab === "antropometria" && !clinicalGrowth) {
      setClinicalGrowthLoading(true);
      fetch(`/api/admin/clients/${id}/clinical-growth`)
        .then((r) => r.ok ? r.json() as Promise<ClinicalGrowthResponse> : null)
        .then((result) => result && setClinicalGrowth(result))
        .catch(() => null).finally(() => setClinicalGrowthLoading(false));
    }
    if (activeTab === "evolucao" && !clinicalTimeline && !timelineLoading) {
      void loadClinicalTimeline({ filter: timelineFilter, offset: 0 });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, id, moreView, planView, evolutionView, timelineFilter]);

  useEffect(() => {
    if (activeTab === "evolucao" && evolutionView === "tarefas") {
      setTasksLoading(true);
      const params = new URLSearchParams(taskStatusFilter ? { status: taskStatusFilter } : {});
      fetch(`/api/admin/clients/${id}/tasks?${params}`)
        .then((r) => r.json()).then((d: ClientTask[]) => setTasks(d ?? []))
        .catch(() => null).finally(() => setTasksLoading(false));
    }
  }, [taskStatusFilter, activeTab, evolutionView, id]);

  const reloadClientProtocols = async () => {
    const response = await fetch(`/api/admin/clients/${id}/protocols`);
    if (response.ok) setProtocols(await response.json() as ClientProtocol[]);
  };

  const deleteCurrentClient = async () => {
    setDeletingClient(true);
    setDeleteError("");
    try {
      const response = await fetch(`/api/admin/clients/${id}`, { method: "DELETE" });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.message ?? "Nao foi possivel excluir o paciente.");
      router.push("/dashboard/clients");
      router.refresh();
    } catch (cause) {
      setDeleteError(cause instanceof Error ? cause.message : "Nao foi possivel excluir o paciente.");
      setDeletingClient(false);
    }
  };

  const startProtocol = async (personalized: boolean) => {
    if (!personalized && !selectedProtocolId) {
      setProtocolMessage("Selecione um protocolo padrão.");
      return;
    }
    if (personalized && !personalizedTitle.trim()) {
      setProtocolMessage("Dê um nome ao protocolo personalizado.");
      return;
    }

    setProtocolActionLoading(true);
    setProtocolMessage("");
    setCreatedPersonalizedProtocolId("");
    try {
      const body = personalized
        ? {
            mode: "create_personalized",
            baseProtocolId: selectedProtocolId || null,
            title: personalizedTitle.trim(),
            startedAt: protocolStartDate,
            reviewDate: protocolReviewDate || null,
            professionalNotes: protocolProfessionalNotes || null,
            createTasks: createProtocolTasks,
          }
        : {
            mode: "apply",
            protocolId: selectedProtocolId,
            startedAt: protocolStartDate,
            reviewDate: protocolReviewDate || null,
            professionalNotes: protocolProfessionalNotes || null,
            createTasks: createProtocolTasks,
          };
      const response = await fetch(`/api/admin/clients/${id}/protocols`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "Não foi possível iniciar o protocolo.");
      await reloadClientProtocols();
      setProtocolMessage(`Protocolo iniciado. ${result.tasksCreated ?? 0} tarefa(s) criada(s).`);
      if (personalized) setCreatedPersonalizedProtocolId(result.protocolId);
      setPersonalizedTitle("");
      setProtocolProfessionalNotes("");
    } catch (cause) {
      setProtocolMessage(cause instanceof Error ? cause.message : "Não foi possível iniciar o protocolo.");
    } finally {
      setProtocolActionLoading(false);
    }
  };

  const updateAssignedProtocol = async (
    clientProtocolId: string,
    patch: { status?: string; reviewDate?: string | null; professionalNotes?: string | null }
  ) => {
    setProtocolMessage("");
    const response = await fetch(`/api/admin/clients/${id}/protocols/${clientProtocolId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const result = await response.json();
    if (!response.ok) {
      setProtocolMessage(result.message || "Não foi possível atualizar o protocolo.");
      return;
    }
    await reloadClientProtocols();
    setProtocolMessage("Acompanhamento do protocolo atualizado.");
  };

  const handleSave = async () => {
    setSaving(true); setSaved(false); setSaveError("");
    try {
      const res = await fetch(`/api/admin/clients/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name || undefined, email: email || null, phone: phone || null, birth_date: birthDate || null, status, notes: notes || null }),
      });
      if (!res.ok) throw new Error();
      await reloadPatientSummary();
      setSaved(true); setTimeout(() => setSaved(false), 3000);
    } catch {
      setSaveError("Não foi possível salvar. Tente novamente.");
    } finally {
      setSaving(false);
    }
  };

  const handleTaskStatus = async (taskId: string, newStatus: string) => {
    await fetch(`/api/admin/client-tasks/${taskId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    setTasks((prev) => prev.map((t) => t.id === taskId ? { ...t, status: newStatus } : t));
  };

  const handleDeleteEvolution = async (evolutionId: string) => {
    if (!confirm("Remover este registro de evolução?")) return;
    await fetch(`/api/admin/client-evolutions/${evolutionId}`, { method: "DELETE" });
    setEvolutions((prev) => prev.filter((e) => e.id !== evolutionId));
    setClinicalGrowth(null);
  };

  const reloadEvolutions = () => {
    setEvolutionsLoading(true);
    fetch(`/api/admin/clients/${id}/evolutions`)
      .then((r) => r.json()).then((d: ClientEvolution[]) => setEvolutions(d ?? []))
      .catch(() => null).finally(() => setEvolutionsLoading(false));
    setClinicalGrowth(null);
    setShowEvolutionForm(false);
    void reloadPatientSummary();
  };

  const reloadTimeline = () => {
    void loadRecentActivity();
    if (activeTab === "evolucao") {
      void loadClinicalTimeline({ filter: timelineFilter, offset: 0 });
    }
    void reloadPatientSummary();
  };

  async function reloadPortalAccess() {
    setPortalLoading(true); setPortalError("");
    try {
      const response = await fetch(`/api/admin/clients/${id}/portal-access`, { cache: "no-store" });
      if (!response.ok) throw new Error();
      setPortalAccess(await response.json());
    } catch {
      setPortalError("Nao foi possivel carregar o acesso ao portal.");
    } finally {
      setPortalLoading(false);
    }
  }

  const generatePortalCode = async () => {
    setPortalLoading(true); setPortalError(""); setPortalCode("");
    try {
      const response = await fetch(`/api/admin/clients/${id}/portal-access`, { method: "POST" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message);
      setPortalCode(result.code);
      await reloadPortalAccess();
    } catch (err) {
      setPortalError(err instanceof Error ? err.message : "Nao foi possivel gerar o codigo do portal.");
    } finally {
      setPortalLoading(false);
    }
  };

  const togglePortalAccess = async (active: boolean) => {
    setPortalLoading(true); setPortalError("");
    try {
      const response = await fetch(`/api/admin/clients/${id}/portal-access`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active }),
      });
      if (!response.ok) throw new Error();
      await reloadPortalAccess();
    } catch {
      setPortalError("Nao foi possivel atualizar o acesso ao portal.");
    } finally {
      setPortalLoading(false);
    }
  };


  const hasClinicalGrowth =
    Boolean(clinicalGrowth?.pediatric.applicable && clinicalGrowth.pediatric.results.length) ||
    Boolean(clinicalGrowth?.gestational.applicable) ||
    Boolean(clinicalGrowth?.bariatric.applicable);

  return (
    <div className="mx-auto w-full min-w-0 max-w-7xl space-y-6 pb-16 animate-fade-up">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Link href="/dashboard/clients"
          className="inline-flex items-center gap-2 text-sm text-[#7A9A74] hover:text-[#B47F6A] transition-colors font-medium">
          <ArrowLeft className="w-4 h-4" />
          Pacientes
        </Link>
        <Link href={`/dashboard/clients/${id}/print`} target="_blank" className="inline-flex min-h-10 items-center justify-center gap-2 rounded-full border border-[#EAD8C2] px-4 py-2 text-xs font-medium text-[#8C6E52] transition-colors hover:bg-[#EAD8C2]/40 sm:w-auto">
          <Printer className="w-3.5 h-3.5" />
          Relatório imprimível
        </Link>
      </div>

      {/* Patient workspace */}
      <div className="brand-card w-full min-w-0 overflow-hidden">
        <header className="border-b border-[#EAD8C2] bg-[#FAF7F2] p-5 sm:p-6">
          <div className="flex min-w-0 flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="min-w-0 break-words font-serif text-3xl font-semibold leading-tight text-[#3A2B1F] sm:truncate">{patientSummary.patient.name}</h1>
                <span className={STATUS_BADGE[patientSummary.patient.status] ?? "brand-badge brand-badge-arquivado"}>{patientSummary.patient.statusLabel}</span>
              </div>
              <p className="mt-1 text-sm text-[#75675E]">{formatAgeLabel(patientSummary.patient.ageYears)} · Paciente desde {formatDateSafe(data.created_at)}</p>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-[#3A3028]">
                <span className="font-semibold text-[#8C6E52]">Objetivo: </span>
                {patientSummary.patient.primaryGoal || "Defina o objetivo principal na anamnese."}
              </p>
              <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-[#75675E]">
                <span>Última consulta: {patientSummary.latestConsultation ? formatDateSafe(patientSummary.latestConsultation.date) : "não registrada"}</span>
                <span>Próxima: {patientSummary.nextAppointment ? formatDateTime(patientSummary.nextAppointment.date) : "não agendada"}</span>
              </div>
            </div>
            <div className="grid gap-2 sm:grid-cols-3 xl:w-[34rem] xl:shrink-0">
              <button type="button" onClick={() => void startConsultation()} disabled={patientSummary.patient.status === "arquivado"} className="brand-btn-primary disabled:cursor-not-allowed disabled:opacity-50">
                <Stethoscope className="h-4 w-4" />
                {patientSummary.activeConsultation ? "Retomar consulta" : "Iniciar consulta"}
              </button>
              <button type="button" onClick={openPlanTab} className="brand-btn-secondary">
                <Utensils className="h-4 w-4" />
                Plano alimentar
              </button>
              <button type="button" onClick={openNewAnthropometry} disabled={patientSummary.patient.status === "arquivado"} className="brand-btn-secondary disabled:cursor-not-allowed disabled:opacity-50">
                <Activity className="h-4 w-4" />
                Nova avaliação
              </button>
            </div>
          </div>
        </header>

        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as TabId)} className="min-w-0">
        {/* Tabs */}
        <div className="border-b border-[#EAD8C2] bg-[#FFFDFC] p-2">
          <TabsList className="grid w-full min-w-0 grid-cols-2 gap-1 rounded-lg border border-[#EDE1D6] bg-[#FBF7F1] p-1 sm:grid-cols-3 lg:flex lg:justify-start lg:rounded-none lg:border-0 lg:bg-[#FFFDFC] lg:p-0">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              return (
                <TabsTrigger key={tab.id} value={tab.id} className="min-h-10 min-w-0 whitespace-normal px-2 text-[11px] leading-tight sm:px-3 sm:text-xs lg:h-10 lg:shrink-0 lg:whitespace-nowrap lg:px-4 lg:text-sm">
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="min-w-0 whitespace-normal text-center lg:whitespace-nowrap">{tab.label}</span>
                </TabsTrigger>
              );
            })}
          </TabsList>
        </div>

        {/* Tab content */}
        <div className="min-w-0 p-4 sm:p-6 xl:p-8">
          {activeTab === "plano-alimentar" && <SecondaryNavigation items={[{ id: "dieta", label: "Plano alimentar" }, { id: "protocolos", label: "Protocolos de cuidado" }]} value={planView} onChange={(value) => setPlanView(value as typeof planView)} />}
          {activeTab === "evolucao" && <SecondaryNavigation items={[{ id: "timeline", label: "Histórico clínico" }]} value={evolutionView} onChange={(value) => setEvolutionView(value as typeof evolutionView)} />}
          {activeTab === "mais" && <SecondaryNavigation items={[{ id: "cadastro", label: "Dados cadastrais" }, { id: "portal", label: "Portal" }, { id: "administrativo", label: "Administrativo" }]} value={moreView} onChange={(value) => setMoreView(value as typeof moreView)} />}

          {/* ── Resumo ─────────────────────────────────────────── */}
          {activeTab === "resumo" && (
            <PatientOverview
              summary={patientSummary}
              recentActivity={recentActivity}
              onStartConsultation={() => void startConsultation()}
              onOpenPlan={openPlanTab}
              onNewAnthropometry={openNewAnthropometry}
              onOpenTimeline={openTimelineTab}
            />
          )}

          {activeTab === "consultas" && (
            <div className="space-y-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="brand-kicker">Consultas</p>
                  <h2 className="font-serif text-xl font-semibold text-[#3A3028]">Agenda deste paciente</h2>
                </div>
                <Link href="/dashboard/agenda" className="brand-btn-secondary w-full sm:w-auto">
                  <CalendarDays className="h-4 w-4" />
                  Agendar retorno
                </Link>
              </div>
              {appointmentsLoading ? (
                <p className="text-sm text-[#A8927D]">Carregando consultas...</p>
              ) : appointments.length === 0 ? (
                <div className="rounded-lg border border-dashed border-[#D9C4B2] bg-[#FFFDFC] p-8 text-center">
                  <CalendarDays className="mx-auto mb-3 h-9 w-9 text-[#D9C4B2]" />
                  <p className="text-sm font-semibold text-[#3A3028]">Nenhuma consulta registrada na agenda.</p>
                  <p className="mt-1 text-xs text-[#75675E]">Use a agenda para marcar o próximo atendimento.</p>
                </div>
              ) : (
                <ul className="space-y-3">
                  {appointments.map((appointment) => (
                    <li key={appointment.id} className="rounded-lg border border-[#EDE1D6] bg-[#FFFDFC] p-4">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <p className="font-semibold text-[#3A3028]">{appointment.title}</p>
                          <p className="mt-1 text-xs text-[#75675E]">{formatDateTime(appointment.starts_at)} · {APPOINTMENT_STATUS_LABELS[appointment.status] ?? appointment.status}</p>
                        </div>
                        <span className="w-fit rounded-full bg-[#EAF0E4] px-3 py-1 text-xs font-semibold text-[#4F6847]">{appointment.appointment_type}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {activeTab === "mais" && moreView === "cadastro" && (
            <div className="space-y-6">
              <div className="rounded-[1.25rem] border border-[#EDE1D6] bg-[#FFFDFC] p-4 shadow-[0_14px_35px_rgba(58,48,40,0.04)] sm:p-5">
                <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <p className="brand-kicker mb-1">Cadastro clínico</p>
                    <h2 className="font-serif text-xl font-semibold text-[#B47F6A]">Dados do paciente</h2>
                  </div>
                  <p className="text-xs leading-5 text-[#8C6E52] sm:max-w-xs sm:text-right">
                    Mantenha contato, status e observações internas atualizados para facilitar os próximos atendimentos.
                  </p>
                </div>
              <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                <div>
                  <label className="brand-label">Nome completo</label>
                  <input value={name} onChange={(e) => setName(e.target.value)} className="brand-input" placeholder="Nome da paciente" />
                </div>
                <div>
                  <label className="brand-label">Telefone / WhatsApp</label>
                  <input value={phone} onChange={(e) => setPhone(e.target.value)} className="brand-input" placeholder="(00) 00000-0000" />
                </div>
                <div>
                  <label className="brand-label">E-mail</label>
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="brand-input" placeholder="paciente@email.com" />
                </div>
                <div>
                  <label className="brand-label">Data de nascimento</label>
                  <input type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} className="brand-input" />
                </div>
                <div>
                  <label className="brand-label">Status</label>
                  <select value={status} onChange={(e) => setStatus(e.target.value)} className="brand-input">
                    {STATUS_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="brand-label">Notas internas</label>
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)}
                  rows={4} className="brand-input resize-none leading-6" placeholder="Observações sobre a paciente, preferências de contato e pontos importantes para o atendimento..." />
              </div>
              </div>
              {saveError && <p className="text-sm text-red-600">{saveError}</p>}
              <div className="flex justify-end">
                <button onClick={handleSave} disabled={saving} className="brand-btn-primary w-full sm:w-auto">
                  <Save className="w-4 h-4" />
                  {saving ? "Salvando..." : saved ? "Salvo!" : "Salvar alterações"}
                </button>
              </div>
            </div>
          )}

          {/* ── Protocolos ─────────────────────────────────────── */}
          {activeTab === "anamnese" && (
            <>
              <NutritionRecordEditor clientId={id} onSaved={reloadTimeline} />
              <NutritionRecordHistory clientId={id} />
            </>
          )}

          {activeTab === "plano-alimentar" && planView === "dieta" && (
            <div className="space-y-4">
              <div className="flex justify-end">
                <Link href={`/dashboard/clients/${id}/print?secao=plano-alimentar`} target="_blank" className="brand-btn-secondary w-full sm:w-auto">
                  <Printer className="h-4 w-4" />
                  Imprimir versão ativa
                </Link>
              </div>
              <MealPlanEditor clientId={id} onSaved={reloadTimeline} />
            </div>
          )}

          {activeTab === "mais" && moreView === "portal" && (
            <div className="space-y-6">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <h2 className="font-serif font-semibold text-lg text-[#B47F6A]">Portal do cliente</h2>
                  <p className="mt-1 max-w-2xl text-sm text-[#8C6E52]">
                    Libere um acesso individual para a paciente acompanhar consultas, tarefas, protocolos e combinados principais.
                  </p>
                </div>
                <Link href="/portal" target="_blank" className="inline-flex items-center gap-2 text-sm font-semibold text-[#7A9A74] hover:text-[#B47F6A]">
                  Abrir portal
                  <ExternalLink className="h-4 w-4" />
                </Link>
              </div>

              <div className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
                <div className="rounded-2xl border border-[#EAD8C2] bg-[#FAF7F2]/70 p-5">
                  <div className="mb-4 flex items-center gap-2">
                    <ShieldCheck className="h-5 w-5 text-[#7A9A74]" />
                    <h3 className="font-serif text-base font-semibold text-[#3A2B1F]">Status do acesso</h3>
                  </div>
                  {portalLoading && !portalAccess ? (
                    <p className="text-sm text-[#A8927D]">Carregando acesso...</p>
                  ) : (
                    <div className="space-y-3 text-sm">
                      <p className="flex items-center justify-between gap-3">
                        <span className="text-[#8C6E52]">Acesso criado</span>
                        <span className="font-semibold text-[#3A2B1F]">{portalAccess?.exists ? "Sim" : "Nao"}</span>
                      </p>
                      <p className="flex items-center justify-between gap-3">
                        <span className="text-[#8C6E52]">Status</span>
                        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${portalAccess?.is_active ? "bg-[#D4EDDA] text-[#4A7C59]" : "bg-[#EAD8C2] text-[#8C6E52]"}`}>
                          {portalAccess?.is_active ? "Ativo" : "Inativo"}
                        </span>
                      </p>
                      <p className="flex items-center justify-between gap-3">
                        <span className="text-[#8C6E52]">Ultimo acesso</span>
                        <span className="font-semibold text-[#3A2B1F]">{formatDateSafe(portalAccess?.last_used_at ?? null, "dd/MM/yyyy HH:mm")}</span>
                      </p>
                    </div>
                  )}
                  {portalError && <p className="mt-4 text-sm text-red-600">{portalError}</p>}
                  <div className="mt-5 flex flex-wrap gap-3">
                    <button onClick={generatePortalCode} disabled={portalLoading} className="brand-btn-primary">
                      <RefreshCw className="h-4 w-4" />
                      {portalAccess?.exists ? "Gerar novo codigo" : "Liberar portal"}
                    </button>
                    {portalAccess?.exists && (
                      <button
                        onClick={() => togglePortalAccess(!portalAccess.is_active)}
                        disabled={portalLoading}
                        className="inline-flex items-center gap-2 rounded-full border border-[#EAD8C2] bg-white px-5 py-2 text-sm font-semibold text-[#8C6E52] hover:bg-[#FAF7F2]"
                      >
                        {portalAccess.is_active ? "Desativar" : "Ativar"}
                      </button>
                    )}
                  </div>
                </div>

                <div className="rounded-2xl border border-[#EAD8C2] bg-white p-5">
                  <div className="mb-4 flex items-center gap-2">
                    <KeyRound className="h-5 w-5 text-[#B47F6A]" />
                    <h3 className="font-serif text-base font-semibold text-[#3A2B1F]">Dados para enviar a paciente</h3>
                  </div>
                  {portalCode ? (
                    <div className="space-y-4">
                      <div className="rounded-xl bg-[#FAF7F2] p-4">
                        <p className="brand-label">Codigo de acesso</p>
                        <p className="mt-1 font-mono text-2xl font-semibold tracking-[0.16em] text-[#3A2B1F]">{portalCode}</p>
                      </div>
                      <div className="rounded-xl border border-[#EAD8C2] p-4 text-sm leading-6 text-[#75675E]">
                        <p className="font-semibold text-[#3A2B1F]">Mensagem sugerida</p>
                        <p className="mt-2">
                          Ola, {name || "tudo bem"}! Seu portal de acompanhamento esta liberado. Acesse {portalAccess?.login_url ?? "https://brunanutri.com.br/portal"} usando seu e-mail cadastrado e o codigo {portalCode}.
                        </p>
                      </div>
                      <p className="text-xs text-[#A8927D]">O codigo aparece apenas agora. Ao gerar um novo, o anterior deixa de funcionar.</p>
                    </div>
                  ) : (
                    <div className="rounded-xl bg-[#FAF7F2] p-5 text-sm leading-6 text-[#75675E]">
                      <p>Gere um codigo para liberar o primeiro acesso. Por seguranca, o codigo nao fica visivel depois que voce sair desta tela.</p>
                      <p className="mt-2">Login da paciente: <strong>{email || "cadastre o e-mail no cliente"}</strong></p>
                      <p>Endereco: <strong>{portalAccess?.login_url ?? "https://brunanutri.com.br/portal"}</strong></p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === "mais" && moreView === "administrativo" && (
            <div className="grid gap-4 lg:grid-cols-2">
              <section className="rounded-lg border border-[#EDE1D6] bg-[#FFFDFC] p-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="brand-kicker">Financeiro</p>
                    <h2 className="mt-1 font-serif text-lg font-semibold text-[#3A3028]">Cobranças vinculadas</h2>
                  </div>
                  <Link href="/dashboard/financeiro" className="text-xs font-semibold text-[#607A56] hover:text-[#3A3028]">Abrir financeiro</Link>
                </div>
                {paymentsLoading ? (
                  <p className="mt-4 text-sm text-[#A8927D]">Carregando...</p>
                ) : payments.length === 0 ? (
                  <p className="mt-4 text-sm text-[#75675E]">Nenhuma cobrança vinculada.</p>
                ) : (
                  <ul className="mt-4 space-y-2">
                    {payments.slice(0, 5).map((payment) => (
                      <li key={payment.id} className="flex items-center justify-between gap-3 rounded-lg bg-[#FBF7F1] p-3 text-sm">
                        <span className="min-w-0 truncate text-[#3A3028]">{payment.description}</span>
                        <span className="shrink-0 font-semibold text-[#8C6E52]">{formatMoney(payment.amount_cents)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
              <section className="rounded-lg border border-[#E8C3BA] bg-[#FFFDFC] p-5">
                <p className="brand-kicker text-[#9A5C4E]">Administração</p>
                <h2 className="mt-1 font-serif text-lg font-semibold text-[#3A3028]">Ações sensíveis</h2>
                <p className="mt-2 text-sm leading-6 text-[#75675E]">Estas ações ficam fora do resumo clínico para evitar ruído durante atendimento.</p>
                <button type="button" onClick={() => setDeleteDialogOpen(true)} className="mt-4 inline-flex min-h-10 cursor-pointer items-center justify-center gap-2 rounded-full border border-[#E8C3BA] px-4 py-2 text-xs font-semibold text-[#9A5C4E] transition-colors hover:bg-[#F6E6E0]">
                  <Trash2 className="h-3.5 w-3.5" />
                  Excluir paciente
                </button>
              </section>
            </div>
          )}

          {activeTab === "plano-alimentar" && planView === "protocolos" && (
            <div className="space-y-7">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="brand-kicker mb-1">Plano de cuidado</p>
                  <h2 className="font-serif text-2xl font-semibold text-[#3A3028]">Protocolos da cliente</h2>
                  <p className="mt-1 text-sm leading-6 text-[#75675E]">Inicie um modelo padrão ou crie uma cópia individual sem alterar a biblioteca.</p>
                </div>
                <Link href="/dashboard/protocols" className="inline-flex min-h-10 items-center gap-1.5 text-sm font-semibold text-[#607A56] hover:text-[#B47F6A]">
                  Ver biblioteca <ChevronRight className="h-4 w-4" />
                </Link>
              </div>

              <section className="min-w-0 rounded-xl border border-[#E6D5C5] bg-[#FBF7F1] p-4 sm:p-5">
                <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
                  <div className="space-y-4">
                    <div>
                      <label className="brand-label">Protocolo padrão de referência</label>
                      <select value={selectedProtocolId} onChange={(event) => {
                        setSelectedProtocolId(event.target.value);
                        const selected = protocolLibrary.find((item) => item.id === event.target.value);
                        if (selected) setPersonalizedTitle(`${selected.title} - ${data.name}`);
                      }} className="brand-input">
                        <option value="">Selecione um modelo ou deixe vazio para criar do zero</option>
                        {protocolLibrary.map((protocol) => (
                          <option key={protocol.id} value={protocol.id}>{protocol.title}{protocol.category ? ` · ${protocol.category}` : ""}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="brand-label">Nome da versão personalizada</label>
                      <input value={personalizedTitle} onChange={(event) => setPersonalizedTitle(event.target.value)} className="brand-input" placeholder={`Ex: Plano individual - ${data.name}`} />
                    </div>
                    <div>
                      <label className="brand-label">Notas profissionais desta aplicação</label>
                      <textarea value={protocolProfessionalNotes} onChange={(event) => setProtocolProfessionalNotes(event.target.value)} className="brand-input min-h-24 resize-y" placeholder="Objetivo inicial, adaptações previstas, contexto familiar e pontos para revisar." />
                    </div>
                  </div>
                  <div className="space-y-4">
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
                      <div>
                        <label className="brand-label">Data de início</label>
                        <input type="date" value={protocolStartDate} onChange={(event) => setProtocolStartDate(event.target.value)} className="brand-input" />
                      </div>
                      <div>
                        <label className="brand-label">Primeira revisão</label>
                        <input type="date" value={protocolReviewDate} onChange={(event) => setProtocolReviewDate(event.target.value)} className="brand-input" />
                      </div>
                    </div>
                    <label className="flex items-start gap-3 rounded-xl border border-[#D9E4D3] bg-white p-4 text-sm leading-5 text-[#5F554D]">
                      <input type="checkbox" checked={createProtocolTasks} onChange={(event) => setCreateProtocolTasks(event.target.checked)} className="mt-1 h-4 w-4 accent-[#607A56]" />
                      <span><strong className="block text-[#3A3028]">Criar tarefas das fases</strong>As ações do protocolo entram na rotina e no portal com prazos calculados pelo período de cada fase.</span>
                    </label>
                    <div className="grid gap-2">
                      <button onClick={() => void startProtocol(false)} disabled={protocolActionLoading || !selectedProtocolId} className="brand-btn-primary w-full">
                        <Play className="h-4 w-4" />Aplicar protocolo padrão
                      </button>
                      <button onClick={() => void startProtocol(true)} disabled={protocolActionLoading || !personalizedTitle.trim()} className="brand-btn-secondary w-full">
                        <Copy className="h-4 w-4" />Criar e iniciar personalizado
                      </button>
                    </div>
                  </div>
                </div>
                {protocolMessage && <p className="mt-4 rounded-xl border border-[#D9E4D3] bg-white px-4 py-3 text-sm text-[#5F554D]">{protocolMessage}</p>}
                {createdPersonalizedProtocolId && (
                  <Link href={`/dashboard/protocols/${createdPersonalizedProtocolId}`} className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-[#607A56] hover:text-[#B47F6A]">
                    Editar fases da cópia personalizada <ChevronRight className="h-4 w-4" />
                  </Link>
                )}
              </section>

              <section>
                <div className="mb-4 flex items-center justify-between gap-3">
                  <h3 className="font-serif text-xl font-semibold text-[#3A3028]">Acompanhamentos registrados</h3>
                  <span className="rounded-full bg-[#EAF0E4] px-3 py-1 text-xs font-semibold text-[#607A56]">{protocols.length}</span>
                </div>
                {protocolsLoading ? (
                  <p className="py-8 text-center text-sm text-[#A8927D]">Carregando...</p>
                ) : protocols.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-[#D9C4B2] py-10 text-center">
                    <BookOpen className="mx-auto mb-3 h-9 w-9 text-[#D9C4B2]" />
                    <p className="text-sm font-semibold text-[#3A3028]">Nenhum protocolo iniciado</p>
                    <p className="mt-1 text-xs text-[#75675E]">Use o painel acima para começar o plano de cuidado.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {protocols.map((protocol) => {
                      const progress = protocol.task_count > 0 ? Math.round((protocol.completed_task_count / protocol.task_count) * 100) : 0;
                      return (
                        <article key={protocol.id} className="rounded-xl border border-[#E6D5C5] bg-white p-5">
                          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <h4 className="font-serif text-lg font-semibold text-[#3A3028]">{protocol.protocol_title ?? "Protocolo sem título"}</h4>
                                <span className={PROTOCOL_STATUS_COLORS[protocol.status] ?? "brand-badge brand-badge-andamento"}>{PROTOCOL_STATUS_LABELS[protocol.status] ?? protocol.status}</span>
                                <span className="rounded-full bg-[#FBF7F1] px-2.5 py-1 text-[10px] font-semibold uppercase text-[#765548]">{protocol.protocol_kind === "personalized" ? "Personalizado" : "Padrão"}</span>
                              </div>
                              <p className="mt-2 text-xs text-[#75675E]">Início: {formatDateSafe(protocol.started_at)}{protocol.review_date ? ` · Revisão: ${formatDateSafe(protocol.review_date)}` : " · Revisão não definida"}</p>
                              <p className="mt-1 text-xs text-[#8A7B70]">{protocol.phase_count} fase(s) · {protocol.completed_task_count}/{protocol.task_count} tarefas concluídas</p>
                            </div>
                            <Link href={`/dashboard/protocols/${protocol.protocol_id}`} className="inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-[#607A56] hover:text-[#B47F6A]">Abrir plano <ChevronRight className="h-4 w-4" /></Link>
                          </div>

                          <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-[#F1ECE7]"><div className="h-full rounded-full bg-[#7F9A74]" style={{ width: `${progress}%` }} /></div>

                          <div className="mt-5 grid gap-4 md:grid-cols-[170px_170px_minmax(0,1fr)]">
                            <div>
                              <label className="brand-label">Status</label>
                              <select value={protocol.status} onChange={(event) => void updateAssignedProtocol(protocol.id, { status: event.target.value })} className="brand-input">
                                <option value="ativo">Ativo</option><option value="pausado">Pausado</option><option value="concluido">Concluído</option><option value="cancelado">Cancelado</option>
                              </select>
                            </div>
                            <div>
                              <label className="brand-label">Próxima revisão</label>
                              <input type="date" defaultValue={protocol.review_date ?? ""} onBlur={(event) => void updateAssignedProtocol(protocol.id, { reviewDate: event.target.value || null })} className="brand-input" />
                            </div>
                            <div>
                              <label className="brand-label">Notas do acompanhamento</label>
                              <input defaultValue={protocol.professional_notes ?? ""} onBlur={(event) => void updateAssignedProtocol(protocol.id, { professionalNotes: event.target.value || null })} className="brand-input" placeholder="Registre ajustes e pontos para a próxima revisão" />
                            </div>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}
              </section>
            </div>
          )}

          {/* ── Tarefas ────────────────────────────────────────── */}
          {activeTab === "evolucao" && evolutionView === "agenda" && (
            <div className="space-y-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <h2 className="font-serif font-semibold text-lg text-[#B47F6A]">Agenda do paciente</h2>
                <Link href="/dashboard/agenda"
                  className="flex min-h-10 items-center gap-1 text-xs font-medium text-[#7A9A74] transition-colors hover:text-[#B47F6A]">
                  Abrir agenda
                  <ChevronRight className="w-3.5 h-3.5" />
                </Link>
              </div>
              {appointmentsLoading ? (
                <p className="text-sm text-[#A8927D]">Carregando...</p>
              ) : appointments.length === 0 ? (
                <div className="text-center py-10">
                  <CalendarDays className="w-10 h-10 text-[#EAD8C2] mx-auto mb-3" />
                  <p className="text-[#A8927D] text-sm">Nenhum atendimento vinculado ainda.</p>
                  <p className="text-[#A8927D] text-xs mt-1">
                    Cadastre uma consulta na agenda e vincule a este paciente.
                  </p>
                </div>
              ) : (
                <ul className="space-y-3">
                  {appointments.map((appointment) => (
                    <li key={appointment.id} className="border border-[#EAD8C2] rounded-xl p-4 bg-[#FAF7F2]/60">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-medium text-[#3A2B1F] text-sm">{appointment.title}</p>
                          <p className="text-xs text-[#8C6E52] mt-1">
                            {formatDateSafe(appointment.starts_at, "dd/MM/yyyy 'as' HH:mm")}
                            {appointment.ends_at ? ` ate ${formatDateSafe(appointment.ends_at, "HH:mm")}` : ""}
                          </p>
                          {appointment.location && (
                            <p className="text-xs text-[#A8927D] mt-1">{appointment.location}</p>
                          )}
                        </div>
                        <span className="brand-badge brand-badge-andamento">
                          {APPOINTMENT_STATUS_LABELS[appointment.status] ?? appointment.status}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {activeTab === "evolucao" && evolutionView === "tarefas" && (
            <div className="space-y-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <h2 className="font-serif font-semibold text-lg text-[#B47F6A]">Tarefas</h2>
                <div className="flex flex-wrap gap-2">
                  {["", "pendente", "concluida", "cancelada"].map((s) => (
                    <button key={s} onClick={() => setTaskStatusFilter(s)}
                      className={`px-3 py-1 text-xs rounded-full border transition-colors ${
                        taskStatusFilter === s
                          ? "bg-[#7A9A74] text-white border-[#7A9A74]"
                          : "border-[#EAD8C2] text-[#8C6E52] hover:bg-[#FAF7F2]"
                      }`}>
                      {s === "" ? "Todas" : TASK_STATUS_LABELS[s] ?? s}
                    </button>
                  ))}
                </div>
              </div>
              {tasksLoading ? (
                <p className="text-sm text-[#A8927D]">Carregando...</p>
              ) : tasks.length === 0 ? (
                <div className="text-center py-10">
                  <CheckSquare className="w-10 h-10 text-[#EAD8C2] mx-auto mb-3" />
                  <p className="text-[#A8927D] text-sm">Nenhuma tarefa encontrada.</p>
                  <p className="text-[#A8927D] text-xs mt-1">As tarefas são criadas ao aplicar um protocolo com rascunho IA.</p>
                </div>
              ) : (
                <ul className="space-y-2">
                  {tasks.map((task) => (
                    <li key={task.id} className="border border-[#EAD8C2] rounded-xl p-4 bg-[#FAF7F2]/60">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className={`font-medium text-sm ${task.status === "concluida" ? "line-through text-[#A8927D]" : "text-[#3A2B1F]"}`}>
                            {task.title}
                          </p>
                          {task.description && (
                            <p className="text-xs text-[#8C6E52] mt-0.5">{task.description}</p>
                          )}
                          {task.due_date && (
                            <p className={`text-xs mt-1 ${
                              task.status === "pendente" && task.due_date < new Date().toISOString().slice(0, 10)
                                ? "text-red-600 font-medium"
                                : "text-[#A8927D]"
                            }`}>
                              Prazo: {formatDateSafe(task.due_date + "T00:00:00")}
                            </p>
                          )}
                        </div>
                        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                          <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${TASK_STATUS_COLORS[task.status] ?? "bg-[#EAD8C2] text-[#8C6E52]"}`}>
                            {TASK_STATUS_LABELS[task.status] ?? task.status}
                          </span>
                          {task.status === "pendente" && (
                            <button onClick={() => handleTaskStatus(task.id, "concluida")}
                              title="Marcar como concluída"
                              className="p-1.5 rounded-lg bg-[#D4EDDA] text-[#4A7C59] hover:bg-[#c3e6d4] transition-colors">
                              <Check className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {task.status !== "cancelada" && task.status !== "concluida" && (
                            <button onClick={() => handleTaskStatus(task.id, "cancelada")}
                              title="Cancelar"
                              className="p-1.5 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 transition-colors">
                              <X className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* ── Evoluções ──────────────────────────────────────── */}
          {activeTab === "antropometria" && (
            <div className="space-y-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <h2 className="font-serif font-semibold text-lg text-[#B47F6A]">Evoluções clínicas</h2>
                <button onClick={() => setShowEvolutionForm((v) => !v)}
                  className="brand-btn-primary w-full text-sm sm:w-auto">
                  <Plus className="w-4 h-4" />
                  Nova evolução
                </button>
              </div>

              <section className="rounded-lg border border-[#EAD8C2] bg-[#FFFDFC] p-4 sm:p-5">
                <div className="mb-4"><p className="brand-kicker">Histórico antropométrico</p><h3 className="mt-1 font-serif text-xl font-semibold text-[#3A3028]">Curva de evolução corporal</h3></div>
                {(clinicalGrowthLoading || hasClinicalGrowth) && (
                  <div className="mb-5 grid grid-cols-1 gap-3 lg:grid-cols-2">
                    {clinicalGrowthLoading && (
                      <div className="rounded-lg border border-[#EAD8C2] bg-[#FFFDFC] p-4 text-sm text-[#8C6E52]">
                        Calculando referencias clinicas...
                      </div>
                    )}

                    {clinicalGrowth?.pediatric.applicable && clinicalGrowth.pediatric.results.length > 0 && (
                      <div className="rounded-lg border border-[#D9E4D3] bg-[#FFFDFC] p-4">
                        <p className="brand-kicker">Crescimento pediatrico OMS</p>
                        <h3 className="mt-1 font-serif text-lg font-semibold text-[#3A3028]">Z-scores e pontos de atencao</h3>
                        <div className="mt-3 space-y-2">
                          {clinicalGrowth.pediatric.results.map((result) => (
                            <div key={result.indicator} className="rounded-lg bg-[#FBF7F1] p-3">
                              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                                <p className="text-sm font-semibold text-[#3A3028]">{result.label}</p>
                                <span className="w-fit rounded-full bg-[#E8F0E3] px-2.5 py-1 text-xs font-semibold text-[#607A56]">
                                  Z {result.zScore.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </span>
                              </div>
                              <p className="mt-1 text-xs leading-5 text-[#75675E]">{result.cautionLabel}</p>
                              {result.technicalRule && (
                                <p className="mt-1 text-[11px] text-[#A8927D]">Regra tecnica: {result.technicalRule}</p>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {clinicalGrowth?.gestational.applicable && (
                      <div className="rounded-lg border border-[#EAD8C2] bg-[#FFFDFC] p-4">
                        <p className="brand-kicker">Ganho gestacional IOM/OMS</p>
                        <h3 className="mt-1 font-serif text-lg font-semibold text-[#3A3028]">Monitoramento da gestacao</h3>
                        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                          <div className="rounded-lg bg-[#FBF7F1] p-3">
                            <p className="brand-label mb-1">IMC pre-gestacional</p>
                            <p className="text-sm font-semibold text-[#3A3028]">
                              {clinicalGrowth.gestational.prePregnancyBmi?.toLocaleString("pt-BR", { maximumFractionDigits: 1 }) ?? "Nao calculado"}
                            </p>
                            <p className="mt-1 text-xs text-[#75675E]">{clinicalGrowth.gestational.prePregnancyClassification?.label ?? "Informe peso pre-gestacional e altura."}</p>
                          </div>
                          <div className="rounded-lg bg-[#FBF7F1] p-3">
                            <p className="brand-label mb-1">Ganho total recomendado</p>
                            <p className="text-sm font-semibold text-[#3A3028]">
                              {clinicalGrowth.gestational.recommendedTotalGain
                                ? `${clinicalGrowth.gestational.recommendedTotalGain.ganho_min_kg}-${clinicalGrowth.gestational.recommendedTotalGain.ganho_max_kg} kg`
                                : "Sem faixa calculada"}
                            </p>
                          </div>
                          <div className="rounded-lg bg-[#FBF7F1] p-3 sm:col-span-2">
                            <p className="brand-label mb-1">Taxa semanal observada</p>
                            <p className="text-sm font-semibold text-[#3A3028]">
                              {clinicalGrowth.gestational.weeklyGainRate !== null ? `${clinicalGrowth.gestational.weeklyGainRate} kg/semana` : "Registre ao menos duas evolucoes com peso."}
                            </p>
                            <p className="mt-1 text-xs text-[#75675E]">{clinicalGrowth.gestational.weeklyGainClassification?.label ?? clinicalGrowth.gestational.referenceNote}</p>
                          </div>
                        </div>
                      </div>
                    )}

                    {clinicalGrowth?.bariatric.applicable && (
                      <div className="rounded-lg border border-[#EAD8C2] bg-[#FFFDFC] p-4">
                        <p className="brand-kicker">Acompanhamento bariatrico</p>
                        <h3 className="mt-1 font-serif text-lg font-semibold text-[#3A3028]">Perda de peso pos-cirurgica</h3>
                        {clinicalGrowth.bariatric.progress ? (
                          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <div className="rounded-lg bg-[#FBF7F1] p-3">
                              <p className="brand-label mb-1">%TWL (perda de peso total)</p>
                              <p className="text-sm font-semibold text-[#3A3028]">
                                {clinicalGrowth.bariatric.progress.percentTotalWeightLoss.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%
                              </p>
                            </div>
                            <div className="rounded-lg bg-[#FBF7F1] p-3">
                              <p className="brand-label mb-1">%EWL (excesso de peso perdido)</p>
                              <p className="text-sm font-semibold text-[#3A3028]">
                                {clinicalGrowth.bariatric.progress.percentExcessWeightLoss !== null
                                  ? `${clinicalGrowth.bariatric.progress.percentExcessWeightLoss.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`
                                  : "Defina o peso/meta clinica"}
                              </p>
                            </div>
                            <div className="rounded-lg bg-[#FBF7F1] p-3 sm:col-span-2">
                              <p className="brand-label mb-1">Peso perdido desde a cirurgia</p>
                              <p className="text-sm font-semibold text-[#3A3028]">
                                {clinicalGrowth.bariatric.progress.weightLostKg.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} kg
                              </p>
                            </div>
                          </div>
                        ) : (
                          <p className="mt-2 text-xs leading-5 text-[#75675E]">
                            Informe o peso pre-cirurgico na Antropometria e registre uma evolucao com o peso atual para calcular o progresso.
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}
                <EvolutionChart history={evolutions} referenceLines={clinicalGrowth?.pediatric.chartReferenceLines ?? []} />
              </section>

              <ReassessmentTable evolutions={evolutions} />

              {showEvolutionForm && (
                <ClinicalEvolutionForm
                  clientId={id}
                  onSuccess={() => { reloadEvolutions(); reloadTimeline(); }}
                  biologicalSex={clinicalSummary?.biological_sex ?? null}
                  ageYears={calculateAgeInYears(birthDate || null)}
                />
              )}

              {evolutionsLoading ? (
                <p className="text-sm text-[#A8927D]">Carregando...</p>
              ) : evolutions.length === 0 && !showEvolutionForm ? (
                <div className="text-center py-10">
                  <TrendingUp className="w-10 h-10 text-[#EAD8C2] mx-auto mb-3" />
                  <p className="text-[#A8927D] text-sm">Nenhuma evolução registrada ainda.</p>
                </div>
              ) : (
                <ul className="space-y-4">
                  {evolutions.map((ev) => (
                    <EvolutionHistoryItem key={ev.id} evolution={ev} onDelete={handleDeleteEvolution} />
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* ── Timeline ───────────────────────────────────────── */}
          {activeTab === "evolucao" && evolutionView === "financeiro" && (
            <div className="space-y-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <h2 className="font-serif font-semibold text-lg text-[#B47F6A]">Financeiro do paciente</h2>
                <Link href="/dashboard/financeiro"
                  className="flex min-h-10 items-center gap-1 text-xs font-medium text-[#7A9A74] transition-colors hover:text-[#B47F6A]">
                  Abrir financeiro
                  <ChevronRight className="w-3.5 h-3.5" />
                </Link>
              </div>
              {paymentsLoading ? (
                <p className="text-sm text-[#A8927D]">Carregando...</p>
              ) : payments.length === 0 ? (
                <div className="text-center py-10">
                  <WalletCards className="w-10 h-10 text-[#EAD8C2] mx-auto mb-3" />
                  <p className="text-[#A8927D] text-sm">Nenhuma cobranca vinculada ainda.</p>
                  <p className="text-[#A8927D] text-xs mt-1">
                    Registre consultas, retornos ou pacotes no financeiro.
                  </p>
                </div>
              ) : (
                <ul className="space-y-3">
                  {payments.map((payment) => (
                    <li key={payment.id} className="border border-[#EAD8C2] rounded-xl p-4 bg-[#FAF7F2]/60">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-medium text-[#3A2B1F] text-sm">{payment.description}</p>
                          <p className="text-xs text-[#8C6E52] mt-1">
                            {payment.due_date ? `Vence em ${formatDateSafe(payment.due_date + "T00:00:00")}` : "Sem vencimento"}
                            {payment.payment_method ? ` · ${payment.payment_method}` : ""}
                          </p>
                          {payment.notes && (
                            <p className="text-xs text-[#A8927D] mt-1">{payment.notes}</p>
                          )}
                        </div>
                        <div className="text-right shrink-0">
                          <p className="font-serif font-semibold text-lg text-[#3A2B1F]">
                            {formatMoney(payment.amount_cents)}
                          </p>
                          <span className="brand-badge brand-badge-andamento">
                            {PAYMENT_STATUS_LABELS[payment.status] ?? payment.status}
                          </span>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {activeTab === "evolucao" && evolutionView === "timeline" && (
            <PatientClinicalTimeline
              result={clinicalTimeline}
              filter={timelineFilter}
              loading={timelineLoading}
              error={timelineError}
              onFilterChange={(nextFilter) => {
                setTimelineFilter(nextFilter);
                setClinicalTimeline(null);
                void loadClinicalTimeline({ filter: nextFilter, offset: 0 });
              }}
              onLoadMore={() => void loadClinicalTimeline({ filter: timelineFilter, offset: clinicalTimeline?.events.length ?? 0, append: true })}
              onRetry={() => void loadClinicalTimeline({ filter: timelineFilter, offset: 0 })}
              onStartConsultation={() => void startConsultation()}
              onNewAnthropometry={openNewAnthropometry}
              archived={patientSummary.patient.status === "arquivado"}
            />
          )}

          {/* ── Relatórios ─────────────────────────────────────── */}
          {activeTab === "evolucao" && evolutionView === "relatorios" && (
            <div className="space-y-4">
              <h2 className="font-serif font-semibold text-lg text-[#B47F6A]">Relatórios</h2>
              <div className="flex flex-col gap-4 rounded-2xl border border-[#EAD8C2] bg-[#FAF7F2]/60 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-6">
                <div className="min-w-0">
                  <p className="font-medium text-sm text-[#3A2B1F]">Relatório completo do cliente</p>
                  <p className="text-xs text-[#8C6E52] mt-1">
                    Dados, protocolos, tarefas, evoluções e timeline em um documento imprimível.
                  </p>
                </div>
                <Link href={`/dashboard/clients/${id}/print`} target="_blank"
                  className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-full bg-[#F4C9C6] px-5 py-2 text-sm font-semibold text-[#B47F6A] transition-colors hover:bg-[#f1b8b4]">
                  <Printer className="w-4 h-4" />
                  Abrir relatório
                </Link>
              </div>
            </div>
          )}

        </div>
        </Tabs>
      </div>
      {deleteDialogOpen && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-black/35 px-4 py-6 backdrop-blur-sm">
          <section className="flex max-h-[calc(100dvh-2rem)] w-full max-w-lg flex-col overflow-hidden rounded-[1.25rem] border border-[#EDE1D6] bg-[#FFFDFC] shadow-[0_28px_90px_rgba(58,48,40,0.24)]">
            <div className="border-b border-[#EDE1D6] px-5 py-4">
              <p className="brand-kicker text-[#9A5C4E]">Exclusao definitiva</p>
              <h2 className="mt-1 font-serif text-2xl font-semibold text-[#3A3028]">Excluir paciente</h2>
            </div>
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-5">
              <p className="text-sm leading-6 text-[#75675E]">
                Esta acao remove <strong className="text-[#3A3028]">{data.name}</strong> da base de pacientes e apaga prontuario, portal, protocolos, tarefas, evolucoes, planos alimentares, consultas e financeiro vinculados ao cadastro.
              </p>
              <p className="rounded-xl border border-[#E8C3BA] bg-[#FFF7F5] p-3 text-xs leading-5 text-[#9A5C4E]">
                Se essa pessoa voltar no futuro, ela podera preencher uma nova pre-consulta ou ser cadastrada novamente no sistema.
              </p>
              {deleteError && <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{deleteError}</p>}
            </div>
            <div className="grid gap-3 border-t border-[#EDE1D6] px-5 py-3 sm:flex sm:justify-end">
              <button
                type="button"
                onClick={() => {
                  setDeleteDialogOpen(false);
                  setDeleteError("");
                }}
                disabled={deletingClient}
                className="brand-btn-secondary w-full sm:w-auto"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void deleteCurrentClient()}
                disabled={deletingClient}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-[#9A5C4E] px-5 py-2 text-sm font-semibold text-white transition hover:bg-[#82483D] disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
              >
                <Trash2 className="h-4 w-4" />
                {deletingClient ? "Excluindo..." : "Excluir definitivamente"}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
