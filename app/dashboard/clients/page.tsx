"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CalendarDays, Mail, Phone, Search, UserCheck, UserPlus, Users } from "lucide-react";
import { format, parseISO, isValid } from "date-fns";
import { BrandBadge } from "@/components/brand/BrandBadge";
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
  ativo: "brand-badge brand-badge-finalizado",
  inativo: "brand-badge brand-badge-andamento",
  arquivado: "brand-badge brand-badge-arquivado",
};
const STATUS_LABEL: Record<string, string> = {
  ativo: "Ativo",
  inativo: "Inativo",
  arquivado: "Arquivado",
};

function ClientStatusBadge({ status }: { status: string }) {
  return (
    <span className={STATUS_BADGE[status] ?? "brand-badge brand-badge-arquivado"}>
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

function formatDateSafe(value: string): string {
  try {
    const d = parseISO(value);
    return isValid(d) ? format(d, "dd/MM/yyyy") : "—";
  } catch {
    return "—";
  }
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

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (page !== 1) setPage(1);
    else setSearchTrigger((k) => k + 1);
  };

  const metrics = data?.metrics;

  return (
    <div className="mx-auto max-w-6xl space-y-6 animate-fade-up">
      {/* Header */}
      <div>
        <p className="brand-kicker mb-1">CRM</p>
        <h1 className="font-serif text-2xl font-semibold text-[#3A2B1F]">Clientes</h1>
        <p className="text-sm text-[#A8927D] mt-1">
          Gerencie pacientes e acompanhamentos
        </p>
      </div>

      {/* Métricas */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <BrandMetricCard
          label="Total"
          value={metrics?.total ?? "—"}
          icon={<Users className="w-5 h-5 text-[#7A9A74]" />}
        />
        <BrandMetricCard
          label="Ativos"
          value={metrics?.ativos ?? "—"}
          icon={<UserCheck className="w-5 h-5 text-[#7A9A74]" />}
        />
        <BrandMetricCard
          label="Novos no mês"
          value={metrics?.novosMes ?? "—"}
          icon={<UserPlus className="w-5 h-5 text-[#B47F6A]" />}
          accent
        />
      </div>

      {/* Filtros */}
      <div className="brand-card p-5">
        <form onSubmit={handleSearch} className="dashboard-filter-form">
          <div>
            <label className="brand-label">Busca</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#A8927D]" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Nome, e-mail ou telefone..."
                className="brand-input pl-9"
              />
            </div>
          </div>

          <div>
            <label className="brand-label">Status</label>
            <select
              value={status}
              onChange={(e) => { setStatus(e.target.value); setPage(1); }}
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
        </form>
      </div>

      {/* Tabela */}
      <div className="brand-card overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-[#EAD8C2] px-4 py-4 sm:px-6">
          <h4 className="brand-section-title">Pacientes cadastrados</h4>
          {data && (
            <span className="shrink-0 rounded-full border border-[#7A9A74]/30 px-3 py-1 text-xs font-medium text-[#7A9A74]">
              {data.total} cliente{data.total !== 1 ? "s" : ""}
            </span>
          )}
        </div>

        <div className="md:hidden">
          {loading ? (
            <div className="py-12 text-center text-sm text-[#A8927D]">Carregando...</div>
          ) : data?.items.length === 0 ? (
            <div className="px-4 py-12 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#EAD8C2]">
                <Users className="h-6 w-6 text-[#8C6E52]" />
              </div>
              <p className="mt-3 text-sm text-[#A8927D]">Nenhum cliente cadastrado.</p>
              <p className="mt-1 text-xs text-[#C4A99A]">
                Converta um formulÃ¡rio em cliente para comeÃ§ar.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-[#EAD8C2]">
              {data?.items.map((row) => (
                <Link
                  key={row.id}
                  href={`/dashboard/clients/${row.id}`}
                  className="block px-4 py-4 transition-colors hover:bg-[#FAF7F2]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="break-words text-sm font-semibold leading-5 text-[#3A2B1F]">
                        {row.name}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <ClientStatusBadge status={row.status} />
                        <span className="inline-flex items-center gap-1 text-xs text-[#A8927D]">
                          <CalendarDays className="h-3.5 w-3.5" />
                          {formatDateSafe(row.created_at)}
                        </span>
                      </div>
                    </div>
                    <span className="shrink-0 rounded-full border border-[#7A9A74]/30 px-3 py-1 text-xs font-medium text-[#7A9A74]">
                      Abrir
                    </span>
                  </div>

                  <div className="mt-4 grid gap-2 text-sm text-[#8C6E52]">
                    <div className="flex min-w-0 items-center gap-2">
                      <Phone className="h-4 w-4 shrink-0 text-[#A8927D]" />
                      <span className="min-w-0 break-all">{row.phone || "Sem telefone"}</span>
                    </div>
                    <div className="flex min-w-0 items-center gap-2">
                      <Mail className="h-4 w-4 shrink-0 text-[#A8927D]" />
                      <span className="min-w-0 break-all">{row.email || "Sem e-mail"}</span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="hidden overflow-x-auto md:block">
          <table className="w-full text-left">
            <thead className="bg-[#FAF7F2]">
              <tr>
                {["Nome", "Telefone", "E-mail", "Status", "Cadastrado em", ""].map((h) => (
                  <th
                    key={h}
                    className="px-5 py-3.5 brand-kicker text-left first:pl-6 last:pr-6 last:text-right"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#FAF7F2]">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-14 text-center text-[#A8927D] text-sm">
                    Carregando...
                  </td>
                </tr>
              ) : data?.items.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-14 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-12 h-12 bg-[#EAD8C2] rounded-full flex items-center justify-center">
                        <Users className="w-6 h-6 text-[#8C6E52]" />
                      </div>
                      <p className="text-[#A8927D] text-sm">Nenhum cliente cadastrado.</p>
                      <p className="text-xs text-[#C4A99A]">
                        Converta um formulário em cliente para começar.
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                data?.items.map((row) => (
                  <tr key={row.id} className="hover:bg-[#FAF7F2]/70 transition-colors">
                    <td className="px-6 py-4">
                      <p className="font-medium text-[#3A2B1F] text-sm">{row.name}</p>
                    </td>
                    <td className="px-5 py-4 text-sm text-[#8C6E52] whitespace-nowrap">
                      {row.phone || "—"}
                    </td>
                    <td className="px-5 py-4 text-sm text-[#8C6E52] max-w-[200px] truncate">
                      {row.email || "—"}
                    </td>
                    <td className="px-5 py-4">
                      <ClientStatusBadge status={row.status} />
                    </td>
                    <td className="px-5 py-4 text-xs text-[#A8927D] whitespace-nowrap">
                      {formatDateSafe(row.created_at)}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <Link
                        href={`/dashboard/clients/${row.id}`}
                        className="text-xs font-medium text-[#7A9A74] hover:text-[#B47F6A] transition-colors px-3 py-1.5 border border-[#7A9A74]/30 rounded-full hover:border-[#B47F6A]/30"
                      >
                        Ver cliente
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {data && data.totalPages > 1 && (
          <div className="flex flex-col gap-3 border-t border-[#EAD8C2] px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <span className="text-xs text-[#A8927D]">
              Página {data.page} de {data.totalPages}
            </span>
            <div className="grid grid-cols-2 gap-2 sm:flex">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={data.page <= 1}
                className="rounded-full border border-[#EAD8C2] px-4 py-2 text-xs text-[#8C6E52] transition-colors hover:bg-[#FAF7F2] disabled:cursor-not-allowed disabled:opacity-40 sm:py-1.5"
              >
                Anterior
              </button>
              <button
                onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
                disabled={data.page >= data.totalPages}
                className="rounded-full border border-[#EAD8C2] px-4 py-2 text-xs text-[#8C6E52] transition-colors hover:bg-[#FAF7F2] disabled:cursor-not-allowed disabled:opacity-40 sm:py-1.5"
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
