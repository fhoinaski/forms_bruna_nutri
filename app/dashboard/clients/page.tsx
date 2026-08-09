"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Mail,
  Phone,
  Search,
  ShieldCheck,
  UserCheck,
  UserPlus,
  Users,
} from "lucide-react";
import { format, isValid, parseISO } from "date-fns";
import { BrandMetricCard } from "@/components/brand/BrandMetricCard";

interface Client {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  status: string;
  created_at: string;
}

interface Metrics {
  total: number;
  ativos: number;
  novosMes: number;
}

interface ApiResponse {
  items: Client[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  metrics: Metrics;
}

const STATUS_BADGE: Record<string, string> = {
  ativo:
    "inline-flex items-center rounded-full border border-[#D9E4D3] bg-[#EAF0E4] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-[#607A56]",
  inativo:
    "inline-flex items-center rounded-full border border-[#F3DFA8] bg-[#FFF8E8] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-[#9A6B20]",
  arquivado:
    "inline-flex items-center rounded-full border border-[#EDE1D6] bg-[#F1ECE7] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-[#75675E]",
};

const STATUS_LABEL: Record<string, string> = {
  ativo: "Ativo",
  inativo: "Inativo",
  arquivado: "Arquivado",
};

const STATUS_HELP: Record<string, string> = {
  ativo: "Em acompanhamento",
  inativo: "Sem plano ativo",
  arquivado: "Histórico preservado",
};

function ClientStatusBadge({ status }: { status: string }) {
  return (
    <span className={STATUS_BADGE[status] ?? STATUS_BADGE.arquivado}>
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

function formatDateSafe(value: string): string {
  try {
    const d = parseISO(value);
    return isValid(d) ? format(d, "dd/MM/yyyy") : "-";
  } catch {
    return "-";
  }
}

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function ContactLine({
  icon,
  value,
  fallback,
}: {
  icon: React.ReactNode;
  value: string | null;
  fallback: string;
}) {
  return (
    <span className="flex min-w-0 items-center gap-2 text-sm text-[#75675E]">
      <span className="text-[#A9978A]">{icon}</span>
      <span className="min-w-0 break-all">{value || fallback}</span>
    </span>
  );
}

function ClientCard({ client }: { client: Client }) {
  return (
    <Link
      href={`/dashboard/clients/${client.id}`}
      className="block rounded-[1.25rem] border border-[#EDE1D6] bg-[#FFFDFC] p-4 shadow-[0_14px_32px_rgba(58,48,40,0.045)] transition hover:border-[#7F9A74]/45 hover:bg-[#FBF7F1]"
    >
      <div className="flex items-start gap-3">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#EAF0E4] font-serif text-lg font-semibold text-[#607A56]">
          {getInitials(client.name) || "P"}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-start justify-between gap-2">
            <span className="min-w-0">
              <span className="block break-words text-base font-semibold leading-5 text-[#3A3028]">
                {client.name}
              </span>
              <span className="mt-1 block text-xs text-[#A9978A]">
                Paciente desde {formatDateSafe(client.created_at)}
              </span>
            </span>
            <ClientStatusBadge status={client.status} />
          </span>
          <span className="mt-3 grid gap-2">
            <ContactLine
              icon={<Phone className="h-4 w-4" />}
              value={client.phone}
              fallback="Sem telefone"
            />
            <ContactLine
              icon={<Mail className="h-4 w-4" />}
              value={client.email}
              fallback="Sem e-mail"
            />
          </span>
        </span>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2">
        <span className="rounded-xl bg-[#FBF7F1] px-3 py-2 text-center text-[11px] font-semibold text-[#607A56]">
          Prontuário
        </span>
        <span className="rounded-xl bg-[#FBF7F1] px-3 py-2 text-center text-[11px] font-semibold text-[#75675E]">
          Plano
        </span>
        <span className="rounded-xl bg-[#FBF7F1] px-3 py-2 text-center text-[11px] font-semibold text-[#8C5F50]">
          Portal
        </span>
      </div>
    </Link>
  );
}

export default function ClientsPage() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [searchTrigger, setSearchTrigger] = useState(0);

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
        const res = await fetch(`/api/admin/clients?${params}`, {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error("Erro ao buscar clientes");
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
  const inactiveCount = useMemo(() => {
    if (!metrics) return "-";
    return Math.max(0, metrics.total - metrics.ativos);
  }, [metrics]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (page !== 1) setPage(1);
    else setSearchTrigger((k) => k + 1);
  };

  const clearFilters = () => {
    setSearch("");
    setStatus("");
    setPage(1);
    setSearchTrigger((k) => k + 1);
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6 animate-fade-up">
      <section className="overflow-hidden rounded-[1.5rem] border border-[#EDE1D6] bg-[#FFFDFC] shadow-[0_18px_45px_rgba(58,48,40,0.055)]">
        <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_330px]">
          <div className="p-6 sm:p-7">
            <p className="brand-kicker mb-3">Pacientes</p>
            <h1 className="font-serif text-4xl font-semibold leading-tight text-[#3A3028] sm:text-5xl">
              Gestão clínica de pacientes
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-[#75675E]">
              Encontre prontuários, acompanhe status, abra planos alimentares e
              mantenha o histórico clínico organizado para cada atendimento.
            </p>
            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              <Link
                href="/dashboard/oportunidades"
                className="group rounded-2xl border border-[#EDE1D6] bg-[#FBF7F1] p-4 transition hover:border-[#7F9A74]/45 hover:bg-[#F5FAF0]"
              >
                <UserPlus className="h-5 w-5 text-[#607A56]" />
                <span className="mt-3 flex items-center gap-2 text-sm font-semibold text-[#3A3028]">
                  Converter pré-consulta
                  <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
                </span>
                <span className="mt-1 block text-xs leading-5 text-[#75675E]">
                  Transforme oportunidades em clientes com contexto.
                </span>
              </Link>
              <Link
                href="/dashboard/agenda"
                className="group rounded-2xl border border-[#EDE1D6] bg-[#FBF7F1] p-4 transition hover:border-[#7F9A74]/45 hover:bg-[#F5FAF0]"
              >
                <CalendarDays className="h-5 w-5 text-[#607A56]" />
                <span className="mt-3 flex items-center gap-2 text-sm font-semibold text-[#3A3028]">
                  Agendar retorno
                  <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
                </span>
                <span className="mt-1 block text-xs leading-5 text-[#75675E]">
                  Organize consultas, preparos e acompanhamentos.
                </span>
              </Link>
              <Link
                href="/dashboard/protocols"
                className="group rounded-2xl border border-[#EDE1D6] bg-[#FBF7F1] p-4 transition hover:border-[#7F9A74]/45 hover:bg-[#F5FAF0]"
              >
                <ShieldCheck className="h-5 w-5 text-[#8C5F50]" />
                <span className="mt-3 flex items-center gap-2 text-sm font-semibold text-[#3A3028]">
                  Protocolos
                  <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
                </span>
                <span className="mt-1 block text-xs leading-5 text-[#75675E]">
                  Reaproveite modelos e personalize por paciente.
                </span>
              </Link>
            </div>
          </div>

          <aside className="border-t border-[#EDE1D6] bg-[#FBF7F1] p-6 lg:border-l lg:border-t-0">
            <p className="brand-kicker mb-3">Resumo da carteira</p>
            <div className="space-y-3">
              <div className="rounded-2xl bg-[#FFFDFC] p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#A9978A]">
                  Total cadastrado
                </p>
                <p className="mt-2 font-serif text-3xl font-semibold text-[#607A56]">
                  {metrics?.total ?? "-"}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl bg-[#FFFDFC] p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#A9978A]">
                    Ativos
                  </p>
                  <p className="mt-2 font-serif text-2xl font-semibold text-[#607A56]">
                    {metrics?.ativos ?? "-"}
                  </p>
                </div>
                <div className="rounded-2xl bg-[#FFFDFC] p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#A9978A]">
                    Pausados
                  </p>
                  <p className="mt-2 font-serif text-2xl font-semibold text-[#8C5F50]">
                    {inactiveCount}
                  </p>
                </div>
              </div>
              <p className="rounded-2xl border border-[#EDE1D6] bg-[#FFFDFC] p-4 text-xs leading-5 text-[#75675E]">
                Use a busca global no topo do sistema para abrir qualquer paciente
                rapidamente durante a consulta.
              </p>
            </div>
          </aside>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <BrandMetricCard
          label="Total"
          value={metrics?.total ?? "-"}
          icon={<Users className="h-5 w-5" />}
        />
        <BrandMetricCard
          label="Ativos"
          value={metrics?.ativos ?? "-"}
          icon={<UserCheck className="h-5 w-5" />}
        />
        <BrandMetricCard
          label="Novos no mês"
          value={metrics?.novosMes ?? "-"}
          icon={<UserPlus className="h-5 w-5" />}
          accent
        />
      </div>

      <section className="rounded-[1.35rem] border border-[#EDE1D6] bg-[#FFFDFC] p-5 shadow-[0_18px_45px_rgba(58,48,40,0.055)]">
        <form onSubmit={handleSearch} className="dashboard-filter-form">
          <div>
            <label className="brand-label">Busca</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#A9978A]" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Nome, e-mail ou telefone..."
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
              <option value="ativo">Ativo</option>
              <option value="inativo">Inativo</option>
              <option value="arquivado">Arquivado</option>
            </select>
          </div>

          <button type="submit" className="brand-btn-primary">
            Buscar
          </button>
          {(search || status) && (
            <button
              type="button"
              onClick={clearFilters}
              className="inline-flex min-h-11 items-center justify-center rounded-full border border-[#EDE1D6] px-5 text-xs font-semibold uppercase tracking-[0.12em] text-[#75675E] transition hover:bg-[#FBF7F1]"
            >
              Limpar
            </button>
          )}
        </form>
      </section>

      <section className="overflow-hidden rounded-[1.35rem] border border-[#EDE1D6] bg-[#FFFDFC] shadow-[0_18px_45px_rgba(58,48,40,0.055)]">
        <div className="flex flex-col gap-3 border-b border-[#EDE1D6] px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div>
            <p className="brand-kicker mb-1">Carteira de pacientes</p>
            <h2 className="font-serif text-xl font-semibold text-[#3A3028]">
              Pacientes cadastrados
            </h2>
          </div>
          {data && (
            <span className="w-fit rounded-full border border-[#7F9A74]/30 px-3 py-1 text-xs font-semibold text-[#607A56]">
              {data.total} cliente{data.total !== 1 ? "s" : ""}
            </span>
          )}
        </div>

        <div className="bg-[#FBF7F1] px-5 py-3 text-xs leading-5 text-[#75675E] sm:px-6">
          Abra um paciente para acessar resumo, anamnese, antropometria, plano
          alimentar, evolução, portal e financeiro.
        </div>

        <div className="grid gap-3 bg-[#FBF7F1] p-4 md:hidden">
          {loading ? (
            <div className="rounded-2xl bg-[#FFFDFC] py-12 text-center text-sm text-[#A9978A]">
              Carregando pacientes...
            </div>
          ) : data?.items.length === 0 ? (
            <div className="rounded-2xl bg-[#FFFDFC] px-4 py-12 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#EAF0E4]">
                <Users className="h-6 w-6 text-[#607A56]" />
              </div>
              <p className="mt-3 text-sm font-semibold text-[#3A3028]">
                Nenhum cliente cadastrado.
              </p>
              <p className="mt-1 text-xs text-[#75675E]">
                Converta uma pré-consulta em cliente para começar.
              </p>
            </div>
          ) : (
            data?.items.map((client) => <ClientCard key={client.id} client={client} />)
          )}
        </div>

        <div className="hidden overflow-x-auto md:block">
          <table className="w-full text-left">
            <thead className="bg-[#FBF7F1]">
              <tr>
                {["Paciente", "Contato", "Status", "Cadastrado", "Fluxo", ""].map((h) => (
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
                    Carregando pacientes...
                  </td>
                </tr>
              ) : data?.items.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-14 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#EAF0E4]">
                        <Users className="h-6 w-6 text-[#607A56]" />
                      </div>
                      <p className="text-sm font-semibold text-[#3A3028]">
                        Nenhum cliente cadastrado.
                      </p>
                      <p className="text-xs text-[#75675E]">
                        Converta uma pré-consulta em cliente para começar.
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                data?.items.map((row) => (
                  <tr key={row.id} className="transition-colors hover:bg-[#FBF7F1]/75">
                    <td className="px-6 py-4">
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#EAF0E4] font-serif text-base font-semibold text-[#607A56]">
                          {getInitials(row.name) || "P"}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-[#3A3028]">
                            {row.name}
                          </p>
                          <p className="mt-1 text-xs text-[#A9978A]">
                            Paciente desde {formatDateSafe(row.created_at)}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <div className="grid max-w-[260px] gap-1">
                        <ContactLine
                          icon={<Phone className="h-4 w-4" />}
                          value={row.phone}
                          fallback="Sem telefone"
                        />
                        <ContactLine
                          icon={<Mail className="h-4 w-4" />}
                          value={row.email}
                          fallback="Sem e-mail"
                        />
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <ClientStatusBadge status={row.status} />
                      <p className="mt-1 text-[11px] text-[#A9978A]">
                        {STATUS_HELP[row.status] ?? "Status cadastrado"}
                      </p>
                    </td>
                    <td className="whitespace-nowrap px-5 py-4 text-xs text-[#A9978A]">
                      {formatDateSafe(row.created_at)}
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex flex-wrap gap-1.5">
                        <span className="inline-flex items-center gap-1 rounded-full bg-[#EAF0E4] px-2.5 py-1 text-[10px] font-semibold text-[#607A56]">
                          <ClipboardList className="h-3 w-3" />
                          Prontuário
                        </span>
                        <span className="inline-flex items-center gap-1 rounded-full bg-[#F5ECE4] px-2.5 py-1 text-[10px] font-semibold text-[#75675E]">
                          <CheckCircle2 className="h-3 w-3" />
                          Plano
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <Link
                        href={`/dashboard/clients/${row.id}`}
                        className="inline-flex items-center gap-1 rounded-full border border-[#7F9A74]/30 px-3 py-1.5 text-xs font-semibold text-[#607A56] transition hover:border-[#8C5F50]/30 hover:text-[#8C5F50]"
                      >
                        Abrir
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
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
              Página {data.page} de {data.totalPages}
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
                Próxima
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
