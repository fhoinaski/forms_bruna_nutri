"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, Save, Phone, Mail, FileText, Printer,
  User, BookOpen, CheckSquare, TrendingUp, Clock,
  Plus, Check, X, Trash2, ChevronRight, ChevronDown,
  CalendarDays, WalletCards, KeyRound, ShieldCheck, RefreshCw, ExternalLink,
  Copy, Play,
  Utensils, AlertTriangle, Activity, Stethoscope,
} from "lucide-react";
import { format, parseISO, isValid } from "date-fns";
import { MealPlanEditor } from "@/components/dashboard/MealPlanEditor";
import { EvolutionChart } from "@/components/dashboard/EvolutionChart";
import { ClinicalEvolutionForm } from "@/components/dashboard/ClinicalEvolutionForm";
import { NutritionRecordHistory } from "@/components/dashboard/NutritionRecordHistory";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { suggestEducationCardsFromDiagnoses } from "@/lib/clinical/patient-education-suggestions";
import {
  calculateAgeInYears,
  calculateWaistHeightRatio,
  calculateWaistHipRatio,
  classifyWaistHeightRatio,
  classifyWaistHipRatio,
} from "@/lib/clinical/anthropometry";
import { PROTOCOL_TEMPLATE_GROUP_LABELS, PROTOCOL_TEMPLATE_TARGET_GROUPS } from "@/lib/protocol-templates/constants";
import { NUTRITION_TEXT_FIELDS } from "@/lib/clinical/nutrition-record-fields";

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
interface TimelineEvent {
  id: string; type: string; title: string; description: string | null; created_at: string;
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

interface PatientEducationCardLite {
  id: string;
  slug: string;
  title: string;
  summary: string;
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

const TIMELINE_ICONS: Record<string, string> = {
  client_created: "👤", protocol_applied: "📋", protocol_created: "✨",
  task_completed: "✅", evolution_recorded: "📊", report_generated: "📄",
  protocol_completed: "🏁",
};

const TABS = [
  { id: "resumo", label: "Resumo", icon: User },
  { id: "anamnese", label: "Anamnese", icon: FileText },
  { id: "antropometria", label: "Antropometria", icon: Activity },
  { id: "plano-alimentar", label: "Plano alimentar", icon: Utensils },
  { id: "evolucao", label: "Evolução", icon: TrendingUp },
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

function calculateAge(birthDate: string | null): string {
  if (!birthDate) return "Idade não informada";
  const date = parseISO(birthDate);
  if (!isValid(date)) return "Idade não informada";
  const today = new Date();
  let age = today.getFullYear() - date.getFullYear();
  if (today.getMonth() < date.getMonth() || (today.getMonth() === date.getMonth() && today.getDate() < date.getDate())) age--;
  return `${age} anos`;
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

const isPregnancyRecord = (record: NutritionRecord) => record.life_stage === "Gestacao";
const isBariatricRecord = (record: NutritionRecord) => record.target_group === "BARIATRICO";

const ANTHROPOMETRY_FIELDS: {
  key: keyof NutritionRecord;
  label: string;
  placeholder: string | ((record: NutritionRecord) => string);
  type?: string;
  visibleWhen?: (record: NutritionRecord) => boolean;
}[] = [
  { key: "current_weight_kg", label: "Peso atual (kg)", placeholder: "Ex: 68,5" },
  { key: "height_cm", label: "Altura (cm)", placeholder: "Ex: 165" },
  {
    key: "target_weight_kg",
    label: "Peso/meta clinica",
    placeholder: (record) => isBariatricRecord(record)
      ? "Numero em kg — habilita o calculo de %EWL"
      : "Ex: manter ganho adequado",
  },
  // Campos abaixo só fazem sentido para o contexto correspondente — evita
  // pedir peso pre-gestacional de um homem ou data de cirurgia bariatrica
  // de quem nao esta nessa categoria de cuidado.
  { key: "pre_pregnancy_weight_kg", label: "Peso pre-gestacional (kg)", placeholder: "Ex: 62,0", visibleWhen: isPregnancyRecord },
  { key: "pre_surgery_weight_kg", label: "Peso pre-cirurgico (kg)", placeholder: "Ex: 120", visibleWhen: isBariatricRecord },
  { key: "bariatric_surgery_date", label: "Data da cirurgia bariatrica", placeholder: "", type: "date", visibleWhen: isBariatricRecord },
];

const LIFE_STAGE_OPTIONS = ["Gestacao", "Pos-parto", "Lactante", "Bebe", "Crianca", "Adolescente", "Adulto responsavel"];
const LIFE_STAGES_REQUIRING_GESTATION_CAPACITY = ["Gestacao", "Pos-parto", "Lactante"];

/**
 * Fases de gestacao/pos-parto/lactacao nao se aplicam a pacientes cujo sexo
 * biologico esta registrado como Masculino. Para os demais valores
 * (Feminino, Intersexo, Nao informado ou em branco) nao restringimos nada,
 * para nao presumir algo que a profissional ainda nao registrou.
 */
function availableLifeStageOptions(biologicalSex: string | null | undefined): string[] {
  if (biologicalSex === "Masculino") {
    return LIFE_STAGE_OPTIONS.filter((option) => !LIFE_STAGES_REQUIRING_GESTATION_CAPACITY.includes(option));
  }
  return LIFE_STAGE_OPTIONS;
}

const CLINICAL_PROFILE_FIELDS: { key: keyof NutritionRecord; label: string; options?: string[]; placeholder?: string }[] = [
  { key: "biological_sex", label: "Sexo biologico", options: ["Feminino", "Masculino", "Intersexo", "Nao informado"] },
  { key: "life_stage", label: "Fase do cuidado", options: LIFE_STAGE_OPTIONS },
  { key: "target_group", label: "Categoria de cuidado" },
  { key: "gestational_weeks", label: "Semanas de gestacao", placeholder: "Ex: 28 semanas" },
];

function parseDecimalInput(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number(value.replace(",", ".").replace(/[^\d.]/g, ""));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function calculateBmi(weightValue: string | null, heightValue: string | null): string | null {
  const weight = parseDecimalInput(weightValue);
  const heightCm = parseDecimalInput(heightValue);
  if (!weight || !heightCm) return null;
  const heightM = heightCm / 100;
  return (weight / (heightM * heightM)).toFixed(1).replace(".", ",");
}

function classifyBmiLabel(value: string | number | null): string {
  const bmi = typeof value === "number" ? value : parseDecimalInput(value);
  if (!bmi) return "Sem classificacao";
  if (bmi < 18.5) return "Baixo peso";
  if (bmi < 25) return "Eutrofia";
  if (bmi < 30) return "Sobrepeso";
  if (bmi < 35) return "Obesidade grau I";
  if (bmi < 40) return "Obesidade grau II";
  return "Obesidade grau III";
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

function NutritionRecordEditor({ clientId, onSaved }: { clientId: string; onSaved: () => void }) {
  const [record, setRecord] = useState<NutritionRecord | null>(null);
  const [educationCards, setEducationCards] = useState<PatientEducationCardLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    fetch(`/api/admin/clients/${clientId}/nutrition-record`)
      .then((res) => {
        if (!res.ok) throw new Error();
        return res.json() as Promise<NutritionRecord>;
      })
      .then(setRecord)
      .catch(() => setError("Nao foi possivel carregar o prontuario."))
      .finally(() => setLoading(false));
  }, [clientId]);

  useEffect(() => {
    fetch("/api/admin/patient-education-cards?category=patologia", { cache: "no-store" })
      .then((res) => res.ok ? res.json() as Promise<{ items: PatientEducationCardLite[] }> : { items: [] })
      .then((data) => setEducationCards(data.items ?? []))
      .catch(() => setEducationCards([]));
  }, []);

  const setField = (key: keyof NutritionRecord, value: string) => {
    setRecord((prev) => {
      if (!prev) return prev;
      const next = { ...prev, [key]: value };
      // Se o sexo biologico virar Masculino, uma fase do cuidado
      // ligada a gestacao/pos-parto/lactacao deixa de fazer sentido —
      // evita manter uma combinacao clinicamente incoerente salva.
      if (key === "biological_sex" && value === "Masculino" && next.life_stage && LIFE_STAGES_REQUIRING_GESTATION_CAPACITY.includes(next.life_stage)) {
        next.life_stage = "";
      }
      return next;
    });
  };

  const handleSave = async () => {
    if (!record) return;
    setSaving(true); setSaved(false); setError("");
    const recordFields: (keyof NutritionRecord)[] = [
      ...CLINICAL_PROFILE_FIELDS.map((field) => field.key),
      ...NUTRITION_TEXT_FIELDS.map((field) => field.key),
      ...ANTHROPOMETRY_FIELDS.map((field) => field.key),
      "anthropometry_notes",
    ];
    // O IMC nunca e enviado aqui — e sempre calculado no servidor a partir
    // de peso e altura (nunca aceito como valor digitado pelo usuario).
    const payload = Object.fromEntries(
      recordFields.map((key) => [key, String(record[key] ?? "").trim() || null])
    );
    try {
      const res = await fetch(`/api/admin/clients/${clientId}/nutrition-record`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, expectedVersion: record.version }),
      });
      if (res.status === 409) {
        const body = await res.json().catch(() => null);
        setError(body?.message ?? "O prontuário foi atualizado em outra sessão. Recarregue antes de salvar.");
        return;
      }
      if (!res.ok) throw new Error();
      setRecord(await res.json());
      setSaved(true);
      onSaved();
      setTimeout(() => setSaved(false), 3000);
    } catch {
      setError("Nao foi possivel salvar o prontuario.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p className="text-sm text-[#A8927D]">Carregando prontuario...</p>;
  if (!record) return <p className="text-sm text-red-600">{error || "Prontuario indisponivel."}</p>;

  const suggestedEducationCards = suggestEducationCardsFromDiagnoses(record.diagnoses)
    .map((match) => ({
      match,
      card: educationCards.find((card) => card.slug === match.slug),
    }))
    .filter((item): item is { match: { slug: string; keywords: string[] }; card: PatientEducationCardLite } => Boolean(item.card))
    .slice(0, 4);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="font-serif font-semibold text-lg text-[#B47F6A]">Prontuario nutricional completo</h2>
          <p className="mt-1 max-w-2xl text-sm text-[#8C6E52]">
            Ficha clinica viva do atendimento, com dados essenciais para anamnese, acompanhamento e plano de cuidado.
          </p>
        </div>
        <div className="text-xs text-[#A8927D] md:text-right">
          <p>Atualizado em {formatDateSafe(record.updated_at, "dd/MM/yyyy HH:mm")}</p>
          <p>Registro unico do paciente</p>
        </div>
      </div>

      <div className="rounded-2xl border border-[#EAD8C2] bg-[#FFFDFC] p-5">
        <h3 className="font-serif text-base font-semibold text-[#7A9A74]">Perfil clinico e fase de vida</h3>
        <p className="mt-1 text-xs leading-5 text-[#8C6E52]">As opcoes de fase do cuidado se ajustam ao sexo biologico informado.</p>
        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
          {CLINICAL_PROFILE_FIELDS
            .filter((field) => field.key !== "gestational_weeks" || record.life_stage === "Gestacao")
            .map((field) => {
            if (field.key === "target_group") {
              return (
                <div key={field.key}>
                  <label className="brand-label">{field.label}</label>
                  <select value={String(record.target_group ?? "")} onChange={(e) => setField("target_group", e.target.value)} className="brand-input">
                    <option value="">Selecionar</option>
                    {PROTOCOL_TEMPLATE_TARGET_GROUPS.map((group) => (
                      <option key={group} value={group}>{PROTOCOL_TEMPLATE_GROUP_LABELS[group]}</option>
                    ))}
                  </select>
                </div>
              );
            }
            const options = field.key === "life_stage" ? availableLifeStageOptions(record.biological_sex) : field.options;
            return (
              <div key={field.key}>
                <label className="brand-label">{field.label}</label>
                {options ? (
                  <select value={String(record[field.key] ?? "")} onChange={(e) => setField(field.key, e.target.value)} className="brand-input">
                    <option value="">Selecionar</option>
                    {options.map((option) => <option key={option} value={option}>{option}</option>)}
                  </select>
                ) : (
                  <input value={String(record[field.key] ?? "")} onChange={(e) => setField(field.key, e.target.value)} className="brand-input" placeholder={field.placeholder} />
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="rounded-2xl border border-[#EAD8C2] bg-[#FAF7F2]/70 p-5">
        <h3 className="font-serif text-base font-semibold text-[#7A9A74]">Antropometria e medidas</h3>
        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-4">
          {ANTHROPOMETRY_FIELDS
            .filter((field) => !field.visibleWhen || field.visibleWhen(record))
            .map((field) => (
            <div key={field.key}>
              <label className="brand-label">{field.label}</label>
              <input
                type={field.type ?? "text"}
                value={String(record[field.key] ?? "")}
                onChange={(e) => setField(field.key, e.target.value)}
                className="brand-input"
                placeholder={typeof field.placeholder === "function" ? field.placeholder(record) : field.placeholder}
              />
            </div>
          ))}
        </div>
        {(() => {
          const liveBmi = calculateBmi(record.current_weight_kg, record.height_cm) ?? record.bmi;
          if (!liveBmi) return null;
          return (
            <div className="mt-4 rounded-lg border border-[#D9E4D3] bg-[#F4F8F1] p-3 sm:w-64">
              <p className="brand-label mb-1">IMC calculado</p>
              <p className="text-sm font-semibold text-[#3A3028]">{liveBmi}</p>
              <p className="mt-1 text-xs leading-5 text-[#4F6847]">{classifyBmiLabel(liveBmi)} · calculado a partir de peso e altura</p>
            </div>
          );
        })()}
        <div className="mt-4">
          <label className="brand-label">Observacoes antropometricas</label>
          <textarea
            value={record.anthropometry_notes ?? ""}
            onChange={(e) => setField("anthropometry_notes", e.target.value)}
            rows={3}
            className="brand-input resize-y"
            placeholder="Composicao corporal, curvas, variacoes relevantes, medidas adicionais e interpretacao profissional."
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {NUTRITION_TEXT_FIELDS.map((field) => (
          <div key={field.key} className={["clinical_history", "eating_routine", "exams", "assessment", "care_plan"].includes(String(field.key)) ? "lg:col-span-2" : undefined}>
            <label className="brand-label">{field.label}</label>
            <textarea
              value={String(record[field.key] ?? "")}
              onChange={(e) => setField(field.key, e.target.value)}
              rows={field.rows ?? 2}
              className="brand-input resize-y"
              placeholder={field.placeholder}
            />
            {field.key === "diagnoses" && suggestedEducationCards.length > 0 && (
              <div className="mt-3 rounded-xl border border-[#D9E4D3] bg-[#F5FAF0] p-3">
                <div className="mb-2 flex items-center gap-2">
                  <BookOpen className="h-4 w-4 text-[#607A56]" />
                  <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#607A56]">Fichas sugeridas pelo prontuario</p>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {suggestedEducationCards.map(({ card, match }) => (
                    <Link
                      key={card.id}
                      href="/dashboard/templates/educacao"
                      className="rounded-lg border border-[#D9E4D3] bg-[#FFFDFC] p-3 transition hover:border-[#7F9A74]"
                    >
                      <p className="text-sm font-semibold text-[#3A3028]">{card.title}</p>
                      <p className="mt-1 line-clamp-2 text-xs leading-5 text-[#75675E]">{card.summary}</p>
                      <p className="mt-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#8C6E52]">
                        Sinal: {match.keywords.slice(0, 2).join(", ")}
                      </p>
                    </Link>
                  ))}
                </div>
                <p className="mt-2 text-[11px] leading-5 text-[#8C6E52]">
                  Sugestao automatica por palavra-chave. Revise o contexto antes de enviar material ao paciente.
                </p>
              </div>
            )}
          </div>
        ))}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex justify-end">
        <button onClick={handleSave} disabled={saving} className="brand-btn-primary">
          <Save className="w-4 h-4" />
          {saving ? "Salvando..." : saved ? "Prontuario salvo" : "Salvar prontuario"}
        </button>
      </div>
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

export default function ClientDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [activeTab, setActiveTab] = useState<TabId>(() => resolveTabFromParam(searchParams.get("tab")));

  useEffect(() => {
    setActiveTab(resolveTabFromParam(searchParams.get("tab")));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams.get("tab")]);
  const [summaryView, setSummaryView] = useState<"dados" | "portal">("dados");
  const [planView, setPlanView] = useState<"dieta" | "protocolos">("dieta");
  const [evolutionView, setEvolutionView] = useState<"timeline" | "agenda" | "tarefas" | "financeiro" | "relatorios">("timeline");
  const [data, setData] = useState<ClientDetail | null>(null);
  const [clinicalSummary, setClinicalSummary] = useState<Pick<NutritionRecord, "goals" | "risk_flags" | "diagnoses" | "allergies" | "biological_sex"> | null>(null);
  const [loading, setLoading] = useState(true);

  // Resumo edit state
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [status, setStatus] = useState("ativo");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingClient, setDeletingClient] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  async function startConsultation() {
    try {
      await fetch(`/api/admin/clients/${id}/consultation`, { method: "POST" });
    } finally {
      router.push(`/dashboard/clients/${id}/consulta`);
    }
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

  // Timeline
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [timelineLoading, setTimelineLoading] = useState(false);

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
    fetch(`/api/admin/clients/${id}`)
      .then((res) => {
        if (!res.ok) { router.push("/dashboard/clients"); return null; }
        return res.json() as Promise<ClientDetail>;
      })
      .then((res) => {
        if (!res) return;
        setData(res);
        setName(res.name); setEmail(res.email ?? ""); setPhone(res.phone ?? "");
        setBirthDate(res.birth_date ?? ""); setStatus(res.status); setNotes(res.notes ?? "");
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [id, router]);

  useEffect(() => {
    fetch(`/api/admin/clients/${id}/nutrition-record`)
      .then((response) => response.ok ? response.json() as Promise<NutritionRecord> : null)
      .then((record) => record && setClinicalSummary({ goals: record.goals, risk_flags: record.risk_flags, diagnoses: record.diagnoses, allergies: record.allergies, biological_sex: record.biological_sex }))
      .catch(() => null);
  }, [id]);

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
    if (activeTab === "resumo" && summaryView === "portal" && !portalAccess) {
      reloadPortalAccess();
    }
    if (activeTab === "evolucao" && evolutionView === "agenda" && appointments.length === 0) {
      setAppointmentsLoading(true);
      fetch(`/api/admin/appointments?clientId=${id}`)
        .then((r) => r.json()).then((d: { items: ClientAppointment[] }) => setAppointments(d.items ?? []))
        .catch(() => null).finally(() => setAppointmentsLoading(false));
    }
    if (activeTab === "evolucao" && evolutionView === "tarefas") {
      setTasksLoading(true);
      const params = new URLSearchParams(taskStatusFilter ? { status: taskStatusFilter } : {});
      fetch(`/api/admin/clients/${id}/tasks?${params}`)
        .then((r) => r.json()).then((d: ClientTask[]) => setTasks(d ?? []))
        .catch(() => null).finally(() => setTasksLoading(false));
    }
    if (activeTab === "evolucao" && evolutionView === "financeiro" && payments.length === 0) {
      setPaymentsLoading(true);
      fetch(`/api/admin/payments?clientId=${id}`)
        .then((r) => r.json()).then((d: { items: ClientPayment[] }) => setPayments(d.items ?? []))
        .catch(() => null).finally(() => setPaymentsLoading(false));
    }
    if ((activeTab === "antropometria" || activeTab === "evolucao") && evolutions.length === 0) {
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
    if (activeTab === "evolucao" && evolutionView === "timeline" && timeline.length === 0) {
      setTimelineLoading(true);
      fetch(`/api/admin/clients/${id}/timeline`)
        .then((r) => r.json()).then((d: TimelineEvent[]) => setTimeline(d ?? []))
        .catch(() => null).finally(() => setTimelineLoading(false));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, id, summaryView, planView, evolutionView]);

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
  };

  const reloadTimeline = () => {
    fetch(`/api/admin/clients/${id}/timeline`)
      .then((r) => r.json()).then((d: TimelineEvent[]) => setTimeline(d ?? []))
      .catch(() => null);
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

  if (loading) return <div className="text-center py-20 text-[#A8927D] text-sm">Carregando...</div>;
  if (!data) return null;

  const hasClinicalGrowth =
    Boolean(clinicalGrowth?.pediatric.applicable && clinicalGrowth.pediatric.results.length) ||
    Boolean(clinicalGrowth?.gestational.applicable) ||
    Boolean(clinicalGrowth?.bariatric.applicable);

  return (
    <div className="mx-auto w-full min-w-0 max-w-7xl space-y-6 pb-16 animate-fade-up">
      {/* Top bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Link href="/dashboard/clients"
          className="inline-flex items-center gap-2 text-sm text-[#7A9A74] hover:text-[#B47F6A] transition-colors font-medium">
          <ArrowLeft className="w-4 h-4" />
          Clientes
        </Link>
        <Link href={`/dashboard/clients/${id}/print`} target="_blank"
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-full border border-[#EAD8C2] px-4 py-2 text-xs font-medium text-[#8C6E52] transition-colors hover:bg-[#EAD8C2]/40 sm:w-auto">
          <Printer className="w-3.5 h-3.5" />
          Relatório imprimível
        </Link>
        <button
          type="button"
          onClick={() => void startConsultation()}
          className="inline-flex min-h-10 cursor-pointer items-center justify-center gap-2 rounded-full bg-[#7F9A74] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#607A56] sm:w-auto"
        >
          <Stethoscope className="w-3.5 h-3.5" />
          Iniciar consulta
        </button>
        <button
          type="button"
          onClick={() => setDeleteDialogOpen(true)}
          className="inline-flex min-h-10 cursor-pointer items-center justify-center gap-2 rounded-full border border-[#E8C3BA] px-4 py-2 text-xs font-semibold text-[#9A5C4E] transition-colors hover:bg-[#F6E6E0] sm:w-auto"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Excluir paciente
        </button>
      </div>

      {/* Patient workspace */}
      <div className="brand-card w-full min-w-0 overflow-hidden">
        <div className="flex min-w-0 flex-col gap-5 border-b border-[#EAD8C2] bg-[#FAF7F2] p-5 sm:p-6 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-center">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-[#EAD8C2] text-[#8C6E52]"><User className="h-7 w-7" /></div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2"><h1 className="min-w-0 break-words font-serif text-2xl font-semibold leading-tight text-[#3A2B1F] sm:truncate">{data.name}</h1><span className={STATUS_BADGE[data.status] ?? "brand-badge brand-badge-arquivado"}>{STATUS_LABEL[data.status] ?? data.status}</span></div>
              <p className="mt-1 text-sm text-[#75675E]">{calculateAge(data.birth_date)} · Paciente desde {formatDateSafe(data.created_at)}</p>
              <div className="mt-2 grid min-w-0 gap-1 text-xs text-[#8C6E52] sm:flex sm:flex-wrap sm:gap-x-4 sm:gap-y-1">{data.phone && <span className="flex min-w-0 items-center gap-1.5"><Phone className="h-3.5 w-3.5 shrink-0" /><span className="min-w-0 break-all">{data.phone}</span></span>}{data.email && <span className="flex min-w-0 items-center gap-1.5"><Mail className="h-3.5 w-3.5 shrink-0" /><span className="min-w-0 break-all">{data.email}</span></span>}</div>
            </div>
          </div>
          <div className="grid min-w-0 gap-2 sm:grid-cols-2 xl:w-[34rem] xl:shrink-0">
            <div className="rounded-lg border border-[#D9E4D3] bg-[#FFFDFC] p-3"><p className="text-[9px] font-bold uppercase tracking-[0.1em] text-[#607A56]">Objetivo principal</p><p className="mt-1 line-clamp-2 text-xs leading-5 text-[#3A3028]">{clinicalSummary?.goals || "Defina o objetivo clínico na anamnese."}</p></div>
            <div className="rounded-lg border border-[#EAD8C2] bg-[#FFFDFC] p-3"><p className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-[0.1em] text-[#8C5F50]"><AlertTriangle className="h-3 w-3" />Alertas de saúde</p><p className="mt-1 line-clamp-2 text-xs leading-5 text-[#3A3028]">{clinicalSummary?.risk_flags || clinicalSummary?.allergies || clinicalSummary?.diagnoses || "Nenhum alerta registrado."}</p></div>
          </div>
        </div>

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
          {activeTab === "resumo" && <SecondaryNavigation items={[{ id: "dados", label: "Dados principais" }, { id: "portal", label: "Portal do cliente" }]} value={summaryView} onChange={(value) => setSummaryView(value as typeof summaryView)} />}
          {activeTab === "plano-alimentar" && <SecondaryNavigation items={[{ id: "dieta", label: "Plano alimentar" }, { id: "protocolos", label: "Protocolos de cuidado" }]} value={planView} onChange={(value) => setPlanView(value as typeof planView)} />}
          {activeTab === "evolucao" && <SecondaryNavigation items={[{ id: "timeline", label: "Linha do tempo" }, { id: "agenda", label: "Consultas" }, { id: "tarefas", label: "Tarefas" }, { id: "financeiro", label: "Financeiro" }, { id: "relatorios", label: "Relatórios" }]} value={evolutionView} onChange={(value) => setEvolutionView(value as typeof evolutionView)} />}

          {/* ── Resumo ─────────────────────────────────────────── */}
          {activeTab === "resumo" && summaryView === "dados" && (
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
                  Imprimir plano alimentar
                </Link>
              </div>
              <MealPlanEditor clientId={id} onSaved={reloadTimeline} />
            </div>
          )}

          {activeTab === "resumo" && summaryView === "portal" && (
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
            <div className="space-y-4">
              <h2 className="font-serif font-semibold text-lg text-[#B47F6A]">Timeline do paciente</h2>
              {timelineLoading ? (
                <p className="text-sm text-[#A8927D]">Carregando...</p>
              ) : timeline.length === 0 ? (
                <div className="text-center py-10">
                  <Clock className="w-10 h-10 text-[#EAD8C2] mx-auto mb-3" />
                  <p className="text-[#A8927D] text-sm">Nenhum evento na timeline ainda.</p>
                </div>
              ) : (
                <div className="relative">
                  <div className="absolute left-5 top-0 bottom-0 w-px bg-[#EAD8C2]" />
                  <ul className="space-y-4 pl-12">
                    {timeline.map((event) => (
                      <li key={event.id} className="relative">
                        <div className="absolute -left-7 w-5 h-5 rounded-full bg-[#EAD8C2] flex items-center justify-center text-xs">
                          {TIMELINE_ICONS[event.type] ?? "•"}
                        </div>
                        <div className="bg-[#FAF7F2] border border-[#EAD8C2]/60 rounded-xl p-4">
                          <div className="flex items-start justify-between gap-2">
                            <p className="font-medium text-sm text-[#3A2B1F]">{event.title}</p>
                            <p className="text-xs text-[#A8927D] shrink-0">{formatDateSafe(event.created_at, "dd/MM HH:mm")}</p>
                          </div>
                          {event.description && (
                            <p className="text-xs text-[#8C6E52] mt-1">{event.description}</p>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-black/35 px-4 py-6 backdrop-blur-sm">
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
