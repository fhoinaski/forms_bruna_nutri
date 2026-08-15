"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
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
  HelpCircle,
  LayoutList,
  Newspaper,
  Search,
  Sparkles,
  Stethoscope,
  Users,
  WalletCards,
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

function PriorityItem({
  icon,
  title,
  description,
  href,
  action,
  urgent = false,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  href: string;
  action: string;
  urgent?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`flex items-center justify-between gap-4 rounded-2xl border p-4 transition ${
        urgent
          ? "border-[#F2CDC7] bg-[#FFF5F3] hover:bg-[#FFF0ED]"
          : "border-[#EDE1D6] bg-[#FBF7F1] hover:bg-[#F5FAF0]"
      }`}
    >
      <span className="flex min-w-0 items-start gap-3">
        <span
          className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
            urgent ? "bg-[#F3E8E5] text-[#8C5F50]" : "bg-[#EAF0E4] text-[#607A56]"
          }`}
        >
          {icon}
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-[#3A3028]">{title}</span>
          <span className="mt-1 block text-xs leading-5 text-[#75675E]">{description}</span>
        </span>
      </span>
      <span className="shrink-0 rounded-full border border-[#7F9A74]/30 px-3 py-1.5 text-[11px] font-semibold text-[#607A56]">
        {action}
      </span>
    </Link>
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
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [searchTrigger, setSearchTrigger] = useState(0);
  const [dashMetrics, setDashMetrics] = useState<DashboardMetrics | null>(null);

  useEffect(() => {
    fetch("/api/admin/dashboard-metrics")
      .then((r) => r.json())
      .then((d: DashboardMetrics) => setDashMetrics(d))
      .catch(() => null);
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

  const priorityItems = useMemo(() => {
    if (!dashMetrics) return [];
    return [
      {
        show: dashMetrics.consultasHoje > 0,
        urgent: false,
        icon: <Calendar className="h-4 w-4" />,
        title: `${dashMetrics.consultasHoje} consulta${dashMetrics.consultasHoje !== 1 ? "s" : ""} hoje`,
        description: "Revise prontuarios, objetivos e pendencias antes do atendimento.",
        href: "/dashboard/agenda",
        action: "Agenda",
      },
      {
        show: dashMetrics.tarefasVencidas > 0,
        urgent: true,
        icon: <AlertCircle className="h-4 w-4" />,
        title: `${dashMetrics.tarefasVencidas} tarefa${dashMetrics.tarefasVencidas !== 1 ? "s" : ""} vencida${dashMetrics.tarefasVencidas !== 1 ? "s" : ""}`,
        description: "Priorize retornos clinicos, ajustes de conduta e combinados com pacientes.",
        href: "/dashboard/tarefas",
        action: "Resolver",
      },
      {
        show: dashMetrics.oportunidades.atrasadas > 0,
        urgent: true,
        icon: <HeartHandshake className="h-4 w-4" />,
        title: `${dashMetrics.oportunidades.atrasadas} follow-up${dashMetrics.oportunidades.atrasadas !== 1 ? "s" : ""} atrasado${dashMetrics.oportunidades.atrasadas !== 1 ? "s" : ""}`,
        description: "Conduza oportunidades sem perder acolhimento e contexto da pre-consulta.",
        href: "/dashboard/oportunidades",
        action: "Funil",
      },
      {
        show: dashMetrics.rascunhosPendentes > 0,
        urgent: false,
        icon: <Sparkles className="h-4 w-4" />,
        title: `${dashMetrics.rascunhosPendentes} rascunho${dashMetrics.rascunhosPendentes !== 1 ? "s" : ""} IA pendente${dashMetrics.rascunhosPendentes !== 1 ? "s" : ""}`,
        description: "Revise antes de transformar em protocolo ou plano para cliente.",
        href: "/dashboard/protocols",
        action: "Revisar",
      },
    ].filter((item) => item.show);
  }, [dashMetrics]);

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
                  {dashMetrics ? priorityItems.length : "-"}
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
                <p className="brand-kicker mb-2">Prioridades</p>
                <h2 className="font-serif text-2xl font-semibold text-[#3A3028]">
                  O que precisa de atencao agora
                </h2>
              </div>
              <Link
                href="/dashboard/ajuda"
                className="inline-flex w-fit items-center gap-2 rounded-full border border-[#D9C4B2] px-4 py-2 text-xs font-semibold text-[#8C6E52] transition hover:bg-[#FBF7F1]"
              >
                <HelpCircle className="h-4 w-4" />
                Ajuda
              </Link>
            </div>
            {!dashMetrics ? (
              <p className="rounded-2xl bg-[#FBF7F1] p-5 text-sm text-[#75675E]">
                Carregando prioridades...
              </p>
            ) : priorityItems.length === 0 ? (
              <div className="rounded-2xl border border-[#DDE9D5] bg-[#F5FAF0] p-5">
                <p className="text-sm font-semibold text-[#607A56]">
                  Nenhuma prioridade critica no momento.
                </p>
                <p className="mt-1 text-xs leading-5 text-[#75675E]">
                  Use os atalhos para revisar agenda, clientes e conteudos planejados.
                </p>
              </div>
            ) : (
              <div className="grid gap-3">
                {priorityItems.map((item) => (
                  <PriorityItem key={item.title} {...item} />
                ))}
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
    </div>
  );
}
