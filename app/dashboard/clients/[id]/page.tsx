"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, Save, Phone, Mail, FileText, Printer,
  User, BookOpen, CheckSquare, TrendingUp, Clock,
  BarChart2, Plus, Check, X, Trash2, ChevronRight,
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
  protocol_title: string | null; protocol_category: string | null;
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
const PROTOCOL_STATUS_COLORS: Record<string, string> = {
  ativo: "brand-badge brand-badge-finalizado",
  concluido: "brand-badge brand-badge-andamento",
  cancelado: "brand-badge brand-badge-arquivado",
};

const TIMELINE_ICONS: Record<string, string> = {
  client_created: "👤", protocol_applied: "📋", protocol_created: "✨",
  task_completed: "✅", evolution_recorded: "📊", report_generated: "📄",
  protocol_completed: "🏁",
};

const TABS = [
  { id: "resumo", label: "Resumo", icon: User },
  { id: "protocolos", label: "Protocolos", icon: BookOpen },
  { id: "tarefas", label: "Tarefas", icon: CheckSquare },
  { id: "evolucoes", label: "Evoluções", icon: TrendingUp },
  { id: "timeline", label: "Timeline", icon: Clock },
  { id: "relatorios", label: "Relatórios", icon: BarChart2 },
] as const;

type TabId = typeof TABS[number]["id"];

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
      <div className="grid grid-cols-2 gap-4">
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
      fetch(`/api/admin/clients/${id}/protocols`)
        .then((r) => r.json()).then((d: ClientProtocol[]) => setProtocols(d ?? []))
        .catch(() => null).finally(() => setProtocolsLoading(false));
    }
    if (activeTab === "tarefas") {
      setTasksLoading(true);
      const params = new URLSearchParams(taskStatusFilter ? { status: taskStatusFilter } : {});
      fetch(`/api/admin/clients/${id}/tasks?${params}`)
        .then((r) => r.json()).then((d: ClientTask[]) => setTasks(d ?? []))
        .catch(() => null).finally(() => setTasksLoading(false));
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
          {activeTab === "protocolos" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-serif font-semibold text-lg text-[#B47F6A]">Protocolos aplicados</h2>
                <Link href="/dashboard/protocols"
                  className="text-xs font-medium text-[#7A9A74] hover:text-[#B47F6A] transition-colors flex items-center gap-1">
                  Ver biblioteca
                  <ChevronRight className="w-3.5 h-3.5" />
                </Link>
              </div>
              {protocolsLoading ? (
                <p className="text-sm text-[#A8927D]">Carregando...</p>
              ) : protocols.length === 0 ? (
                <div className="text-center py-10">
                  <BookOpen className="w-10 h-10 text-[#EAD8C2] mx-auto mb-3" />
                  <p className="text-[#A8927D] text-sm">Nenhum protocolo aplicado ainda.</p>
                  <p className="text-[#A8927D] text-xs mt-1">
                    Aplique um protocolo a partir da tela de formulário ou rascunho IA aprovado.
                  </p>
                </div>
              ) : (
                <ul className="space-y-3">
                  {protocols.map((p) => (
                    <li key={p.id} className="border border-[#EAD8C2] rounded-xl p-4 bg-[#FAF7F2]/60">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-medium text-[#3A2B1F] text-sm">
                            {p.protocol_title ?? "Protocolo sem título"}
                          </p>
                          {p.protocol_category && (
                            <span className="text-xs text-[#8C6E52]">{p.protocol_category}</span>
                          )}
                          <p className="text-xs text-[#A8927D] mt-1">
                            Iniciado em {formatDateSafe(p.started_at)}
                            {p.completed_at ? ` · Concluído em ${formatDateSafe(p.completed_at)}` : ""}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className={PROTOCOL_STATUS_COLORS[p.status] ?? "brand-badge brand-badge-andamento"}>
                            {p.status}
                          </span>
                          <Link href={`/dashboard/protocols/${p.protocol_id}`}
                            className="text-xs text-[#7A9A74] hover:underline">
                            Ver
                          </Link>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* ── Tarefas ────────────────────────────────────────── */}
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
