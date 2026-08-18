"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowRight,
  BookOpen,
  Calendar,
  CheckCircle2,
  ClipboardList,
  Clock,
  Download,
  FileSpreadsheet,
  HeartHandshake,
  Newspaper,
  Search,
  Sparkles,
  Stethoscope,
  Users,
  WalletCards,
  Zap,
} from "lucide-react";
import { format, isValid, parseISO } from "date-fns";
import { BrandBadge } from "@/components/brand/BrandBadge";
import { HelpPopover } from "@/components/dashboard/HelpPopover";
import { AppointmentsTrendChart, type MonthlyPoint } from "@/components/dashboard/AppointmentsTrendChart";
import { NewPatientsChart } from "@/components/dashboard/NewPatientsChart";
import { DashboardKpiCard } from "@/components/dashboard/DashboardKpiCard";
import { DashboardPanel } from "@/components/dashboard/DashboardPanel";
import { UpcomingAppointmentsCard } from "@/components/dashboard/UpcomingAppointmentsCard";
import { FinancialSummaryCard } from "@/components/dashboard/FinancialSummaryCard";
import { ImportantActivitiesCard, type ActivityItem } from "@/components/dashboard/ImportantActivitiesCard";
import { TodayAgendaCard } from "@/components/dashboard/TodayAgendaCard";
import { TodayTasksCard } from "@/components/dashboard/TodayTasksCard";
import { QuickActionsCard } from "@/components/dashboard/QuickActionsCard";
import { AiInsightCard } from "@/components/dashboard/AiInsightCard";

function greetingForHour(hour: number): string {
  if (hour < 12) return "Bom dia";
  if (hour < 18) return "Boa tarde";
  return "Boa noite";
}

function formatDateSafe(value: string | null, fmt = "dd/MM/yyyy"): string {
  if (!value) return "-";
  try {
    const d = parseISO(value);
    return isValid(d) ? format(d, fmt) : "-";
  } catch {
    return "-";
  }
}

function formatMoney(cents: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

interface SubmissionSummary {
  id: string;
  patient_name: string;
  patient_email: string | null;
  patient_phone: string | null;
  child_name: string | null;
  child_age: string | null;
  form_type: string;
  status: string;
  created_at: string;
  objetivo?: string;
  tipoAtendimento?: string;
}

interface Metrics {
  total: number;
  novos: number;
  ultimos7dias: number;
  finalizados: number;
}

interface ApiResponse {
  items: SubmissionSummary[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  metrics: Metrics;
}

interface DashboardMetrics {
  clientesAtivos: number;
  protocolosAtivos: number;
  tarefasVencidas: number;
  protocolosAplicadosAtivos: number;
  rascunhosPendentes: number;
  consultasHoje: number;
  proximasConsultas: Array<{
    id: string;
    client_id?: string | null;
    client_name: string | null;
    title: string;
    starts_at: string;
    status: string;
    appointment_type: string;
  }>;
  financeiro: {
    receivedMonthCents: number;
    openCents: number;
    overdueCents: number;
    receivedCount: number;
    openCount: number;
    overdueCount: number;
  };
  proximasTarefas: Array<{
    id: string;
    client_id: string;
    client_name: string | null;
    title: string;
    due_date: string | null;
    status: string;
  }>;
  blog: {
    published: number;
    drafts: number;
    aiGenerated: number;
  };
  oportunidades: {
    total: number;
    novos: number;
    quentes: number;
    atrasadas: number;
    convertidas: number;
  };
  planosAlimentares: {
    total: number;
    active: number;
    draft: number;
    archived: number;
  };
  graficos: {
    atendimentosPorMes: MonthlyPoint[];
    novosPacientesPorMes: MonthlyPoint[];
  };
  hoje: {
    dateKey: string;
    agendamentos: Array<{
      id: string;
      client_id: string | null;
      client_name: string | null;
      title: string;
      appointment_type: string;
      starts_at: string;
      status: string;
    }>;
    agendamentosConfirmados: number;
    agendamentosPendentes: number;
    novosClientes: unknown[];
    novasSubmissoes: unknown[];
    tarefas: unknown[];
    tarefasHojeTodas: Array<{
      id: string;
      client_id: string;
      client_name: string | null;
      title: string;
      status: string;
      due_date: string | null;
    }>;
    tarefasHojeConcluidas: number;
  };
}

type DashboardActionType =
  | "APPOINTMENT_SOON"
  | "APPOINTMENT_NOW"
  | "PATIENT_REQUEST_PENDING"
  | "AI_PROPOSAL_PENDING"
  | "AI_PROPOSAL_REVIEW"
  | "PAYMENT_OVERDUE"
  | "WORKFLOW_DUE"
  | "SAFE_SUBSTITUTION_OCCURRED"
  | "SUBSTITUTION_REQUIRES_REVIEW";
type DashboardActionPriority = "URGENT" | "HIGH" | "NORMAL" | "INFO";
type DashboardActionSection = "NOW" | "ATTENTION" | "BUSINESS" | "RECENT";

interface DashboardActionItem {
  id: string;
  type: DashboardActionType;
  priority: DashboardActionPriority;
  section: DashboardActionSection;
  title: string;
  subject: string | null;
  description: string;
  source: string;
  sourceId: string;
  href: string;
  actionLabel: string;
  dueAt: string | null;
  occurredAt: string | null;
  createdAt: string | null;
  briefing?: {
    appointmentId: string;
    status: "none" | "pending" | "generating" | "ready" | "stale" | "failed";
    generatedAt: string | null;
    errorCode: string | null;
  };
}

interface DashboardActionsResponse {
  generatedAt: string;
  items: DashboardActionItem[];
}

interface ProactiveBriefState {
  appointmentId: string;
  clientId: string | null;
  status: "none" | "pending" | "generating" | "ready" | "stale" | "failed";
  generatedAt: string | null;
  errorCode: string | null;
  brief: null | {
    summary: { source: "AI_SUMMARY"; text: string } | null;
    facts: Array<{ source: "FACT"; label: string; value: string }>;
    changesSinceLastVisit: Array<{ source: "AI_SUMMARY"; description: string }>;
    attentionPoints: Array<{ source: "AI_SUMMARY"; priority: "high" | "normal"; description: string }>;
    suggestedQuestions: Array<{ source: "SUGGESTION"; question: string }>;
    currentPlanSummary: { source: "FACT"; text: string } | null;
    pendingItems: Array<{ source: "FACT" | "AI_SUMMARY"; description: string }>;
    dataGaps: Array<{ source: "AI_SUMMARY"; description: string }>;
  };
}

function PanelCard({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-xl border border-[#E8E8E3] bg-white shadow-[0_1px_2px_rgba(16,24,32,0.04)] ${className}`}
    >
      {children}
    </section>
  );
}

const ACTION_SECTION_LABELS: Record<DashboardActionSection, string> = {
  NOW: "Agora",
  ATTENTION: "Precisa da sua atenção",
  BUSINESS: "Negócio",
  RECENT: "Atividade recente",
};

const ACTION_SECTION_DESCRIPTIONS: Record<DashboardActionSection, string> = {
  NOW: "Eventos imediatos da agenda.",
  ATTENTION: "Pendências clínicas ou operacionais que pedem decisão.",
  BUSINESS: "Cobranças e acompanhamento financeiro.",
  RECENT: "Eventos informativos já tratados pelo sistema.",
};

const PRIORITY_LABELS: Record<DashboardActionPriority, string> = {
  URGENT: "Urgente",
  HIGH: "Alta",
  NORMAL: "Normal",
  INFO: "Info",
};

function iconForAction(type: DashboardActionType) {
  if (type === "APPOINTMENT_NOW" || type === "APPOINTMENT_SOON") return <Calendar className="h-4 w-4" />;
  if (type === "PATIENT_REQUEST_PENDING" || type === "SUBSTITUTION_REQUIRES_REVIEW") return <ClipboardList className="h-4 w-4" />;
  if (type === "AI_PROPOSAL_PENDING" || type === "AI_PROPOSAL_REVIEW") return <Sparkles className="h-4 w-4" />;
  if (type === "PAYMENT_OVERDUE") return <WalletCards className="h-4 w-4" />;
  if (type === "WORKFLOW_DUE") return <Clock className="h-4 w-4" />;
  return <CheckCircle2 className="h-4 w-4" />;
}

function ActionItemCard({ item, onOpenBrief }: { item: DashboardActionItem; onOpenBrief: (appointmentId: string) => void }) {
  const priorityTone = item.priority === "URGENT"
    ? "border-[#F2D2CC] bg-[#FDF3F1] text-[#B23B2E]"
    : item.priority === "HIGH"
      ? "border-[#EFDCC0] bg-[#FDF6EA] text-[#B5762F]"
      : item.priority === "INFO"
        ? "border-[#E8E8E3] bg-[#FAFAF8] text-[#6B6B65]"
        : "border-[#DCEBD6] bg-[#F5FAF3] text-[#3D6335]";
  const time = item.dueAt ?? item.occurredAt ?? item.createdAt;
  const openableBriefing = item.briefing && ["ready", "stale"].includes(item.briefing.status);
  const content = (
    <>
      <span className="flex min-w-0 gap-3">
        <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${priorityTone}`}>
          {iconForAction(item.type)}
        </span>
        <span className="min-w-0">
          <span className="flex flex-wrap items-center gap-2">
            <strong className="text-sm text-[#1F1F1C]">{item.title}</strong>
            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.06em] ${priorityTone}`}>
              {PRIORITY_LABELS[item.priority]}
            </span>
          </span>
          <span className="mt-1 block text-sm font-medium text-[#3A3A35]">{item.subject ?? "Sem paciente vinculado"}</span>
          <span className="mt-1 block text-xs leading-5 text-[#8A8A85]">{item.description}</span>
          <span className="mt-2 block text-[11px] font-semibold uppercase tracking-[0.08em] text-[#B0B0AA]">
            {time ? formatDateSafe(time, "dd/MM HH:mm") : item.source}
          </span>
        </span>
      </span>
      <span className="inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border border-[#4F7D45]/30 px-3.5 text-xs font-semibold text-[#4F7D45] transition group-hover:bg-[#EAF2E7] sm:self-center">
        {item.actionLabel}
        <ArrowRight className="h-3.5 w-3.5" />
      </span>
    </>
  );

  const className = "group grid w-full gap-3 rounded-lg border border-[#E8E8E3] bg-white p-3.5 text-left transition hover:border-[#4F7D45]/35 hover:bg-[#FAFAF8] sm:grid-cols-[minmax(0,1fr)_auto]";
  const ariaLabel = `${item.title}${item.subject ? `, ${item.subject}` : ""}. ${item.actionLabel}`;

  if (openableBriefing) {
    return (
      <button type="button" onClick={() => onOpenBrief(item.briefing!.appointmentId)} className={className} aria-label={ariaLabel}>
        {content}
      </button>
    );
  }

  return (
    <Link href={item.href} className={className} aria-label={ariaLabel}>
      {content}
    </Link>
  );
}

function ActionSection({ section, items, onOpenBrief }: { section: DashboardActionSection; items: DashboardActionItem[]; onOpenBrief: (appointmentId: string) => void }) {
  return (
    <section className="space-y-2.5">
      <div>
        <h3 className="text-sm font-bold text-[#1F1F1C]">{ACTION_SECTION_LABELS[section]}</h3>
        <p className="text-xs leading-5 text-[#8A8A85]">{ACTION_SECTION_DESCRIPTIONS[section]}</p>
      </div>
      {items.length ? (
        <div className="grid gap-2.5">
          {items.map((item) => <ActionItemCard key={item.id} item={item} onOpenBrief={onOpenBrief} />)}
        </div>
      ) : (
        <div className="rounded-lg border border-[#DCEBD6] bg-[#F5FAF3] p-3.5">
          <p className="text-sm font-semibold text-[#3D6335]">
            {section === "NOW" ? "Nada imediato agora." : section === "ATTENTION" ? "Nenhuma pendência importante agora." : section === "BUSINESS" ? "Nenhuma cobrança vencida detectada." : "Sem atividade recente relevante."}
          </p>
        </div>
      )}
    </section>
  );
}

function BriefList({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#4F7D45]">{title}</p>
      <ul className="mt-2 space-y-1 text-sm text-[#1F1F1C]">
        {items.map((item, index) => <li key={index}>• {item}</li>)}
      </ul>
    </div>
  );
}

function StageBar({
  label,
  value,
  total,
  tone = "sage",
}: {
  label: string;
  value: number;
  total: number;
  tone?: "sage" | "rose" | "gold";
}) {
  const percent = total > 0 ? Math.min(100, Math.round((value / total) * 100)) : 0;
  const color = tone === "rose" ? "bg-[#C0533F]" : tone === "gold" ? "bg-[#D89A45]" : "bg-[#4F7D45]";
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3 text-xs">
        <span className="font-semibold text-[#1F1F1C]">{label}</span>
        <span className="text-[#8A8A85]">{value}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-[#F1F1EE]">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [searchTrigger, setSearchTrigger] = useState(0);
  const [dashMetrics, setDashMetrics] = useState<DashboardMetrics | null>(null);
  const [actionsData, setActionsData] = useState<DashboardActionsResponse | null>(null);
  const [actionsLoading, setActionsLoading] = useState(true);
  const [briefState, setBriefState] = useState<ProactiveBriefState | null>(null);
  const [briefLoading, setBriefLoading] = useState(false);
  const [briefRefreshing, setBriefRefreshing] = useState(false);
  const [taskOverrides, setTaskOverrides] = useState<Record<string, string>>({});
  const [taskUpdating, setTaskUpdating] = useState<Record<string, boolean>>({});
  const [insightDismissed, setInsightDismissed] = useState(false);

  async function toggleTodayTask(taskId: string, currentStatus: string) {
    const nextStatus = currentStatus === "concluida" ? "pendente" : "concluida";
    setTaskUpdating((prev) => ({ ...prev, [taskId]: true }));
    try {
      const response = await fetch(`/api/admin/client-tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      if (response.ok) {
        setTaskOverrides((prev) => ({ ...prev, [taskId]: nextStatus }));
      }
    } finally {
      setTaskUpdating((prev) => ({ ...prev, [taskId]: false }));
    }
  }

  useEffect(() => {
    fetch("/api/admin/dashboard-metrics")
      .then((r) => {
        if (r.status === 401) {
          router.replace("/login");
          return null;
        }
        if (!r.ok) throw new Error("Erro ao buscar metricas do dashboard");
        return r.json() as Promise<DashboardMetrics>;
      })
      .then((d) => {
        if (d) setDashMetrics(d);
      })
      .catch(() => null);
  }, [router]);

  useEffect(() => {
    let active = true;
    async function loadActions() {
      try {
        const response = await fetch("/api/admin/dashboard/actions", { cache: "no-store" });
        if (response.status === 401) {
          router.replace("/login");
          return;
        }
        if (!response.ok) return;
        const result = await response.json() as DashboardActionsResponse;
        if (active) setActionsData(result);
      } finally {
        if (active) setActionsLoading(false);
      }
    }
    void loadActions();
    const interval = window.setInterval(loadActions, 60_000);
    const onFocus = () => void loadActions();
    window.addEventListener("focus", onFocus);
    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [router]);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          page: String(page),
          pageSize: "20",
          ...(search ? { search } : {}),
          ...(status ? { status } : {}),
        });
        const res = await fetch(`/api/admin/submissions?${params}`, {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error("Erro ao buscar dados");
        const json: ApiResponse = await res.json();
        setData(json);
      } catch (err) {
        if (!controller.signal.aborted) console.error(err);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [page, search, status, searchTrigger]);

  const metrics = data?.metrics;

  const actionGroups = useMemo(() => {
    const groups: Record<DashboardActionSection, DashboardActionItem[]> = {
      NOW: [],
      ATTENTION: [],
      BUSINESS: [],
      RECENT: [],
    };
    for (const item of actionsData?.items ?? []) groups[item.section].push(item);
    return groups;
  }, [actionsData]);
  const attentionCount = (actionsData?.items ?? []).filter((item) => item.priority !== "INFO").length;

  const topActivityItems: ActivityItem[] = useMemo(() => {
    const priorityOrder: Record<DashboardActionPriority, number> = { URGENT: 0, HIGH: 1, NORMAL: 2, INFO: 3 };
    return [...(actionsData?.items ?? [])]
      .filter((item) => item.section !== "RECENT")
      .sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority])
      .slice(0, 5)
      .map((item) => ({ id: item.id, title: item.title, subject: item.subject, href: item.href, priority: item.priority }));
  }, [actionsData]);

  const greeting = useMemo(() => `${greetingForHour(new Date().getHours())}, Bruna! 🌿`, []);

  const todayTasks = useMemo(
    () =>
      (dashMetrics?.hoje.tarefasHojeTodas ?? []).map((task) => ({
        ...task,
        status: taskOverrides[task.id] ?? task.status,
      })),
    [dashMetrics, taskOverrides]
  );

  const aiSuggestion = useMemo(() => {
    if (!dashMetrics) return null;
    if (dashMetrics.tarefasVencidas > 0) {
      return {
        text: `Existem ${dashMetrics.tarefasVencidas} tarefa${dashMetrics.tarefasVencidas === 1 ? "" : "s"} vencida${dashMetrics.tarefasVencidas === 1 ? "" : "s"} que podem precisar da sua atenção.`,
        href: "/dashboard/tarefas",
        label: "Ver tarefas",
      };
    }
    if (dashMetrics.rascunhosPendentes > 0) {
      return {
        text: `Existem ${dashMetrics.rascunhosPendentes} rascunho${dashMetrics.rascunhosPendentes === 1 ? "" : "s"} de IA aguardando sua revisão.`,
        href: "/dashboard/ai-recovery",
        label: "Revisar rascunhos",
      };
    }
    if (attentionCount > 0) {
      return {
        text: `Existem ${attentionCount} pendência${attentionCount === 1 ? "" : "s"} operacionais aguardando sua decisão hoje.`,
        href: "/dashboard/solicitacoes",
        label: "Ver inbox",
      };
    }
    return null;
  }, [dashMetrics, attentionCount]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (page !== 1) setPage(1);
    else setSearchTrigger((k) => k + 1);
  };

  const exportUrl = (type: "csv" | "excel") => {
    const params = new URLSearchParams({
      ...(search ? { search } : {}),
      ...(status ? { status } : {}),
    });
    return `/api/admin/export/${type}?${params}`;
  };

  async function openBrief(appointmentId: string) {
    setBriefLoading(true);
    try {
      const response = await fetch(`/api/admin/appointments/${appointmentId}/brief`, { cache: "no-store" });
      if (response.ok) setBriefState(await response.json() as ProactiveBriefState);
    } finally {
      setBriefLoading(false);
    }
  }

  async function refreshBrief() {
    if (!briefState) return;
    setBriefRefreshing(true);
    try {
      const response = await fetch(`/api/admin/appointments/${briefState.appointmentId}/brief`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force: true }),
      });
      if (response.ok) {
        const data = await response.json() as { state: ProactiveBriefState };
        setBriefState(data.state);
      }
    } finally {
      setBriefRefreshing(false);
    }
  }

  async function startConsultationFromBrief() {
    if (!briefState?.clientId) return;
    const response = await fetch(`/api/admin/clients/${briefState.clientId}/consultation`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ appointmentId: briefState.appointmentId }),
    });
    if (response.ok) router.push(`/dashboard/clients/${briefState.clientId}/consultation`);
  }

  return (
    <div className="mx-auto max-w-[1600px] space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <div>
            <h1 className="text-xl font-bold leading-tight text-[#1F1F1C] sm:text-2xl">{greeting}</h1>
            <p className="text-sm text-[#8A8A85]">Aqui está o resumo da sua clínica hoje.</p>
          </div>
          <HelpPopover topicKey="dashboard" />
        </div>
      </div>

      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[1fr_300px]">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <DashboardKpiCard
              icon={<Calendar className="h-4 w-4" />}
              label="Consultas hoje"
              value={dashMetrics?.consultasHoje ?? "-"}
              delta={dashMetrics ? `${dashMetrics.hoje.agendamentosConfirmados} confirmadas` : undefined}
              deltaTone="positive"
              href="/dashboard/agenda"
              iconTone="sage"
            />
            <DashboardKpiCard
              icon={<Users className="h-4 w-4" />}
              label="Pacientes ativos"
              value={dashMetrics?.clientesAtivos ?? "-"}
              href="/dashboard/clients"
              iconTone="lilac"
            />
            <DashboardKpiCard
              icon={<ClipboardList className="h-4 w-4" />}
              label="Planos alimentares"
              value={dashMetrics?.planosAlimentares.active ?? "-"}
              delta={dashMetrics ? `${dashMetrics.planosAlimentares.draft} em rascunho` : undefined}
              href="/dashboard/clients"
              iconTone="peach"
            />
            <DashboardKpiCard
              icon={<WalletCards className="h-4 w-4" />}
              label="Faturamento (mês)"
              value={dashMetrics ? formatMoney(dashMetrics.financeiro.receivedMonthCents) : "-"}
              href="/dashboard/financeiro"
              iconTone="mint"
            />
          </div>

          <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-3">
            <UpcomingAppointmentsCard appointments={dashMetrics?.proximasConsultas ?? null} loading={!dashMetrics} />
            <FinancialSummaryCard data={dashMetrics?.financeiro ?? null} loading={!dashMetrics} />
            <ImportantActivitiesCard items={actionsLoading ? null : topActivityItems} loading={actionsLoading} />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <DashboardPanel title="Evolução de atendimentos">
              <p className="mb-2 text-xs text-[#8A8A85]">Últimos 6 meses</p>
              <AppointmentsTrendChart data={dashMetrics?.graficos.atendimentosPorMes ?? []} />
            </DashboardPanel>
            <DashboardPanel title="Novos pacientes">
              <p className="mb-2 text-xs text-[#8A8A85]">Últimos 6 meses</p>
              <NewPatientsChart data={dashMetrics?.graficos.novosPacientesPorMes ?? []} />
            </DashboardPanel>
          </div>
        </div>

        <aside className="space-y-4">
          <TodayAgendaCard appointments={dashMetrics?.hoje.agendamentos ?? null} loading={!dashMetrics} />
          <TodayTasksCard
            tasks={dashMetrics ? todayTasks : null}
            loading={!dashMetrics}
            updating={taskUpdating}
            onToggle={toggleTodayTask}
          />
          <QuickActionsCard />
        </aside>
      </div>

      {aiSuggestion && !insightDismissed && (
        <AiInsightCard insight={aiSuggestion} onDismiss={() => setInsightDismissed(true)} />
      )}

      <details className="group rounded-xl border border-[#E8E8E3] bg-white p-4 shadow-[0_1px_2px_rgba(16,24,32,0.04)]">
        <summary className="cursor-pointer text-sm font-bold text-[#1F1F1C]">
          Mais indicadores e módulos do consultório
        </summary>
        <div className="mt-4 space-y-4">
          <div>
            <p className="mb-2.5 text-xs font-bold uppercase tracking-[0.06em] text-[#6B6B65]">Outros indicadores</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <DashboardKpiCard icon={<Users className="h-4 w-4" />} label="Pré-consultas" value={metrics?.total ?? "-"} iconTone="sage" />
              <DashboardKpiCard icon={<Sparkles className="h-4 w-4" />} label="Novas" value={metrics?.novos ?? "-"} iconTone="lilac" />
              <DashboardKpiCard icon={<CheckCircle2 className="h-4 w-4" />} label="Finalizadas" value={metrics?.finalizados ?? "-"} iconTone="mint" />
              <DashboardKpiCard icon={<BookOpen className="h-4 w-4" />} label="Protocolos ativos" value={dashMetrics?.protocolosAtivos ?? "-"} iconTone="peach" />
              <DashboardKpiCard icon={<Stethoscope className="h-4 w-4" />} label="Planos aplicados" value={dashMetrics?.protocolosAplicadosAtivos ?? "-"} iconTone="sage" />
              <DashboardKpiCard icon={<AlertCircle className="h-4 w-4" />} label="Tarefas vencidas" value={dashMetrics?.tarefasVencidas ?? "-"} iconTone="peach" />
              <DashboardKpiCard icon={<Sparkles className="h-4 w-4" />} label="Rascunhos IA" value={dashMetrics?.rascunhosPendentes ?? "-"} iconTone="lilac" />
              <DashboardKpiCard icon={<HeartHandshake className="h-4 w-4" />} label="Oportunidades" value={dashMetrics?.oportunidades.total ?? "-"} iconTone="mint" />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <PanelCard className="p-4">
              <p className="mb-3 text-xs font-bold uppercase tracking-[0.06em] text-[#6B6B65]">Jornada clínica</p>
              <div className="space-y-3">
                <StageBar label="Oportunidades novas" value={dashMetrics?.oportunidades.novos ?? 0} total={dashMetrics?.oportunidades.total ?? 0} tone="sage" />
                <StageBar label="Oportunidades quentes" value={dashMetrics?.oportunidades.quentes ?? 0} total={dashMetrics?.oportunidades.total ?? 0} tone="rose" />
                <StageBar label="Convertidas" value={dashMetrics?.oportunidades.convertidas ?? 0} total={dashMetrics?.oportunidades.total ?? 0} tone="gold" />
              </div>
              <Link href="/dashboard/oportunidades" className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-[#4F7D45] hover:text-[#3D6335]">
                Abrir funil <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </PanelCard>

            <PanelCard className="p-4">
              <p className="mb-3 flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.06em] text-[#6B6B65]">
                <Newspaper className="h-3.5 w-3.5" /> Conteúdo e IA
              </p>
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-lg bg-[#FAFAF8] p-2.5 text-center">
                  <p className="text-lg font-bold text-[#1F1F1C]">{dashMetrics?.blog.published ?? "-"}</p>
                  <p className="mt-0.5 text-[10px] uppercase tracking-wide text-[#8A8A85]">Posts</p>
                </div>
                <div className="rounded-lg bg-[#FAFAF8] p-2.5 text-center">
                  <p className="text-lg font-bold text-[#1F1F1C]">{dashMetrics?.blog.drafts ?? "-"}</p>
                  <p className="mt-0.5 text-[10px] uppercase tracking-wide text-[#8A8A85]">Rascunhos</p>
                </div>
                <div className="rounded-lg bg-[#FAFAF8] p-2.5 text-center">
                  <p className="text-lg font-bold text-[#1F1F1C]">{dashMetrics?.blog.aiGenerated ?? "-"}</p>
                  <p className="mt-0.5 text-[10px] uppercase tracking-wide text-[#8A8A85]">IA</p>
                </div>
              </div>
              <Link href="/dashboard/blog" className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-[#4F7D45] hover:text-[#3D6335]">
                Revisar conteúdo <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </PanelCard>
          </div>

          <PanelCard className="p-4">
            <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.06em] text-[#6B6B65]">Atenção operacional (completo)</p>
                {actionsData?.generatedAt && (
                  <p className="mt-1 text-[11px] text-[#B0B0AA]">Atualizado em {formatDateSafe(actionsData.generatedAt, "HH:mm")}</p>
                )}
              </div>
              <Link href="/dashboard/solicitacoes" className="inline-flex w-fit items-center gap-1.5 rounded-lg border border-[#E8E8E3] px-3 py-1.5 text-xs font-semibold text-[#4F7D45] hover:bg-[#FAFAF8]">
                <Zap className="h-3.5 w-3.5" />
                Ver inbox
              </Link>
            </div>
            {actionsLoading ? (
              <p className="rounded-lg bg-[#FAFAF8] p-4 text-sm text-[#8A8A85]">Carregando ações...</p>
            ) : (
              <div className="grid gap-5">
                <ActionSection section="NOW" items={actionGroups.NOW} onOpenBrief={openBrief} />
                <ActionSection section="ATTENTION" items={actionGroups.ATTENTION} onOpenBrief={openBrief} />
                <ActionSection section="BUSINESS" items={actionGroups.BUSINESS} onOpenBrief={openBrief} />
                <ActionSection section="RECENT" items={actionGroups.RECENT} onOpenBrief={openBrief} />
              </div>
            )}
          </PanelCard>

          <PanelCard className="p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="text-xs font-bold uppercase tracking-[0.06em] text-[#6B6B65]">Próximas pendências clínicas</p>
              <Link href="/dashboard/tarefas" className="text-xs font-semibold text-[#4F7D45] hover:text-[#3D6335]">Abrir</Link>
            </div>
            {!dashMetrics ? (
              <p className="py-6 text-center text-sm text-[#B0B0AA]">Carregando tarefas...</p>
            ) : dashMetrics.proximasTarefas.length === 0 ? (
              <p className="rounded-lg bg-[#FAFAF8] px-3 py-4 text-sm text-[#8A8A85]">Nenhuma tarefa pendente no momento.</p>
            ) : (
              <div className="grid gap-2.5 md:grid-cols-2 xl:grid-cols-3">
                {dashMetrics.proximasTarefas.map((task) => (
                  <Link key={task.id} href={`/dashboard/clients/${task.client_id}`} className="rounded-lg border border-[#E8E8E3] bg-[#FAFAF8] p-3 transition hover:border-[#4F7D45]/35 hover:bg-[#EAF2E7]">
                    <div className="mb-2 flex items-start justify-between gap-2">
                      <p className="line-clamp-2 text-sm font-semibold text-[#1F1F1C]">{task.title}</p>
                      <ClipboardList className="h-3.5 w-3.5 shrink-0 text-[#4F7D45]" />
                    </div>
                    <p className="truncate text-xs text-[#8A8A85]">{task.client_name || "Paciente sem nome"}</p>
                    <p className="mt-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-[#B0B0AA]">
                      {task.due_date ? `Prazo ${formatDateSafe(task.due_date)}` : "Sem prazo definido"}
                    </p>
                  </Link>
                ))}
              </div>
            )}
          </PanelCard>
        </div>
      </details>

      <PanelCard className="p-4">
        <form onSubmit={handleSearch} className="dashboard-filter-form">
          <div>
            <label className="brand-label">Busca</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#B0B0AA]" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Nome, e-mail, telefone..."
                className="brand-input brand-input-with-icon"
              />
            </div>
          </div>

          <div>
            <label className="brand-label">Status</label>
            <select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
              className="brand-input"
            >
              <option value="">Todos</option>
              <option value="novo">Novo</option>
              <option value="em_andamento">Em andamento</option>
              <option value="finalizado">Finalizado</option>
              <option value="arquivado">Arquivado</option>
            </select>
          </div>

          <button type="submit" className="brand-btn-primary">
            Buscar
          </button>

          <div className="grid grid-cols-2 gap-2 sm:flex sm:justify-end">
            <a href={exportUrl("csv")} className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#FAFAF8] px-4 py-2 text-xs font-semibold text-[#6B6B65] transition-colors hover:bg-[#F1F1EE]">
              <Download className="h-3.5 w-3.5" />
              CSV
            </a>
            <a href={exportUrl("excel")} className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#EAF2E7] px-4 py-2 text-xs font-semibold text-[#4F7D45] transition-colors hover:bg-[#DCEBD6]">
              <FileSpreadsheet className="h-3.5 w-3.5" />
              Excel
            </a>
          </div>
        </form>
      </PanelCard>

      <PanelCard className="overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-[#E8E8E3] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs font-bold uppercase tracking-[0.06em] text-[#6B6B65]">Pré-consultas · Formulários recebidos</p>
          {data && (
            <span className="w-fit rounded-full border border-[#4F7D45]/25 px-3 py-1 text-xs font-semibold text-[#4F7D45]">
              {data.total} resultado{data.total !== 1 ? "s" : ""}
            </span>
          )}
        </div>

        <div className="md:hidden">
          {loading ? (
            <p className="py-12 text-center text-sm text-[#B0B0AA]">Carregando...</p>
          ) : data?.items.length === 0 ? (
            <p className="px-5 py-12 text-center text-sm text-[#B0B0AA]">Nenhum formulario encontrado.</p>
          ) : (
            <div className="divide-y divide-[#F1F1EE]">
              {data?.items.map((row) => (
                <Link key={row.id} href={`/dashboard/submissions/${row.id}`} className="block px-4 py-3.5 transition hover:bg-[#FAFAF8]">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="break-words text-sm font-semibold text-[#1F1F1C]">{row.patient_name}</p>
                      <p className="mt-1 text-xs text-[#8A8A85]">{row.patient_phone || row.patient_email || "Sem contato"}</p>
                    </div>
                    <BrandBadge status={row.status} />
                  </div>
                  <p className="mt-2.5 line-clamp-2 text-sm italic text-[#4F7D45]">{row.objetivo || "Objetivo nao informado"}</p>
                  <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-[#B0B0AA]">Recebido em {formatDateSafe(row.created_at)}</p>
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="hidden overflow-x-auto md:block">
          <table className="w-full text-left">
            <thead className="bg-[#FAFAF8]">
              <tr>
                {["Paciente", "Telefone", "Objetivo", "Status", "Data", ""].map((h) => (
                  <th key={h} className="px-4 py-3 text-[11px] font-bold uppercase tracking-[0.06em] text-[#6B6B65] text-left first:pl-5 last:pr-5 last:text-right">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F1F1EE]">
              {loading ? (
                <tr><td colSpan={6} className="py-12 text-center text-sm text-[#B0B0AA]">Carregando...</td></tr>
              ) : data?.items.length === 0 ? (
                <tr><td colSpan={6} className="py-12 text-center"><p className="text-sm text-[#B0B0AA]">Nenhum formulario encontrado.</p></td></tr>
              ) : (
                data?.items.map((row) => (
                  <tr key={row.id} className="transition-colors hover:bg-[#FAFAF8]">
                    <td className="px-5 py-3.5">
                      <p className="text-sm font-semibold text-[#1F1F1C]">{row.patient_name}</p>
                      {row.tipoAtendimento && (
                        <span className="mt-1 inline-block rounded-full bg-[#FAFAF8] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#6B6B65]">
                          {row.tipoAtendimento}
                        </span>
                      )}
                      {row.child_name && <p className="mt-0.5 text-xs text-[#B0B0AA]">Crianca: {row.child_name}</p>}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3.5 text-sm text-[#6B6B65]">{row.patient_phone || "-"}</td>
                    <td className="max-w-[220px] truncate px-4 py-3.5 text-sm italic text-[#4F7D45]">{row.objetivo || "-"}</td>
                    <td className="px-4 py-3.5"><BrandBadge status={row.status} /></td>
                    <td className="whitespace-nowrap px-4 py-3.5 text-xs text-[#B0B0AA]">{formatDateSafe(row.created_at)}</td>
                    <td className="space-x-2 whitespace-nowrap px-5 py-3.5 text-right">
                      <Link href={`/dashboard/submissions/${row.id}`} className="px-2 text-xs font-semibold text-[#4F7D45] transition-colors hover:text-[#3D6335]">Ver</Link>
                      <a href={`/dashboard/submissions/${row.id}/print`} target="_blank" className="rounded-full bg-[#FAFAF8] px-3 py-1.5 text-xs font-semibold text-[#6B6B65] transition-colors hover:bg-[#F1F1EE]">PDF</a>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {data && data.totalPages > 1 && (
          <div className="flex flex-col gap-3 border-t border-[#E8E8E3] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-xs text-[#B0B0AA]">Pagina {data.page} de {data.totalPages}</span>
            <div className="grid grid-cols-2 gap-2 sm:flex">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={data.page <= 1} className="rounded-lg border border-[#E8E8E3] px-4 py-2 text-xs text-[#6B6B65] transition-colors hover:bg-[#FAFAF8] disabled:cursor-not-allowed disabled:opacity-40 sm:py-1.5">Anterior</button>
              <button onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))} disabled={data.page >= data.totalPages} className="rounded-lg border border-[#E8E8E3] px-4 py-2 text-xs text-[#6B6B65] transition-colors hover:bg-[#FAFAF8] disabled:cursor-not-allowed disabled:opacity-40 sm:py-1.5">Proxima</button>
            </div>
          </div>
        )}
      </PanelCard>

      {(briefState || briefLoading) && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 px-4 py-6 backdrop-blur-sm">
          <section className="flex max-h-[calc(100dvh-2rem)] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-[#E8E8E3] bg-white shadow-[0_28px_90px_rgba(16,24,32,0.18)]">
            <div className="flex items-start justify-between gap-4 border-b border-[#E8E8E3] px-5 py-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.06em] text-[#6B6B65]">Briefing de consulta</p>
                <h2 className="mt-1 text-lg font-bold text-[#1F1F1C]">
                  {briefState?.status === "stale" ? "Briefing desatualizado" : briefState?.status === "failed" ? "Briefing indisponível" : "Briefing preparado"}
                </h2>
                {briefState?.generatedAt && <p className="mt-1 text-xs text-[#B0B0AA]">Gerado em {formatDateSafe(briefState.generatedAt, "dd/MM HH:mm")}</p>}
              </div>
              <button type="button" onClick={() => setBriefState(null)} className="rounded-lg border border-[#E8E8E3] px-3 py-1.5 text-xs font-semibold text-[#6B6B65] hover:bg-[#FAFAF8]">
                Fechar
              </button>
            </div>
            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
              {briefLoading ? (
                <p className="text-sm text-[#8A8A85]">Carregando briefing...</p>
              ) : !briefState?.brief ? (
                <p className="rounded-lg border border-[#E8E8E3] bg-[#FAFAF8] p-4 text-sm text-[#8A8A85]">
                  {briefState?.status === "failed" ? "Não foi possível preparar o briefing. A consulta pode ser aberta normalmente." : "Briefing ainda não disponível."}
                </p>
              ) : (
                <>
                  {briefState.brief.summary && (
                    <p className="rounded-lg border border-[#DCEBD6] bg-[#F5FAF3] p-4 text-sm leading-6 text-[#1F1F1C]">
                      {briefState.brief.summary.text}
                    </p>
                  )}
                  <div className="grid gap-3 sm:grid-cols-2">
                    {briefState.brief.facts.map((fact) => (
                      <div key={`${fact.label}-${fact.value}`} className="rounded-lg border border-[#E8E8E3] bg-[#FAFAF8] p-3">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#B5762F]">{fact.label}</p>
                        <p className="mt-1 text-sm font-semibold text-[#1F1F1C]">{fact.value}</p>
                      </div>
                    ))}
                  </div>
                  {briefState.brief.currentPlanSummary && <p className="text-sm text-[#8A8A85]">{briefState.brief.currentPlanSummary.text}</p>}
                  <BriefList title="Mudanças desde a última consulta" items={briefState.brief.changesSinceLastVisit.map((item) => item.description)} />
                  <BriefList title="Pontos de atenção" items={briefState.brief.attentionPoints.map((item) => item.description)} />
                  <BriefList title="Perguntas sugeridas" items={briefState.brief.suggestedQuestions.map((item) => item.question)} />
                  <BriefList title="Pendências" items={briefState.brief.pendingItems.map((item) => item.description)} />
                  <BriefList title="Dados faltantes" items={briefState.brief.dataGaps.map((item) => item.description)} />
                </>
              )}
            </div>
            <div className="flex flex-wrap justify-end gap-2 border-t border-[#E8E8E3] px-5 py-3">
              {briefState?.clientId && (
                <button type="button" onClick={() => void startConsultationFromBrief()} className="rounded-lg bg-[#4F7D45] px-4 py-2 text-xs font-semibold text-white hover:bg-[#3D6335]">
                  Iniciar consulta
                </button>
              )}
              <button type="button" onClick={() => void refreshBrief()} disabled={!briefState || briefRefreshing} className="rounded-lg border border-[#4F7D45]/30 px-4 py-2 text-xs font-semibold text-[#4F7D45] hover:bg-[#EAF2E7] disabled:opacity-60">
                {briefRefreshing ? "Atualizando..." : "Atualizar briefing"}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
