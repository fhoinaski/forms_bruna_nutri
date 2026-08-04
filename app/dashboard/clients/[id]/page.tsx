"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, Save, Phone, Mail, FileText, Printer,
  User, BookOpen, CheckSquare, TrendingUp, Clock,
  BarChart2, Plus, Check, X, Trash2, ChevronRight,
  CalendarDays, WalletCards, KeyRound, ShieldCheck, RefreshCw, ExternalLink,
  Copy, Play,
} from "lucide-react";
import { format, parseISO, isValid } from "date-fns";

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
  id: string; client_protocol_id: string | null; weight: number | null;
  height: number | null; bmi: number | null; symptoms: string | null;
  adherence_notes: string | null; progress_notes: string | null;
  conduct_notes: string | null; next_steps: string | null; created_at: string;
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
  chief_complaint: string | null; clinical_history: string | null; diagnoses: string | null;
  medications: string | null; supplements: string | null; allergies: string | null;
  restrictions: string | null; food_preferences: string | null; food_aversions: string | null;
  eating_routine: string | null; intestinal_health: string | null; sleep_routine: string | null;
  stress_context: string | null; physical_activity: string | null; hydration: string | null;
  current_weight_kg: string | null; height_cm: string | null; bmi: string | null; waist_cm: string | null;
  anthropometry_notes: string | null; exams: string | null; assessment: string | null;
  goals: string | null; care_plan: string | null; risk_flags: string | null;
  family_context: string | null; private_notes: string | null;
  created_at: string; updated_at: string;
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
  { id: "prontuario", label: "Prontuario", icon: FileText },
  { id: "portal", label: "Portal", icon: KeyRound },
  { id: "protocolos", label: "Protocolos", icon: BookOpen },
  { id: "agenda", label: "Agenda", icon: CalendarDays },
  { id: "tarefas", label: "Tarefas", icon: CheckSquare },
  { id: "evolucoes", label: "Evoluções", icon: TrendingUp },
  { id: "financeiro", label: "Financeiro", icon: WalletCards },
  { id: "timeline", label: "Timeline", icon: Clock },
  { id: "relatorios", label: "Relatórios", icon: BarChart2 },
] as const;

type TabId = typeof TABS[number]["id"];

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

const NUTRITION_TEXT_FIELDS: { key: keyof NutritionRecord; label: string; placeholder: string; rows?: number }[] = [
  { key: "chief_complaint", label: "Motivo principal do acompanhamento", placeholder: "O que trouxe a paciente ao atendimento, prioridade do momento e expectativa central.", rows: 3 },
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
  { key: "exams", label: "Exames e indicadores laboratoriais", placeholder: "Exames recentes, datas, marcadores alterados e pontos para acompanhar.", rows: 4 },
  { key: "assessment", label: "Avaliacao nutricional", placeholder: "Leitura profissional do caso, prioridades clinicas e hipoteses de trabalho.", rows: 4 },
  { key: "goals", label: "Objetivos combinados", placeholder: "Objetivos terapeuticos, metas realistas, sinais de evolucao e combinados com a paciente.", rows: 3 },
  { key: "care_plan", label: "Plano de cuidado e conduta", placeholder: "Conduta nutricional, orientacoes, ajustes, materiais enviados e proximos passos.", rows: 5 },
  { key: "risk_flags", label: "Sinais de atencao", placeholder: "Alertas clinicos, sintomas que exigem encaminhamento, cuidados e pontos para monitorar.", rows: 3 },
  { key: "family_context", label: "Contexto familiar e rotina da casa", placeholder: "Participacao da familia, cuidadoras, escola, rede de apoio e acordos praticos.", rows: 3 },
  { key: "private_notes", label: "Notas privadas do atendimento", placeholder: "Observacoes sensiveis para uso interno profissional.", rows: 3 },
];

const ANTHROPOMETRY_FIELDS: { key: keyof NutritionRecord; label: string; placeholder: string }[] = [
  { key: "current_weight_kg", label: "Peso atual (kg)", placeholder: "Ex: 68,5" },
  { key: "height_cm", label: "Altura (cm)", placeholder: "Ex: 165" },
  { key: "bmi", label: "IMC", placeholder: "Ex: 25,2" },
  { key: "waist_cm", label: "Cintura (cm)", placeholder: "Ex: 82" },
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

function NutritionRecordEditor({ clientId, onSaved }: { clientId: string; onSaved: () => void }) {
  const [record, setRecord] = useState<NutritionRecord | null>(null);
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

  const setField = (key: keyof NutritionRecord, value: string) => {
    setRecord((prev) => prev ? { ...prev, [key]: value } : prev);
  };

  const handleSave = async () => {
    if (!record) return;
    setSaving(true); setSaved(false); setError("");
    const recordFields: (keyof NutritionRecord)[] = [
      ...NUTRITION_TEXT_FIELDS.map((field) => field.key),
      ...ANTHROPOMETRY_FIELDS.map((field) => field.key),
      "anthropometry_notes",
    ];
    const computedBmi = calculateBmi(record.current_weight_kg, record.height_cm);
    const payload = Object.fromEntries(
      recordFields.map((key) => {
        const value = key === "bmi" && !record.bmi ? computedBmi : record[key];
        return [key, String(value ?? "").trim() || null];
      })
    );
    try {
      const res = await fetch(`/api/admin/clients/${clientId}/nutrition-record`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
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

      <div className="rounded-2xl border border-[#EAD8C2] bg-[#FAF7F2]/70 p-5">
        <h3 className="font-serif text-base font-semibold text-[#7A9A74]">Antropometria e medidas</h3>
        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-4">
          {ANTHROPOMETRY_FIELDS.map((field) => (
            <div key={field.key}>
              <label className="brand-label">{field.label}</label>
              <input
                value={String(record[field.key] ?? "")}
                onChange={(e) => setField(field.key, e.target.value)}
                className="brand-input"
                placeholder={field.placeholder}
              />
            </div>
          ))}
        </div>
        {!record.bmi && calculateBmi(record.current_weight_kg, record.height_cm) && (
          <p className="mt-3 text-xs font-medium text-[#7A9A74]">
            IMC calculado ao salvar: {calculateBmi(record.current_weight_kg, record.height_cm)}
          </p>
        )}
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

export default function ClientDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<TabId>("resumo");
  const [data, setData] = useState<ClientDetail | null>(null);
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
    if (activeTab === "protocolos" && protocols.length === 0) {
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
    if (activeTab === "portal" && !portalAccess) {
      reloadPortalAccess();
    }
    if (activeTab === "agenda" && appointments.length === 0) {
      setAppointmentsLoading(true);
      fetch(`/api/admin/appointments?clientId=${id}`)
        .then((r) => r.json()).then((d: { items: ClientAppointment[] }) => setAppointments(d.items ?? []))
        .catch(() => null).finally(() => setAppointmentsLoading(false));
    }
    if (activeTab === "tarefas") {
      setTasksLoading(true);
      const params = new URLSearchParams(taskStatusFilter ? { status: taskStatusFilter } : {});
      fetch(`/api/admin/clients/${id}/tasks?${params}`)
        .then((r) => r.json()).then((d: ClientTask[]) => setTasks(d ?? []))
        .catch(() => null).finally(() => setTasksLoading(false));
    }
    if (activeTab === "financeiro" && payments.length === 0) {
      setPaymentsLoading(true);
      fetch(`/api/admin/payments?clientId=${id}`)
        .then((r) => r.json()).then((d: { items: ClientPayment[] }) => setPayments(d.items ?? []))
        .catch(() => null).finally(() => setPaymentsLoading(false));
    }
    if (activeTab === "evolucoes" && evolutions.length === 0) {
      setEvolutionsLoading(true);
      fetch(`/api/admin/clients/${id}/evolutions`)
        .then((r) => r.json()).then((d: ClientEvolution[]) => setEvolutions(d ?? []))
        .catch(() => null).finally(() => setEvolutionsLoading(false));
    }
    if (activeTab === "timeline" && timeline.length === 0) {
      setTimelineLoading(true);
      fetch(`/api/admin/clients/${id}/timeline`)
        .then((r) => r.json()).then((d: TimelineEvent[]) => setTimeline(d ?? []))
        .catch(() => null).finally(() => setTimelineLoading(false));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, id]);

  useEffect(() => {
    if (activeTab === "tarefas") {
      setTasksLoading(true);
      const params = new URLSearchParams(taskStatusFilter ? { status: taskStatusFilter } : {});
      fetch(`/api/admin/clients/${id}/tasks?${params}`)
        .then((r) => r.json()).then((d: ClientTask[]) => setTasks(d ?? []))
        .catch(() => null).finally(() => setTasksLoading(false));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskStatusFilter]);

  const reloadClientProtocols = async () => {
    const response = await fetch(`/api/admin/clients/${id}/protocols`);
    if (response.ok) setProtocols(await response.json() as ClientProtocol[]);
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
  };

  const reloadEvolutions = () => {
    setEvolutionsLoading(true);
    fetch(`/api/admin/clients/${id}/evolutions`)
      .then((r) => r.json()).then((d: ClientEvolution[]) => setEvolutions(d ?? []))
      .catch(() => null).finally(() => setEvolutionsLoading(false));
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

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-16 animate-fade-up">
      {/* Top bar */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <Link href="/dashboard/clients"
          className="inline-flex items-center gap-2 text-sm text-[#7A9A74] hover:text-[#B47F6A] transition-colors font-medium">
          <ArrowLeft className="w-4 h-4" />
          Clientes
        </Link>
        <Link href={`/dashboard/clients/${id}/print`} target="_blank"
          className="inline-flex items-center gap-2 text-xs font-medium text-[#8C6E52] border border-[#EAD8C2] rounded-full px-4 py-2 hover:bg-[#EAD8C2]/40 transition-colors">
          <Printer className="w-3.5 h-3.5" />
          Relatório imprimível
        </Link>
      </div>

      {/* Patient header card */}
      <div className="brand-card overflow-hidden">
        <div className="p-8 border-b border-[#EAD8C2] bg-gradient-to-br from-[#FAF7F2] to-[#EAD8C2]/30 text-center relative overflow-hidden">
          <div className="absolute right-[-30px] top-[-30px] opacity-10 pointer-events-none">
            <svg width="180" height="180" viewBox="0 0 100 100" fill="none">
              <circle cx="50" cy="50" r="45" stroke="#7A9A74" strokeWidth="0.5" />
              <circle cx="50" cy="50" r="30" stroke="#B47F6A" strokeWidth="0.5" />
            </svg>
          </div>
          <div className="w-16 h-16 bg-[#EAD8C2] rounded-full flex items-center justify-center mx-auto mb-4">
            <User className="w-8 h-8 text-[#8C6E52]" />
          </div>
          <p className="brand-kicker mb-2">Ficha do cliente</p>
          <h1 className="font-serif font-bold text-2xl text-[#3A2B1F] mb-3">{data.name}</h1>
          <div className="flex flex-wrap justify-center gap-4 text-sm text-[#8C6E52] mb-4">
            {data.phone && <span className="flex items-center gap-1.5"><Phone className="w-3.5 h-3.5" />{data.phone}</span>}
            {data.email && <span className="flex items-center gap-1.5"><Mail className="w-3.5 h-3.5" />{data.email}</span>}
          </div>
          <div className="flex items-center justify-center gap-3">
            <span className={STATUS_BADGE[data.status] ?? "brand-badge brand-badge-arquivado"}>
              {STATUS_LABEL[data.status] ?? data.status}
            </span>
            <span className="text-xs text-[#A8927D]">Cadastrado em {formatDateSafe(data.created_at)}</span>
          </div>
          {data.source_submission_id && (
            <div className="mt-4">
              <Link href={`/dashboard/submissions/${data.source_submission_id}`}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-[#7A9A74] border border-[#7A9A74]/30 rounded-full px-4 py-1.5 hover:bg-[#7A9A74]/10 transition-colors">
                <FileText className="w-3.5 h-3.5" />
                Ver formulário original
              </Link>
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="border-b border-[#EAD8C2] overflow-x-auto">
          <div className="flex min-w-max">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              return (
                <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-5 py-3.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                    activeTab === tab.id
                      ? "border-[#7A9A74] text-[#7A9A74]"
                      : "border-transparent text-[#A8927D] hover:text-[#8C6E52]"
                  }`}>
                  <Icon className="w-4 h-4" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Tab content */}
        <div className="p-8">

          {/* ── Resumo ─────────────────────────────────────────── */}
          {activeTab === "resumo" && (
            <div className="space-y-6">
              <h2 className="font-serif font-semibold text-lg text-[#B47F6A]">Dados do paciente</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
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
                  rows={4} className="brand-input resize-y" placeholder="Observações sobre a paciente..." />
              </div>
              {saveError && <p className="text-sm text-red-600">{saveError}</p>}
              <div className="flex justify-end">
                <button onClick={handleSave} disabled={saving} className="brand-btn-primary">
                  <Save className="w-4 h-4" />
                  {saving ? "Salvando..." : saved ? "Salvo!" : "Salvar alterações"}
                </button>
              </div>
            </div>
          )}

          {/* ── Protocolos ─────────────────────────────────────── */}
          {activeTab === "prontuario" && (
            <NutritionRecordEditor clientId={id} onSaved={reloadTimeline} />
          )}

          {activeTab === "portal" && (
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

          {activeTab === "protocolos" && (
            <div className="space-y-7">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="brand-kicker mb-1">Plano de cuidado</p>
                  <h2 className="font-serif text-2xl font-semibold text-[#3A3028]">Protocolos da cliente</h2>
                  <p className="mt-1 text-sm leading-6 text-[#75675E]">Inicie um modelo padrão ou crie uma cópia individual sem alterar a biblioteca.</p>
                </div>
                <Link href="/dashboard/protocols" className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#607A56] hover:text-[#B47F6A]">
                  Ver biblioteca <ChevronRight className="h-4 w-4" />
                </Link>
              </div>

              <section className="rounded-xl border border-[#E6D5C5] bg-[#FBF7F1] p-5">
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
                            <Link href={`/dashboard/protocols/${protocol.protocol_id}`} className="inline-flex items-center gap-1 text-sm font-semibold text-[#607A56] hover:text-[#B47F6A]">Abrir plano <ChevronRight className="h-4 w-4" /></Link>
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
          {activeTab === "agenda" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-serif font-semibold text-lg text-[#B47F6A]">Agenda do paciente</h2>
                <Link href="/dashboard/agenda"
                  className="text-xs font-medium text-[#7A9A74] hover:text-[#B47F6A] transition-colors flex items-center gap-1">
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

          {activeTab === "tarefas" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <h2 className="font-serif font-semibold text-lg text-[#B47F6A]">Tarefas</h2>
                <div className="flex gap-2 flex-wrap">
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
                        <div className="flex items-center gap-2 shrink-0">
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
          {activeTab === "evolucoes" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-serif font-semibold text-lg text-[#B47F6A]">Evoluções clínicas</h2>
                <button onClick={() => setShowEvolutionForm((v) => !v)}
                  className="brand-btn-primary text-sm">
                  <Plus className="w-4 h-4" />
                  Nova evolução
                </button>
              </div>

              {showEvolutionForm && (
                <EvolutionForm clientId={id} onSuccess={() => { reloadEvolutions(); reloadTimeline(); }} />
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
                    <li key={ev.id} className="border border-[#EAD8C2] rounded-xl p-5 bg-[#FAF7F2]/60">
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <p className="text-xs text-[#A8927D]">{formatDateSafe(ev.created_at, "dd/MM/yyyy 'às' HH:mm")}</p>
                        <div className="flex items-center gap-3">
                          {ev.weight && (
                            <span className="text-xs font-semibold text-[#7A9A74]">{ev.weight}kg</span>
                          )}
                          {ev.bmi && (
                            <span className="text-xs bg-[#EAD8C2] text-[#8C6E52] px-2 py-0.5 rounded-full">
                              IMC {ev.bmi}
                            </span>
                          )}
                          <button onClick={() => handleDeleteEvolution(ev.id)}
                            title="Remover"
                            className="p-1 rounded-lg text-[#A8927D] hover:bg-red-50 hover:text-red-600 transition-colors">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                        {ev.symptoms && (
                          <div><p className="brand-label mb-1">Sintomas</p><p className="text-[#3A2B1F]">{ev.symptoms}</p></div>
                        )}
                        {ev.adherence_notes && (
                          <div><p className="brand-label mb-1">Adesão</p><p className="text-[#3A2B1F]">{ev.adherence_notes}</p></div>
                        )}
                        {ev.progress_notes && (
                          <div className="md:col-span-2"><p className="brand-label mb-1">Progressos</p><p className="text-[#3A2B1F]">{ev.progress_notes}</p></div>
                        )}
                        {ev.conduct_notes && (
                          <div className="md:col-span-2"><p className="brand-label mb-1">Conduta</p><p className="text-[#3A2B1F]">{ev.conduct_notes}</p></div>
                        )}
                        {ev.next_steps && (
                          <div className="md:col-span-2"><p className="brand-label mb-1">Próximos passos</p><p className="text-[#3A2B1F]">{ev.next_steps}</p></div>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* ── Timeline ───────────────────────────────────────── */}
          {activeTab === "financeiro" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-serif font-semibold text-lg text-[#B47F6A]">Financeiro do paciente</h2>
                <Link href="/dashboard/financeiro"
                  className="text-xs font-medium text-[#7A9A74] hover:text-[#B47F6A] transition-colors flex items-center gap-1">
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

          {activeTab === "timeline" && (
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
          {activeTab === "relatorios" && (
            <div className="space-y-4">
              <h2 className="font-serif font-semibold text-lg text-[#B47F6A]">Relatórios</h2>
              <div className="border border-[#EAD8C2] rounded-2xl p-6 bg-[#FAF7F2]/60 flex items-center justify-between">
                <div>
                  <p className="font-medium text-sm text-[#3A2B1F]">Relatório completo do cliente</p>
                  <p className="text-xs text-[#8C6E52] mt-1">
                    Dados, protocolos, tarefas, evoluções e timeline em um documento imprimível.
                  </p>
                </div>
                <Link href={`/dashboard/clients/${id}/print`} target="_blank"
                  className="inline-flex items-center gap-2 bg-[#F4C9C6] text-[#B47F6A] px-5 py-2 rounded-full text-sm font-semibold hover:bg-[#f1b8b4] transition-colors shrink-0">
                  <Printer className="w-4 h-4" />
                  Abrir relatório
                </Link>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
