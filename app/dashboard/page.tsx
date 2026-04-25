"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Users, Calendar, CheckCircle2, Sparkles, Search, Download, FileSpreadsheet } from "lucide-react";
import { format, parseISO } from "date-fns";

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

const STATUS_LABELS: Record<string, string> = {
  novo: "Novo",
  em_andamento: "Em andamento",
  finalizado: "Finalizado",
  arquivado: "Arquivado",
};

const STATUS_COLORS: Record<string, string> = {
  novo: "bg-blue-100 text-blue-700",
  em_andamento: "bg-yellow-100 text-yellow-700",
  finalizado: "bg-green-100 text-green-700",
  arquivado: "bg-gray-100 text-gray-500",
};

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

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
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
    <div className="space-y-8 max-w-6xl mx-auto">
      {/* Métricas */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          label="Total"
          value={metrics?.total ?? "—"}
          icon={<Users className="w-5 h-5 text-[#7A9A74]" />}
          color="bg-[#7A9A74]/10"
        />
        <MetricCard
          label="Novos"
          value={metrics?.novos ?? "—"}
          icon={<Sparkles className="w-5 h-5 text-[#B47F6A]" />}
          color="bg-[#F4C9C6]/30"
          valueColor="text-[#B47F6A]"
        />
        <MetricCard
          label="Últimos 7 dias"
          value={metrics?.ultimos7dias ?? "—"}
          icon={<Calendar className="w-5 h-5 text-[#7A9A74]" />}
          color="bg-[#EAD8C2]/50"
        />
        <MetricCard
          label="Finalizados"
          value={metrics?.finalizados ?? "—"}
          icon={<CheckCircle2 className="w-5 h-5 text-green-600" />}
          color="bg-green-50"
          valueColor="text-green-600"
        />
      </div>

      {/* Filtros e exportação */}
      <div className="bg-white rounded-2xl border border-[#EAD8C2] p-5 shadow-sm">
        <form
          onSubmit={handleSearch}
          className="flex flex-wrap gap-3 items-end"
        >
          <div className="flex-1 min-w-[180px]">
            <label className="block text-[10px] uppercase tracking-widest text-[#B47F6A] font-bold mb-1">
              Busca
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#A8927D]" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Nome, e-mail, telefone..."
                className="w-full pl-9 pr-4 py-2.5 bg-[#FAF6F1] border border-[#E8D9C8] rounded-xl text-sm text-[#3A2B1F] placeholder-[#A8927D] focus:outline-none focus:border-[#7A9A74] transition-all"
              />
            </div>
          </div>

          <div className="min-w-[150px]">
            <label className="block text-[10px] uppercase tracking-widest text-[#B47F6A] font-bold mb-1">
              Status
            </label>
            <select
              value={status}
              onChange={(e) => { setStatus(e.target.value); setPage(1); }}
              className="w-full py-2.5 px-3 bg-[#FAF6F1] border border-[#E8D9C8] rounded-xl text-sm text-[#3A2B1F] focus:outline-none focus:border-[#7A9A74] transition-all"
            >
              <option value="">Todos</option>
              <option value="novo">Novo</option>
              <option value="em_andamento">Em andamento</option>
              <option value="finalizado">Finalizado</option>
              <option value="arquivado">Arquivado</option>
            </select>
          </div>

          <button
            type="submit"
            className="px-5 py-2.5 bg-[#7A9A74] text-white rounded-xl text-sm font-medium hover:bg-[#688a62] transition-colors"
          >
            Buscar
          </button>

          <div className="flex gap-2 ml-auto">
            <a
              href={exportUrl("csv")}
              className="flex items-center gap-1.5 px-4 py-2.5 bg-[#EAD8C2] text-[#8C6E52] rounded-xl text-sm font-medium hover:bg-[#d9c4ab] transition-colors"
            >
              <Download className="w-4 h-4" />
              CSV
            </a>
            <a
              href={exportUrl("excel")}
              className="flex items-center gap-1.5 px-4 py-2.5 bg-[#7A9A74]/20 text-[#7A9A74] rounded-xl text-sm font-medium hover:bg-[#7A9A74]/30 transition-colors"
            >
              <FileSpreadsheet className="w-4 h-4" />
              Excel
            </a>
          </div>
        </form>
      </div>

      {/* Tabela */}
      <div className="bg-white rounded-3xl shadow-sm border border-[#EAD8C2] overflow-hidden">
        <div className="p-6 border-b border-[#EAD8C2] flex justify-between items-center">
          <h4 className="font-serif font-bold text-lg text-[#B47F6A]">
            Formulários Recebidos
          </h4>
          {data && (
            <span className="text-xs text-[#7A9A74] font-medium border border-[#7A9A74]/30 px-3 py-1 rounded-full">
              {data.total} resultado{data.total !== 1 ? "s" : ""}
            </span>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-[#FAF7F2] text-[#B47F6A] text-[11px] uppercase tracking-widest">
              <tr>
                <th className="px-6 py-4">Paciente</th>
                <th className="px-4 py-4">Telefone</th>
                <th className="px-4 py-4">E-mail</th>
                <th className="px-4 py-4">Objetivo</th>
                <th className="px-4 py-4">Status</th>
                <th className="px-4 py-4 text-center">Data</th>
                <th className="px-6 py-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="text-sm text-gray-600 divide-y divide-[#FAF7F2]">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-[#A8927D]">
                    Carregando...
                  </td>
                </tr>
              ) : data?.items.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-[#A8927D]">
                    Nenhum formulário encontrado.
                  </td>
                </tr>
              ) : (
                data?.items.map((row) => (
                  <tr
                    key={row.id}
                    className="hover:bg-[#FAF7F2]/50 transition-colors"
                  >
                    <td className="px-6 py-4 font-medium text-gray-800 whitespace-nowrap">
                      {row.patient_name}
                      {row.child_name && (
                        <span className="block text-xs text-[#A8927D]">
                          Criança: {row.child_name}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      {row.patient_phone || "—"}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-xs">
                      {row.patient_email || "—"}
                    </td>
                    <td className="px-4 py-4 italic text-[#7A9A74] whitespace-nowrap">
                      {row.objetivo || "—"}
                    </td>
                    <td className="px-4 py-4">
                      <span
                        className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${STATUS_COLORS[row.status] || "bg-gray-100 text-gray-500"}`}
                      >
                        {STATUS_LABELS[row.status] || row.status}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-center whitespace-nowrap text-xs">
                      {format(parseISO(row.created_at), "dd/MM/yyyy")}
                    </td>
                    <td className="px-6 py-4 text-right space-x-2 whitespace-nowrap">
                      <Link
                        href={`/dashboard/submissions/${row.id}`}
                        className="text-[#B47F6A] hover:underline px-2 inline-block text-xs font-medium"
                      >
                        Ver
                      </Link>
                      <a
                        href={`/dashboard/submissions/${row.id}/print`}
                        target="_blank"
                        className="bg-[#F4C9C6] text-[#B47F6A] text-xs font-bold px-3 py-1 rounded-lg hover:bg-[#f1b8b4] transition-colors inline-block"
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
          <div className="p-4 border-t border-[#EAD8C2] flex items-center justify-between">
            <span className="text-xs text-[#A8927D]">
              Página {data.page} de {data.totalPages}
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={data.page <= 1}
                className="px-4 py-1.5 text-xs border border-[#EAD8C2] rounded-lg text-[#7A6050] hover:bg-[#FAF7F2] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Anterior
              </button>
              <button
                onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
                disabled={data.page >= data.totalPages}
                className="px-4 py-1.5 text-xs border border-[#EAD8C2] rounded-lg text-[#7A6050] hover:bg-[#FAF7F2] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
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

function MetricCard({
  label,
  value,
  icon,
  color,
  valueColor = "text-[#7A9A74]",
}: {
  label: string;
  value: number | string;
  icon: React.ReactNode;
  color: string;
  valueColor?: string;
}) {
  return (
    <div className="bg-white p-5 rounded-3xl shadow-sm border border-[#EAD8C2] flex justify-between items-end">
      <div>
        <p className="text-[10px] font-bold text-[#B47F6A] uppercase tracking-wider mb-1">
          {label}
        </p>
        <h3 className={`text-3xl font-serif font-bold ${valueColor}`}>
          {value}
        </h3>
      </div>
      <div className={`w-10 h-10 ${color} rounded-full flex items-center justify-center`}>
        {icon}
      </div>
    </div>
  );
}
