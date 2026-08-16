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
  LayoutList,
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
import { BrandMetricCard } from "@/components/brand/BrandMetricCard";

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

const appointmentStatusLabel: Record<string, string> = {
  agendada: "Agendada",
  confirmada: "Confirmada",
  realizada: "Realizada",
  cancelada: "Cancelada",
  remarcada: "Remarcada",
};

function PanelCard({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-[1.35rem] border border-[#EDE1D6] bg-[#FFFDFC] shadow-[0_18px_45px_rgba(58,48,40,0.055)] ${className}`}
    >
      {children}
    </section>
  );
}

function QuickAction({
  href,
  icon,
  title,
  description,
  tone = "sage",
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  description: string;
  tone?: "sage" | "rose" | "neutral";
}) {
  const toneClass =
    tone === "rose"
      ? "bg-[#F3E8E5] text-[#8C5F50]"
      : tone === "neutral"
        ? "bg-[#F5ECE4] text-[#75675E]"
        : "bg-[#EAF0E4] text-[#607A56]";

  return (
    <Link
      href={href}
      className="group flex min-h-[104px] items-start gap-4 rounded-2xl border border-[#EDE1D6] bg-[#FBF7F1] p-4 transition hover:border-[#7F9A74]/45 hover:bg-[#F5FAF0]"
    >
      <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${toneClass}`}>
        {icon}
      </span>
      <span className="min-w-0">
        <span className="flex items-center gap-2 text-sm font-semibold text-[#3A3028]">
          {title}
          <ArrowRight className="h-3.5 w-3.5 text-[#607A56] transition group-hover:translate-x-0.5" />
        </span>
        <span className="mt-1 block text-xs leading-5 text-[#75675E]">
          {description}
        </span>
      </span>
    </Link>
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
  if (type === "PATIENT_REQUEST_PENDING" || type === "SUBSTITUTION_REQUIRES_REVIEW") return <MessageIcon />;
  if (type === "AI_PROPOSAL_PENDING" || type === "AI_PROPOSAL_REVIEW") return <Sparkles className="h-4 w-4" />;
  if (type === "PAYMENT_OVERDUE") return <WalletCards className="h-4 w-4" />;
  if (type === "WORKFLOW_DUE") return <Clock className="h-4 w-4" />;
  return <CheckCircle2 className="h-4 w-4" />;
}

function MessageIcon() {
  return <ClipboardList className="h-4 w-4" />;
}

function ActionItemCard({ item, onOpenBrief }: { item: DashboardActionItem; onOpenBrief: (appointmentId: string) => void }) {
  const priorityTone = item.priority === "URGENT"
    ? "border-[#F2CDC7] bg-[#FFF5F3] text-[#8C5F50]"
    : item.priority === "HIGH"
      ? "border-[#EAD8C2] bg-[#FFF9F0] text-[#8C6E52]"
      : item.priority === "INFO"
        ? "border-[#D9E4D3] bg-[#F5FAF0] text-[#607A56]"
        : "border-[#EDE1D6] bg-[#FBF7F1] text-[#75675E]";
  const time = item.dueAt ?? item.occurredAt ?? item.createdAt;
  const openableBriefing = item.briefing && ["ready", "stale"].includes(item.briefing.status);
  const content = (
    <>
      <span className="flex min-w-0 gap-3">
        <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border ${priorityTone}`}>
          {iconForAction(item.type)}
        </span>
        <span className="min-w-0">
          <span className="flex flex-wrap items-center gap-2">
            <strong className="text-sm text-[#3A3028]">{item.title}</strong>
            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] ${priorityTone}`}>
              {PRIORITY_LABELS[item.priority]}
            </span>
          </span>
          <span className="mt-1 block text-sm font-medium text-[#5F554D]">{item.subject ?? "Sem paciente vinculado"}</span>
          <span className="mt-1 block text-xs leading-5 text-[#75675E]">{item.description}</span>
          <span className="mt-2 block text-[11px] font-semibold uppercase tracking-[0.1em] text-[#A9978A]">
            {time ? formatDateSafe(time, "dd/MM HH:mm") : item.source}
          </span>
        </span>
      </span>
      <span className="inline-flex min-h-10 items-center justify-center gap-2 rounded-full border border-[#7F9A74]/35 px-4 text-xs font-semibold text-[#607A56] transition group-hover:bg-[#EAF0E4] sm:self-center">
        {item.actionLabel}
        <ArrowRight className="h-3.5 w-3.5" />
      </span>
    </>
  );

  const className = "group grid w-full gap-3 rounded-2xl border border-[#EDE1D6] bg-[#FFFDFC] p-4 text-left transition hover:border-[#7F9A74]/45 hover:bg-[#F8FBF5] sm:grid-cols-[minmax(0,1fr)_auto]";
  const ariaLabel = `${item.title}${item.subject ? `, ${item.subject}` : ""}. ${item.actionLabel}`;

  if (openableBriefing) {
    return (
      <button
        type="button"
        onClick={() => onOpenBrief(item.briefing!.appointmentId)}
        className={className}
        aria-label={ariaLabel}
      >
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
    <section className="space-y-3">
      <div>
        <h3 className="font-serif text-xl font-semibold text-[#3A3028]">{ACTION_SECTION_LABELS[section]}</h3>
        <p className="text-xs leading-5 text-[#75675E]">{ACTION_SECTION_DESCRIPTIONS[section]}</p>
      </div>
      {items.length ? (
        <div className="grid gap-3">
          {items.map((item) => <ActionItemCard key={item.id} item={item} onOpenBrief={onOpenBrief} />)}
        </div>
      ) : (
        <div className="rounded-2xl border border-[#DDE9D5] bg-[#F5FAF0] p-4">
          <p className="text-sm font-semibold text-[#607A56]">
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
      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#607A56]">{title}</p>
      <ul className="mt-2 space-y-1 text-sm text-[#3A3028]">
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
  const color =
    tone === "rose" ? "bg-[#B47F6A]" : tone === "gold" ? "bg-[#C99A4D]" : "bg-[#7F9A74]";
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3 text-xs">
        <span className="font-semibold text-[#3A3028]">{label}</span>
        <span className="text-[#75675E]">{value}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-[#F1ECE7]">
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

  useEffect(() => {
    fetch("/api/admin/dashboard-metrics")
      .then((r) => r.json())
      .then((d: DashboardMetrics) => setDashMetrics(d))
      .catch(() => null);
  }, []);

  useEffect(() => {
    let active = true;
    async function loadActions() {
      try {
        const response = await fetch("/api/admin/dashboard/actions", { cache: "no-store" });
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
  }, []);

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
  const clinicalTotal = dashMetrics
    ? dashMetrics.consultasHoje +
      dashMetrics.proximasConsultas.length +
      dashMetrics.proximasTarefas.length +
      dashMetrics.oportunidades.total
    : 0;

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
    <div className="mx-auto max-w-7xl space-y-7 animate-fade-up">
      <section className="overflow-hidden rounded-[1.5rem] border border-[#EDE1D6] bg-[#FFFDFC] shadow-[0_18px_45px_rgba(58,48,40,0.055)]">
        <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="p-6 sm:p-7">
            <p className="brand-kicker mb-3">Painel clinico</p>
            <div className="flex max-w-3xl items-start gap-3">
              <h1 className="font-serif text-4xl font-semibold leading-tight text-[#3A3028] sm:text-5xl">
                Centro de trabalho da nutricao
              </h1>
              <HelpPopover topicKey="dashboard" />
            </div>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-[#75675E]">
              Acompanhe agenda, pacientes, pre-consultas, tarefas, financeiro e conteudo
              em uma visao unica para decidir o proximo passo com rapidez.
            </p>

            <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <QuickAction
                href="/dashboard/clients"
                icon={<Users className="h-5 w-5" />}
                title="Abrir paciente"
                description="Busque prontuario, antropometria, plano alimentar e evolucao."
              />
              <QuickAction
                href="/dashboard/agenda"
                icon={<Calendar className="h-5 w-5" />}
                title="Agenda clinica"
                description="Veja consultas, preparos, retornos e confirmacoes."
              />
              <QuickAction
                href="/dashboard/templates"
                icon={<LayoutList className="h-5 w-5" />}
                title="Modelos"
                description="Use templates para agilizar planos e protocolos."
                tone="neutral"
              />
              <QuickAction
                href="/dashboard/protocols"
                icon={<BookOpen className="h-5 w-5" />}
                title="Protocolos"
                description="Crie condutas padrao ou personalize por cliente."
                tone="rose"
              />
            </div>
          </div>

          <div className="border-t border-[#EDE1D6] bg-[#FBF7F1] p-6 lg:border-l lg:border-t-0">
            <p className="brand-kicker mb-3">Hoje</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-[#FFFDFC] p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#A9978A]">
                  Consultas
                </p>
                <p className="mt-2 font-serif text-3xl font-semibold text-[#607A56]">
                  {dashMetrics?.consultasHoje ?? "-"}
                </p>
              </div>
              <div className="rounded-2xl bg-[#FFFDFC] p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#A9978A]">
                  Prioridades
                </p>
                <p className="mt-2 font-serif text-3xl font-semibold text-[#8C5F50]">
                  {actionsLoading ? "-" : attentionCount}
                </p>
              </div>
            </div>
            <div className="mt-4 rounded-2xl border border-[#EDE1D6] bg-[#FFFDFC] p-4">
              <p className="text-sm font-semibold text-[#3A3028]">Resumo operacional</p>
              <p className="mt-2 text-xs leading-5 text-[#75675E]">
                {dashMetrics
                  ? `${clinicalTotal} itens entre agenda, tarefas e oportunidades exigem acompanhamento no sistema.`
                  : "Carregando indicadores do dia..."}
              </p>
            </div>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <BrandMetricCard
          label="Pre-consultas"
          value={metrics?.total ?? "-"}
          icon={<Users className="h-5 w-5" />}
        />
        <BrandMetricCard
          label="Novas"
          value={metrics?.novos ?? "-"}
          icon={<Sparkles className="h-5 w-5" />}
          accent
        />
        <BrandMetricCard
          label="Ultimos 7 dias"
          value={metrics?.ultimos7dias ?? "-"}
          icon={<Calendar className="h-5 w-5" />}
        />
        <BrandMetricCard
          label="Finalizadas"
          value={metrics?.finalizados ?? "-"}
          icon={<CheckCircle2 className="h-5 w-5" />}
        />
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <BrandMetricCard
          label="Clientes ativos"
          value={dashMetrics?.clientesAtivos ?? "-"}
          icon={<Users className="h-5 w-5" />}
        />
        <BrandMetricCard
          label="Planos ativos"
          value={dashMetrics?.protocolosAplicadosAtivos ?? "-"}
          icon={<Stethoscope className="h-5 w-5" />}
          accent={!!dashMetrics?.protocolosAplicadosAtivos}
        />
        <BrandMetricCard
          label="Protocolos"
          value={dashMetrics?.protocolosAtivos ?? "-"}
          icon={<BookOpen className="h-5 w-5" />}
        />
        <BrandMetricCard
          label="Tarefas vencidas"
          value={dashMetrics?.tarefasVencidas ?? "-"}
          icon={<AlertCircle className="h-5 w-5" />}
          accent={!!dashMetrics?.tarefasVencidas}
        />
        <BrandMetricCard
          label="Rascunhos IA"
          value={dashMetrics?.rascunhosPendentes ?? "-"}
          icon={<Sparkles className="h-5 w-5" />}
          accent={!!dashMetrics?.rascunhosPendentes}
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_390px]">
        <div className="space-y-5">
          <PanelCard className="p-5">
            <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="brand-kicker mb-2">Atenção operacional</p>
                <h2 className="font-serif text-2xl font-semibold text-[#3A3028]">
                  O que precisa de atencao agora
                </h2>
                {actionsData?.generatedAt && (
                  <p className="mt-1 text-xs text-[#A9978A]">
                    Atualizado em {formatDateSafe(actionsData.generatedAt, "HH:mm")}
                  </p>
                )}
              </div>
              <Link
                href="/dashboard/solicitacoes"
                className="inline-flex w-fit items-center gap-2 rounded-full border border-[#D9C4B2] px-4 py-2 text-xs font-semibold text-[#8C6E52] transition hover:bg-[#FBF7F1]"
              >
                <Zap className="h-4 w-4" />
                Ver inbox
              </Link>
            </div>
            {actionsLoading ? (
              <p className="rounded-2xl bg-[#FBF7F1] p-5 text-sm text-[#75675E]">
                Carregando ações...
              </p>
            ) : (
              <div className="grid gap-6">
                <ActionSection section="NOW" items={actionGroups.NOW} onOpenBrief={openBrief} />
                <ActionSection section="ATTENTION" items={actionGroups.ATTENTION} onOpenBrief={openBrief} />
                <ActionSection section="BUSINESS" items={actionGroups.BUSINESS} onOpenBrief={openBrief} />
                <ActionSection section="RECENT" items={actionGroups.RECENT} onOpenBrief={openBrief} />
              </div>
            )}
          </PanelCard>

          <PanelCard className="p-5">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <p className="brand-kicker mb-2">Agenda</p>
                <h2 className="font-serif text-2xl font-semibold text-[#3A3028]">
                  Proximos atendimentos
                </h2>
              </div>
              <Link
                href="/dashboard/agenda"
                className="shrink-0 rounded-full border border-[#7F9A74]/35 px-4 py-2 text-xs font-semibold text-[#607A56] transition hover:bg-[#EAF0E4]"
              >
                Abrir
              </Link>
            </div>

            {!dashMetrics ? (
              <p className="py-8 text-center text-sm text-[#A9978A]">Carregando agenda...</p>
            ) : dashMetrics.proximasConsultas.length === 0 ? (
              <p className="rounded-xl bg-[#FBF7F1] px-4 py-5 text-sm text-[#75675E]">
                Nenhum atendimento futuro cadastrado.
              </p>
            ) : (
              <div className="divide-y divide-[#F5ECE4]">
                {dashMetrics.proximasConsultas.map((appointment) => (
                  <div
                    key={appointment.id}
                    className="grid gap-3 py-4 sm:grid-cols-[84px_minmax(0,1fr)_120px]"
                  >
                    <div>
                      <p className="font-serif text-2xl font-semibold text-[#3A3028]">
                        {formatDateSafe(appointment.starts_at, "HH:mm")}
                      </p>
                      <p className="text-[11px] text-[#A9978A]">
                        {formatDateSafe(appointment.starts_at, "dd/MM")}
                      </p>
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-[#3A3028]">
                        {appointment.title}
                      </p>
                      <p className="mt-1 truncate text-xs text-[#75675E]">
                        {appointment.client_name || "Paciente sem vinculo"}
                      </p>
                      <p className="mt-1 text-[11px] uppercase tracking-[0.1em] text-[#A9978A]">
                        {appointment.appointment_type}
                      </p>
                    </div>
                    <span className="self-start rounded-full border border-[#EDE1D6] bg-[#FBF7F1] px-3 py-1 text-center text-[10px] font-semibold uppercase tracking-[0.12em] text-[#75675E]">
                      {appointmentStatusLabel[appointment.status] ?? appointment.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </PanelCard>
        </div>

        <aside className="space-y-5">
          <PanelCard className="p-5">
            <p className="brand-kicker mb-2">Jornada clinica</p>
            <h2 className="font-serif text-2xl font-semibold text-[#3A3028]">
              Saude do fluxo
            </h2>
            <div className="mt-5 space-y-4">
              <StageBar
                label="Oportunidades novas"
                value={dashMetrics?.oportunidades.novos ?? 0}
                total={dashMetrics?.oportunidades.total ?? 0}
                tone="sage"
              />
              <StageBar
                label="Oportunidades quentes"
                value={dashMetrics?.oportunidades.quentes ?? 0}
                total={dashMetrics?.oportunidades.total ?? 0}
                tone="rose"
              />
              <StageBar
                label="Convertidas"
                value={dashMetrics?.oportunidades.convertidas ?? 0}
                total={dashMetrics?.oportunidades.total ?? 0}
                tone="gold"
              />
            </div>
            <Link
              href="/dashboard/oportunidades"
              className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#7F9A74] px-5 py-3 text-xs font-bold uppercase tracking-[0.12em] text-white transition hover:bg-[#607A56]"
            >
              Abrir funil
              <ArrowRight className="h-4 w-4" />
            </Link>
          </PanelCard>

          <PanelCard className="p-5">
            <p className="brand-kicker mb-2">Financeiro</p>
            <h2 className="font-serif text-2xl font-semibold text-[#3A3028]">
              Receita e pendencias
            </h2>
            <div className="mt-5 grid gap-3">
              <div className="rounded-2xl bg-[#FBF7F1] p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#A9978A]">
                  Recebido no mes
                </p>
                <p className="mt-2 font-serif text-2xl font-semibold text-[#607A56]">
                  {dashMetrics ? formatMoney(dashMetrics.financeiro.receivedMonthCents) : "-"}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl bg-[#FBF7F1] p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#A9978A]">
                    Em aberto
                  </p>
                  <p className="mt-2 font-serif text-xl font-semibold text-[#8C5F50]">
                    {dashMetrics ? formatMoney(dashMetrics.financeiro.openCents) : "-"}
                  </p>
                </div>
                <div className="rounded-2xl bg-[#FBF7F1] p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#A9978A]">
                    Vencidos
                  </p>
                  <p className="mt-2 font-serif text-xl font-semibold text-[#8C5F50]">
                    {dashMetrics ? formatMoney(dashMetrics.financeiro.overdueCents) : "-"}
                  </p>
                </div>
              </div>
            </div>
            <Link
              href="/dashboard/financeiro"
              className="mt-3 inline-flex items-center gap-2 py-3 text-sm font-semibold text-[#607A56] hover:text-[#8C5F50]"
            >
              Gerenciar financeiro
              <ArrowRight className="h-4 w-4" />
            </Link>
          </PanelCard>

          <PanelCard className="p-5">
            <p className="brand-kicker mb-2">Autoridade</p>
            <h2 className="font-serif text-2xl font-semibold text-[#3A3028]">
              Conteudo e IA
            </h2>
            <div className="mt-5 grid grid-cols-3 gap-2">
              <div className="rounded-2xl bg-[#FBF7F1] p-3 text-center">
                <p className="font-serif text-2xl font-semibold text-[#607A56]">
                  {dashMetrics?.blog.published ?? "-"}
                </p>
                <p className="mt-1 text-[10px] uppercase tracking-[0.1em] text-[#75675E]">
                  Posts
                </p>
              </div>
              <div className="rounded-2xl bg-[#FBF7F1] p-3 text-center">
                <p className="font-serif text-2xl font-semibold text-[#8C5F50]">
                  {dashMetrics?.blog.drafts ?? "-"}
                </p>
                <p className="mt-1 text-[10px] uppercase tracking-[0.1em] text-[#75675E]">
                  Rascunhos
                </p>
              </div>
              <div className="rounded-2xl bg-[#FBF7F1] p-3 text-center">
                <p className="font-serif text-2xl font-semibold text-[#607A56]">
                  {dashMetrics?.blog.aiGenerated ?? "-"}
                </p>
                <p className="mt-1 text-[10px] uppercase tracking-[0.1em] text-[#75675E]">
                  IA
                </p>
              </div>
            </div>
            <Link
              href="/dashboard/blog"
              className="mt-3 inline-flex items-center gap-2 py-3 text-sm font-semibold text-[#607A56] hover:text-[#8C5F50]"
            >
              Revisar conteudo
              <ArrowRight className="h-4 w-4" />
            </Link>
          </PanelCard>
        </aside>
      </div>

      <PanelCard className="p-5">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <p className="brand-kicker mb-2">Tarefas</p>
            <h2 className="font-serif text-2xl font-semibold text-[#3A3028]">
              Proximas pendencias clinicas
            </h2>
          </div>
          <Link
            href="/dashboard/tarefas"
            className="rounded-full border border-[#7F9A74]/35 px-4 py-2 text-xs font-semibold text-[#607A56] transition hover:bg-[#EAF0E4]"
          >
            Abrir
          </Link>
        </div>

        {!dashMetrics ? (
          <p className="py-8 text-center text-sm text-[#A9978A]">Carregando tarefas...</p>
        ) : dashMetrics.proximasTarefas.length === 0 ? (
          <p className="rounded-xl bg-[#FBF7F1] px-4 py-5 text-sm text-[#75675E]">
            Nenhuma tarefa pendente no momento.
          </p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {dashMetrics.proximasTarefas.map((task) => (
              <Link
                key={task.id}
                href={`/dashboard/clients/${task.client_id}`}
                className="rounded-2xl border border-[#EDE1D6] bg-[#FBF7F1] p-4 transition hover:border-[#7F9A74]/40 hover:bg-[#EAF0E4]"
              >
                <div className="mb-3 flex items-start justify-between gap-3">
                  <p className="line-clamp-2 text-sm font-semibold text-[#3A3028]">
                    {task.title}
                  </p>
                  <ClipboardList className="h-4 w-4 shrink-0 text-[#607A56]" />
                </div>
                <p className="truncate text-xs text-[#75675E]">
                  {task.client_name || "Paciente sem nome"}
                </p>
                <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#A9978A]">
                  {task.due_date ? `Prazo ${formatDateSafe(task.due_date)}` : "Sem prazo definido"}
                </p>
              </Link>
            ))}
          </div>
        )}
      </PanelCard>

      <PanelCard className="p-5">
        <form onSubmit={handleSearch} className="dashboard-filter-form">
          <div>
            <label className="brand-label">Busca</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#A9978A]" />
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
            <a
              href={exportUrl("csv")}
              className="inline-flex items-center justify-center gap-1.5 rounded-full bg-[#F5ECE4] px-4 py-2 text-xs font-semibold text-[#75675E] transition-colors hover:bg-[#EDE1D6]"
            >
              <Download className="h-3.5 w-3.5" />
              CSV
            </a>
            <a
              href={exportUrl("excel")}
              className="inline-flex items-center justify-center gap-1.5 rounded-full bg-[#EAF0E4] px-4 py-2 text-xs font-semibold text-[#607A56] transition-colors hover:bg-[#DDE9D5]"
            >
              <FileSpreadsheet className="h-3.5 w-3.5" />
              Excel
            </a>
          </div>
        </form>
      </PanelCard>

      <PanelCard className="overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-[#EDE1D6] px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div>
            <p className="brand-kicker mb-1">Pre-consultas</p>
            <h2 className="font-serif text-xl font-semibold text-[#3A3028]">
              Formularios recebidos
            </h2>
          </div>
          {data && (
            <span className="w-fit rounded-full border border-[#7F9A74]/30 px-3 py-1 text-xs font-semibold text-[#607A56]">
              {data.total} resultado{data.total !== 1 ? "s" : ""}
            </span>
          )}
        </div>

        <div className="md:hidden">
          {loading ? (
            <p className="py-12 text-center text-sm text-[#A9978A]">Carregando...</p>
          ) : data?.items.length === 0 ? (
            <p className="px-5 py-12 text-center text-sm text-[#A9978A]">
              Nenhum formulario encontrado.
            </p>
          ) : (
            <div className="divide-y divide-[#F5ECE4]">
              {data?.items.map((row) => (
                <Link
                  key={row.id}
                  href={`/dashboard/submissions/${row.id}`}
                  className="block px-5 py-4 transition hover:bg-[#FBF7F1]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="break-words text-sm font-semibold text-[#3A3028]">
                        {row.patient_name}
                      </p>
                      <p className="mt-1 text-xs text-[#75675E]">
                        {row.patient_phone || row.patient_email || "Sem contato"}
                      </p>
                    </div>
                    <BrandBadge status={row.status} />
                  </div>
                  <p className="mt-3 line-clamp-2 text-sm italic text-[#607A56]">
                    {row.objetivo || "Objetivo nao informado"}
                  </p>
                  <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#A9978A]">
                    Recebido em {formatDateSafe(row.created_at)}
                  </p>
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="hidden overflow-x-auto md:block">
          <table className="w-full text-left">
            <thead className="bg-[#FBF7F1]">
              <tr>
                {["Paciente", "Telefone", "Objetivo", "Status", "Data", ""].map((h) => (
                  <th
                    key={h}
                    className="px-5 py-3.5 brand-kicker text-left first:pl-6 last:pr-6 last:text-right"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F5ECE4]">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-14 text-center text-sm text-[#A9978A]">
                    Carregando...
                  </td>
                </tr>
              ) : data?.items.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-14 text-center">
                    <p className="text-sm text-[#A9978A]">Nenhum formulario encontrado.</p>
                  </td>
                </tr>
              ) : (
                data?.items.map((row) => (
                  <tr key={row.id} className="transition-colors hover:bg-[#FBF7F1]/75">
                    <td className="px-6 py-4">
                      <p className="text-sm font-semibold text-[#3A3028]">{row.patient_name}</p>
                      {row.tipoAtendimento && (
                        <span className="mt-1 inline-block rounded-full bg-[#F5ECE4] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#75675E]">
                          {row.tipoAtendimento}
                        </span>
                      )}
                      {row.child_name && (
                        <p className="mt-0.5 text-xs text-[#A9978A]">
                          Crianca: {row.child_name}
                        </p>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-5 py-4 text-sm text-[#75675E]">
                      {row.patient_phone || "-"}
                    </td>
                    <td className="max-w-[220px] truncate px-5 py-4 text-sm italic text-[#607A56]">
                      {row.objetivo || "-"}
                    </td>
                    <td className="px-5 py-4">
                      <BrandBadge status={row.status} />
                    </td>
                    <td className="whitespace-nowrap px-5 py-4 text-xs text-[#A9978A]">
                      {formatDateSafe(row.created_at)}
                    </td>
                    <td className="space-x-2 whitespace-nowrap px-6 py-4 text-right">
                      <Link
                        href={`/dashboard/submissions/${row.id}`}
                        className="px-2 text-xs font-semibold text-[#607A56] transition-colors hover:text-[#8C5F50]"
                      >
                        Ver
                      </Link>
                      <a
                        href={`/dashboard/submissions/${row.id}/print`}
                        target="_blank"
                        className="rounded-full bg-[#F3E8E5] px-3 py-1.5 text-xs font-semibold text-[#8C5F50] transition-colors hover:bg-[#E8D6D0]"
                      >
                        PDF
                      </a>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {data && data.totalPages > 1 && (
          <div className="flex flex-col gap-3 border-t border-[#EDE1D6] px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <span className="text-xs text-[#A9978A]">
              Pagina {data.page} de {data.totalPages}
            </span>
            <div className="grid grid-cols-2 gap-2 sm:flex">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={data.page <= 1}
                className="rounded-full border border-[#EDE1D6] px-4 py-2 text-xs text-[#75675E] transition-colors hover:bg-[#FBF7F1] disabled:cursor-not-allowed disabled:opacity-40 sm:py-1.5"
              >
                Anterior
              </button>
              <button
                onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
                disabled={data.page >= data.totalPages}
                className="rounded-full border border-[#EDE1D6] px-4 py-2 text-xs text-[#75675E] transition-colors hover:bg-[#FBF7F1] disabled:cursor-not-allowed disabled:opacity-40 sm:py-1.5"
              >
                Proxima
              </button>
            </div>
          </div>
        )}
      </PanelCard>

      {(briefState || briefLoading) && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 px-4 py-6 backdrop-blur-sm">
          <section className="flex max-h-[calc(100dvh-2rem)] w-full max-w-3xl flex-col overflow-hidden rounded-[1.25rem] border border-[#EDE1D6] bg-[#FFFDFC] shadow-[0_28px_90px_rgba(58,48,40,0.24)]">
            <div className="flex items-start justify-between gap-4 border-b border-[#EDE1D6] px-5 py-4">
              <div>
                <p className="brand-kicker">Briefing de consulta</p>
                <h2 className="mt-1 font-serif text-2xl font-semibold text-[#3A3028]">
                  {briefState?.status === "stale" ? "Briefing desatualizado" : briefState?.status === "failed" ? "Briefing indisponível" : "Briefing preparado"}
                </h2>
                {briefState?.generatedAt && <p className="mt-1 text-xs text-[#A9978A]">Gerado em {formatDateSafe(briefState.generatedAt, "dd/MM HH:mm")}</p>}
              </div>
              <button type="button" onClick={() => setBriefState(null)} className="rounded-full border border-[#EDE1D6] px-3 py-1.5 text-xs font-semibold text-[#75675E] hover:bg-[#FBF7F1]">
                Fechar
              </button>
            </div>
            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
              {briefLoading ? (
                <p className="text-sm text-[#75675E]">Carregando briefing...</p>
              ) : !briefState?.brief ? (
                <p className="rounded-xl border border-[#EDE1D6] bg-[#FBF7F1] p-4 text-sm text-[#75675E]">
                  {briefState?.status === "failed" ? "Não foi possível preparar o briefing. A consulta pode ser aberta normalmente." : "Briefing ainda não disponível."}
                </p>
              ) : (
                <>
                  {briefState.brief.summary && (
                    <p className="rounded-xl border border-[#D9E4D3] bg-[#F4F8F1] p-4 text-sm leading-6 text-[#3A3028]">
                      {briefState.brief.summary.text}
                    </p>
                  )}
                  <div className="grid gap-3 sm:grid-cols-2">
                    {briefState.brief.facts.map((fact) => (
                      <div key={`${fact.label}-${fact.value}`} className="rounded-xl border border-[#EDE1D6] bg-[#FBF7F1] p-3">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#9A6F5E]">{fact.label}</p>
                        <p className="mt-1 text-sm font-semibold text-[#3A3028]">{fact.value}</p>
                      </div>
                    ))}
                  </div>
                  {briefState.brief.currentPlanSummary && <p className="text-sm text-[#75675E]">{briefState.brief.currentPlanSummary.text}</p>}
                  <BriefList title="Mudanças desde a última consulta" items={briefState.brief.changesSinceLastVisit.map((item) => item.description)} />
                  <BriefList title="Pontos de atenção" items={briefState.brief.attentionPoints.map((item) => item.description)} />
                  <BriefList title="Perguntas sugeridas" items={briefState.brief.suggestedQuestions.map((item) => item.question)} />
                  <BriefList title="Pendências" items={briefState.brief.pendingItems.map((item) => item.description)} />
                  <BriefList title="Dados faltantes" items={briefState.brief.dataGaps.map((item) => item.description)} />
                </>
              )}
            </div>
            <div className="flex flex-wrap justify-end gap-2 border-t border-[#EDE1D6] px-5 py-3">
              {briefState?.clientId && (
                <button type="button" onClick={() => void startConsultationFromBrief()} className="rounded-full bg-[#7F9A74] px-4 py-2 text-xs font-semibold text-white hover:bg-[#607A56]">
                  Iniciar consulta
                </button>
              )}
              <button type="button" onClick={() => void refreshBrief()} disabled={!briefState || briefRefreshing} className="rounded-full border border-[#7F9A74]/35 px-4 py-2 text-xs font-semibold text-[#607A56] hover:bg-[#EAF0E4] disabled:opacity-60">
                {briefRefreshing ? "Atualizando..." : "Atualizar briefing"}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
