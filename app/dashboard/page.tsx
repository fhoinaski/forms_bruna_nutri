"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Users,
  Calendar,
  CheckCircle2,
  Sparkles,
  Search,
  Download,
  FileSpreadsheet,
  BookOpen,
  AlertCircle,
  ClipboardList,
  Clock,
  WalletCards,
} from "lucide-react";
import { format, parseISO, isValid } from "date-fns";
import { BrandBadge } from "@/components/brand/BrandBadge";
import { BrandMetricCard } from "@/components/brand/BrandMetricCard";

function formatDateSafe(value: string, fmt = "dd/MM/yyyy"): string {
  try {
    const d = parseISO(value);
    return isValid(d) ? format(d, fmt) : "—";
  } catch {
    return "—";
  }
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
}

function formatMoney(cents: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(cents / 100);
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

  const metrics = data?.metrics;

  return (
    <div className="mx-auto max-w-7xl space-y-7 animate-fade-up">
      <section className="rounded-[1.5rem] border border-[#EDE1D6] bg-[#FFFDFC] p-6 shadow-[0_18px_45px_rgba(58,48,40,0.055)]">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="brand-kicker mb-3">Visão geral</p>
            <h1 className="font-serif text-4xl font-semibold leading-tight text-[#3A3028]">
              Acompanhamentos e pré-consultas
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-[#75675E]">
              Organize novas respostas, acompanhe clientes ativos e revise
              pendências clínicas com uma leitura rápida do dia.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/dashboard/agenda"
              className="inline-flex items-center gap-2 rounded-full border border-[#7F9A74]/35 px-5 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-[#607A56] transition hover:bg-[#EAF0E4]"
            >
              <Calendar className="h-4 w-4" />
              Agenda
            </Link>
            <Link
              href="/dashboard/financeiro"
              className="inline-flex items-center gap-2 rounded-full border border-[#7F9A74]/35 px-5 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-[#607A56] transition hover:bg-[#EAF0E4]"
            >
              <WalletCards className="h-4 w-4" />
              Financeiro
            </Link>
            <Link
              href="/dashboard/clients"
              className="inline-flex items-center gap-2 rounded-full border border-[#7F9A74]/35 px-5 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-[#607A56] transition hover:bg-[#EAF0E4]"
            >
              <Users className="h-4 w-4" />
              Clientes
            </Link>
            <Link
              href="/dashboard/protocols"
              className="inline-flex items-center gap-2 rounded-full bg-[#7F9A74] px-5 py-3 text-xs font-bold uppercase tracking-[0.12em] text-white shadow-[0_14px_30px_rgba(127,154,116,0.2)] transition hover:bg-[#607A56]"
            >
              <BookOpen className="h-4 w-4" />
              Protocolos
            </Link>
          </div>
        </div>
      </section>

      {/* Métricas de formulários */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <BrandMetricCard
          label="Total"
          value={metrics?.total ?? "—"}
          icon={<Users className="w-5 h-5" />}
        />
        <BrandMetricCard
          label="Novos"
          value={metrics?.novos ?? "—"}
          icon={<Sparkles className="w-5 h-5" />}
          accent
        />
        <BrandMetricCard
          label="Últimos 7 dias"
          value={metrics?.ultimos7dias ?? "—"}
          icon={<Calendar className="w-5 h-5" />}
        />
        <BrandMetricCard
          label="Finalizados"
          value={metrics?.finalizados ?? "—"}
          icon={<CheckCircle2 className="w-5 h-5" />}
        />
      </div>

      {/* Métricas do sistema clínico */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <BrandMetricCard
          label="Consultas hoje"
          value={dashMetrics?.consultasHoje ?? "—"}
          icon={<Calendar className="w-5 h-5" />}
          accent={!!dashMetrics?.consultasHoje}
        />
        <BrandMetricCard
          label="Clientes ativos"
          value={dashMetrics?.clientesAtivos ?? "—"}
          icon={<Users className="w-5 h-5" />}
        />
        <BrandMetricCard
          label="Protocolos ativos"
          value={dashMetrics?.protocolosAtivos ?? "—"}
          icon={<BookOpen className="w-5 h-5" />}
        />
        <BrandMetricCard
          label="Tarefas vencidas"
          value={dashMetrics?.tarefasVencidas ?? "—"}
          icon={<AlertCircle className="w-5 h-5" />}
          accent={!!dashMetrics?.tarefasVencidas}
        />
        <BrandMetricCard
          label="Rascunhos IA pendentes"
          value={dashMetrics?.rascunhosPendentes ?? "—"}
          icon={<Sparkles className="w-5 h-5" />}
          accent={!!dashMetrics?.rascunhosPendentes}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <BrandMetricCard
          label="Recebido no mes"
          value={
            dashMetrics ? formatMoney(dashMetrics.financeiro.receivedMonthCents) : "—"
          }
          icon={<WalletCards className="w-5 h-5" />}
          accent={!!dashMetrics?.financeiro.receivedMonthCents}
        />
        <BrandMetricCard
          label="Financeiro em aberto"
          value={dashMetrics ? formatMoney(dashMetrics.financeiro.openCents) : "—"}
          icon={<Clock className="w-5 h-5" />}
          accent={!!dashMetrics?.financeiro.openCents}
        />
        <BrandMetricCard
          label="Valores vencidos"
          value={dashMetrics ? formatMoney(dashMetrics.financeiro.overdueCents) : "—"}
          icon={<AlertCircle className="w-5 h-5" />}
          accent={!!dashMetrics?.financeiro.overdueCents}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="rounded-[1.35rem] border border-[#EDE1D6] bg-[#FFFDFC] p-5 shadow-[0_18px_45px_rgba(58,48,40,0.055)]">
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <p className="brand-kicker mb-2">Agenda</p>
              <h3 className="font-serif text-2xl font-semibold text-[#3A3028]">
                Proximos atendimentos
              </h3>
            </div>
            <Link
              href="/dashboard/agenda"
              className="rounded-full border border-[#7F9A74]/35 px-4 py-2 text-xs font-semibold text-[#607A56] transition hover:bg-[#EAF0E4]"
            >
              Abrir agenda
            </Link>
          </div>

          {!dashMetrics ? (
            <p className="py-8 text-center text-sm text-[#A9978A]">Carregando agenda...</p>
          ) : dashMetrics.proximasConsultas.length === 0 ? (
            <p className="rounded-xl bg-[#FBF7F1] px-4 py-5 text-sm text-[#75675E]">
              Nenhum atendimento futuro cadastrado. A agenda pode ser preenchida a
              partir do menu lateral.
            </p>
          ) : (
            <div className="divide-y divide-[#F5ECE4]">
              {dashMetrics.proximasConsultas.map((appointment) => (
                <div
                  key={appointment.id}
                  className="grid gap-3 py-4 sm:grid-cols-[76px_minmax(0,1fr)_110px]"
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
                  </div>
                  <span className="self-start rounded-full border border-[#EDE1D6] bg-[#FBF7F1] px-3 py-1 text-center text-[10px] font-semibold uppercase tracking-[0.12em] text-[#75675E]">
                    {appointment.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-[1.35rem] border border-[#EDE1D6] bg-[#FFFDFC] p-5 shadow-[0_18px_45px_rgba(58,48,40,0.055)]">
          <p className="brand-kicker mb-2">Fluxo clinico</p>
          <h3 className="font-serif text-2xl font-semibold text-[#3A3028]">
            Acoes rapidas
          </h3>
          <div className="mt-5 space-y-3">
            <Link
              href="/dashboard/agenda"
              className="flex items-center justify-between rounded-2xl border border-[#EDE1D6] bg-[#FBF7F1] px-4 py-3 text-sm font-semibold text-[#3A3028] transition hover:border-[#7F9A74]/40 hover:bg-[#EAF0E4]"
            >
              <span className="inline-flex items-center gap-2">
                <Clock className="h-4 w-4 text-[#607A56]" />
                Novo atendimento
              </span>
              <span className="text-[#607A56]">Abrir</span>
            </Link>
            <Link
              href="/dashboard/clients"
              className="flex items-center justify-between rounded-2xl border border-[#EDE1D6] bg-[#FBF7F1] px-4 py-3 text-sm font-semibold text-[#3A3028] transition hover:border-[#7F9A74]/40 hover:bg-[#EAF0E4]"
            >
              <span className="inline-flex items-center gap-2">
                <Users className="h-4 w-4 text-[#607A56]" />
                Acompanhar clientes
              </span>
              <span className="text-[#607A56]">Ver</span>
            </Link>
            <Link
              href="/dashboard/financeiro"
              className="flex items-center justify-between rounded-2xl border border-[#EDE1D6] bg-[#FBF7F1] px-4 py-3 text-sm font-semibold text-[#3A3028] transition hover:border-[#7F9A74]/40 hover:bg-[#EAF0E4]"
            >
              <span className="inline-flex items-center gap-2">
                <WalletCards className="h-4 w-4 text-[#607A56]" />
                Registrar cobranca
              </span>
              <span className="text-[#607A56]">Abrir</span>
            </Link>
            <Link
              href="/dashboard/protocols"
              className="flex items-center justify-between rounded-2xl border border-[#EDE1D6] bg-[#FBF7F1] px-4 py-3 text-sm font-semibold text-[#3A3028] transition hover:border-[#7F9A74]/40 hover:bg-[#EAF0E4]"
            >
              <span className="inline-flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-[#607A56]" />
                Protocolos alimentares
              </span>
              <span className="text-[#607A56]">Criar</span>
            </Link>
          </div>
        </div>
      </div>

      {/* Pendências de hoje */}
      {dashMetrics && (dashMetrics.tarefasVencidas > 0 || dashMetrics.rascunhosPendentes > 0) && (
        <div className="rounded-[1.35rem] border border-[#EDE1D6] bg-[#FFFDFC] p-5 shadow-[0_18px_45px_rgba(58,48,40,0.055)]">
          <h3 className="font-serif font-semibold text-[#3A3028] mb-3 flex items-center gap-2">
            <ClipboardList className="w-4 h-4" />
            Pendências
          </h3>
          <div className="space-y-2">
            {dashMetrics.tarefasVencidas > 0 && (
              <div className="flex items-center justify-between p-3 bg-[#FFF5F3] border border-[#F2CDC7] rounded-xl">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-red-500" />
                  <span className="text-sm text-red-800">
                    <strong>{dashMetrics.tarefasVencidas}</strong> tarefa{dashMetrics.tarefasVencidas !== 1 ? "s" : ""} com prazo vencido
                  </span>
                </div>
                <Link href="/dashboard/clients" className="text-xs font-medium text-[#8C5F50] hover:underline">
                  Ver clientes →
                </Link>
              </div>
            )}
            {dashMetrics.rascunhosPendentes > 0 && (
              <div className="flex items-center justify-between p-3 bg-[#FFF8E8] border border-[#F3DFA8] rounded-xl">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-amber-500" />
                  <span className="text-sm text-amber-800">
                    <strong>{dashMetrics.rascunhosPendentes}</strong> rascunho{dashMetrics.rascunhosPendentes !== 1 ? "s" : ""} IA aguardando revisão
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Filtros */}
      <div className="rounded-[1.35rem] border border-[#EDE1D6] bg-[#FFFDFC] p-5 shadow-[0_18px_45px_rgba(58,48,40,0.055)]">
        <form onSubmit={handleSearch} className="flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-[180px]">
            <label className="brand-label">Busca</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#A9978A]" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Nome, e-mail, telefone..."
                className="brand-input pl-9"
              />
            </div>
          </div>

          <div className="min-w-[160px]">
            <label className="brand-label">Status</label>
            <select
              value={status}
              onChange={(e) => { setStatus(e.target.value); setPage(1); }}
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

          <div className="flex gap-2 ml-auto">
            <a
              href={exportUrl("csv")}
              className="flex items-center gap-1.5 px-4 py-2 bg-[#F5ECE4] text-[#75675E] rounded-full text-xs font-semibold hover:bg-[#EDE1D6] transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              CSV
            </a>
            <a
              href={exportUrl("excel")}
              className="flex items-center gap-1.5 px-4 py-2 bg-[#EAF0E4] text-[#607A56] rounded-full text-xs font-semibold hover:bg-[#DDE9D5] transition-colors"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              Excel
            </a>
          </div>
        </form>
      </div>

      {/* Tabela */}
      <div className="overflow-hidden rounded-[1.35rem] border border-[#EDE1D6] bg-[#FFFDFC] shadow-[0_18px_45px_rgba(58,48,40,0.055)]">
        <div className="px-6 py-4 border-b border-[#EDE1D6] flex justify-between items-center">
          <h4 className="font-serif text-xl font-semibold text-[#3A3028]">Formulários recebidos</h4>
          {data && (
            <span className="text-xs text-[#607A56] font-semibold border border-[#7F9A74]/30 px-3 py-1 rounded-full">
              {data.total} resultado{data.total !== 1 ? "s" : ""}
            </span>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-[#FBF7F1]">
              <tr>
                {["Paciente", "Telefone", "Objetivo", "Status", "Data", ""].map(
                  (h) => (
                    <th
                      key={h}
                      className="px-5 py-3.5 brand-kicker text-left first:pl-6 last:pr-6 last:text-right"
                    >
                      {h}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F5ECE4]">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-14 text-center text-[#A9978A] text-sm">
                    Carregando...
                  </td>
                </tr>
              ) : data?.items.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-14 text-center">
                    <p className="text-[#A9978A] text-sm">Nenhum formulário encontrado.</p>
                  </td>
                </tr>
              ) : (
                data?.items.map((row) => (
                  <tr key={row.id} className="hover:bg-[#FBF7F1]/75 transition-colors">
                    <td className="px-6 py-4">
                      <p className="font-semibold text-[#3A3028] text-sm">{row.patient_name}</p>
                      {row.tipoAtendimento && (
                        <span className="mt-1 inline-block text-[10px] font-semibold px-2 py-0.5 bg-[#F5ECE4] text-[#75675E] rounded-full uppercase tracking-wide">
                          {row.tipoAtendimento}
                        </span>
                      )}
                      {row.child_name && (
                        <p className="text-xs text-[#A9978A] mt-0.5">
                          Criança: {row.child_name}
                        </p>
                      )}
                    </td>
                    <td className="px-5 py-4 text-sm text-[#75675E] whitespace-nowrap">
                      {row.patient_phone || "—"}
                    </td>
                    <td className="px-5 py-4 text-sm italic text-[#607A56] max-w-[200px] truncate">
                      {row.objetivo || "—"}
                    </td>
                    <td className="px-5 py-4">
                      <BrandBadge status={row.status} />
                    </td>
                    <td className="px-5 py-4 text-xs text-[#A9978A] whitespace-nowrap">
                      {formatDateSafe(row.created_at)}
                    </td>
                    <td className="px-6 py-4 text-right space-x-2 whitespace-nowrap">
                      <Link
                        href={`/dashboard/submissions/${row.id}`}
                        className="text-xs font-semibold text-[#607A56] hover:text-[#8C5F50] transition-colors px-2"
                      >
                        Ver
                      </Link>
                      <a
                        href={`/dashboard/submissions/${row.id}/print`}
                        target="_blank"
                        className="text-xs font-semibold bg-[#F3E8E5] text-[#8C5F50] px-3 py-1.5 rounded-full hover:bg-[#E8D6D0] transition-colors"
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

        {/* Paginação */}
        {data && data.totalPages > 1 && (
          <div className="px-6 py-4 border-t border-[#EDE1D6] flex items-center justify-between">
            <span className="text-xs text-[#A9978A]">
              Página {data.page} de {data.totalPages}
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={data.page <= 1}
                className="px-4 py-1.5 text-xs border border-[#EDE1D6] rounded-full text-[#75675E] hover:bg-[#FBF7F1] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Anterior
              </button>
              <button
                onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
                disabled={data.page >= data.totalPages}
                className="px-4 py-1.5 text-xs border border-[#EDE1D6] rounded-full text-[#75675E] hover:bg-[#FBF7F1] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Próxima
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
