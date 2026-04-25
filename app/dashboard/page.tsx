"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  Users,
  Calendar,
  CheckCircle2,
  Sparkles,
  Search,
  Download,
  FileSpreadsheet,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { BrandBadge } from "@/components/brand/BrandBadge";
import { BrandMetricCard } from "@/components/brand/BrandMetricCard";

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

export default function DashboardPage() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: "20",
        ...(search ? { search } : {}),
        ...(status ? { status } : {}),
      });
      const res = await fetch(`/api/admin/submissions?${params}`);
      if (!res.ok) throw new Error("Erro ao buscar dados");
      const json: ApiResponse = await res.json();
      setData(json);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [page, search, status]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchData();
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
    <div className="space-y-6 max-w-6xl mx-auto animate-fade-up">
      {/* Métricas */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <BrandMetricCard
          label="Total"
          value={metrics?.total ?? "—"}
          icon={<Users className="w-5 h-5 text-[#7A9A74]" />}
        />
        <BrandMetricCard
          label="Novos"
          value={metrics?.novos ?? "—"}
          icon={<Sparkles className="w-5 h-5 text-[#B47F6A]" />}
          accent
        />
        <BrandMetricCard
          label="Últimos 7 dias"
          value={metrics?.ultimos7dias ?? "—"}
          icon={<Calendar className="w-5 h-5 text-[#7A9A74]" />}
        />
        <BrandMetricCard
          label="Finalizados"
          value={metrics?.finalizados ?? "—"}
          icon={<CheckCircle2 className="w-5 h-5 text-[#7A9A74]" />}
        />
      </div>

      {/* Filtros */}
      <div className="brand-card p-5">
        <form onSubmit={handleSearch} className="flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-[180px]">
            <label className="brand-label">Busca</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#A8927D]" />
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
              className="flex items-center gap-1.5 px-4 py-2 bg-[#EAD8C2] text-[#8C6E52] rounded-full text-xs font-medium hover:bg-[#d9c4ab] transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              CSV
            </a>
            <a
              href={exportUrl("excel")}
              className="flex items-center gap-1.5 px-4 py-2 bg-[#7A9A74]/15 text-[#7A9A74] rounded-full text-xs font-medium hover:bg-[#7A9A74]/25 transition-colors"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              Excel
            </a>
          </div>
        </form>
      </div>

      {/* Tabela */}
      <div className="brand-card overflow-hidden">
        <div className="px-6 py-4 border-b border-[#EAD8C2] flex justify-between items-center">
          <h4 className="brand-section-title">Formulários Recebidos</h4>
          {data && (
            <span className="text-xs text-[#7A9A74] font-medium border border-[#7A9A74]/30 px-3 py-1 rounded-full">
              {data.total} resultado{data.total !== 1 ? "s" : ""}
            </span>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-[#FAF7F2]">
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
                    <p className="text-[#A8927D] text-sm">Nenhum formulário encontrado.</p>
                  </td>
                </tr>
              ) : (
                data?.items.map((row) => (
                  <tr key={row.id} className="hover:bg-[#FAF7F2]/70 transition-colors">
                    <td className="px-6 py-4">
                      <p className="font-medium text-[#3A2B1F] text-sm">{row.patient_name}</p>
                      {row.tipoAtendimento && (
                        <span className="mt-1 inline-block text-[10px] font-semibold px-2 py-0.5 bg-[#EAD8C2] text-[#8C6E52] rounded-full uppercase tracking-wide">
                          {row.tipoAtendimento}
                        </span>
                      )}
                      {row.child_name && (
                        <p className="text-xs text-[#A8927D] mt-0.5">
                          Criança: {row.child_name}
                        </p>
                      )}
                    </td>
                    <td className="px-5 py-4 text-sm text-[#8C6E52] whitespace-nowrap">
                      {row.patient_phone || "—"}
                    </td>
                    <td className="px-5 py-4 text-sm italic text-[#7A9A74] max-w-[200px] truncate">
                      {row.objetivo || "—"}
                    </td>
                    <td className="px-5 py-4">
                      <BrandBadge status={row.status} />
                    </td>
                    <td className="px-5 py-4 text-xs text-[#A8927D] whitespace-nowrap">
                      {format(parseISO(row.created_at), "dd/MM/yyyy")}
                    </td>
                    <td className="px-6 py-4 text-right space-x-2 whitespace-nowrap">
                      <Link
                        href={`/dashboard/submissions/${row.id}`}
                        className="text-xs font-medium text-[#7A9A74] hover:text-[#B47F6A] transition-colors px-2"
                      >
                        Ver
                      </Link>
                      <a
                        href={`/dashboard/submissions/${row.id}/print`}
                        target="_blank"
                        className="text-xs font-medium bg-[#F4C9C6] text-[#B47F6A] px-3 py-1.5 rounded-full hover:bg-[#f1b8b4] transition-colors"
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
          <div className="px-6 py-4 border-t border-[#EAD8C2] flex items-center justify-between">
            <span className="text-xs text-[#A8927D]">
              Página {data.page} de {data.totalPages}
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={data.page <= 1}
                className="px-4 py-1.5 text-xs border border-[#EAD8C2] rounded-full text-[#8C6E52] hover:bg-[#FAF7F2] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Anterior
              </button>
              <button
                onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
                disabled={data.page >= data.totalPages}
                className="px-4 py-1.5 text-xs border border-[#EAD8C2] rounded-full text-[#8C6E52] hover:bg-[#FAF7F2] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
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
