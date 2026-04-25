"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Search, BookOpen, Plus, Archive } from "lucide-react";
import { format, parseISO, isValid } from "date-fns";

function formatDateSafe(value: string): string {
  try {
    const d = parseISO(value);
    return isValid(d) ? format(d, "dd/MM/yyyy") : "—";
  } catch {
    return "—";
  }
}

interface Protocol {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  source_draft_id: string | null;
  is_active: number;
  created_at: string;
}

interface ApiResult {
  items: Protocol[];
  total: number;
  page: number;
  totalPages: number;
}

export default function ProtocolsPage() {
  const [data, setData] = useState<ApiResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [page, setPage] = useState(1);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          page: String(page),
          ...(search ? { search } : {}),
          ...(showInactive ? {} : { isActive: "true" }),
        });
        const res = await fetch(`/api/admin/protocols?${params}`, { signal: controller.signal });
        if (!res.ok) throw new Error();
        setData(await res.json() as ApiResult);
      } catch {
        if (!controller.signal.aborted) setData(null);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [page, search, showInactive]);

  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-fade-up">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="brand-kicker">Biblioteca</p>
          <h1 className="font-serif font-bold text-2xl text-[#3A2B1F]">Protocolos oficiais</h1>
        </div>
        <p className="text-sm text-[#A8927D]">
          Protocolos criados a partir de rascunhos IA aprovados.
        </p>
      </div>

      {/* Filtros */}
      <div className="brand-card p-5">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-[180px]">
            <label className="brand-label">Busca</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#A8927D]" />
              <input
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                placeholder="Título do protocolo..."
                className="brand-input pl-9"
              />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-[#8C6E52] cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => { setShowInactive(e.target.checked); setPage(1); }}
              className="rounded"
            />
            Mostrar arquivados
          </label>
        </div>
      </div>

      {/* Tabela */}
      <div className="brand-card overflow-hidden">
        <div className="px-6 py-4 border-b border-[#EAD8C2] flex justify-between items-center">
          <h4 className="brand-section-title flex items-center gap-2">
            <BookOpen className="w-4 h-4" />
            Protocolos
          </h4>
          {data && (
            <span className="text-xs text-[#7A9A74] border border-[#7A9A74]/30 px-3 py-1 rounded-full">
              {data.total} protocolo{data.total !== 1 ? "s" : ""}
            </span>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-[#FAF7F2]">
              <tr>
                {["Título", "Categoria", "Origem", "Status", "Criado em", ""].map((h) => (
                  <th key={h} className="px-5 py-3.5 brand-kicker first:pl-6 last:pr-6 last:text-right">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#FAF7F2]">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-14 text-center text-[#A8927D] text-sm">Carregando...</td>
                </tr>
              ) : !data?.items.length ? (
                <tr>
                  <td colSpan={6} className="py-14 text-center">
                    <BookOpen className="w-10 h-10 text-[#EAD8C2] mx-auto mb-3" />
                    <p className="text-[#A8927D] text-sm">Nenhum protocolo encontrado.</p>
                    <p className="text-[#A8927D] text-xs mt-1">
                      Aprove um rascunho IA e crie seu primeiro protocolo oficial.
                    </p>
                  </td>
                </tr>
              ) : (
                data.items.map((row) => (
                  <tr key={row.id} className="hover:bg-[#FAF7F2]/70 transition-colors">
                    <td className="px-6 py-4">
                      <p className="font-medium text-[#3A2B1F] text-sm">{row.title}</p>
                      {row.description && (
                        <p className="text-xs text-[#A8927D] mt-0.5 truncate max-w-[280px]">{row.description}</p>
                      )}
                    </td>
                    <td className="px-5 py-4 text-sm text-[#8C6E52]">
                      {row.category ?? "—"}
                    </td>
                    <td className="px-5 py-4">
                      {row.source_draft_id ? (
                        <Link
                          href={`/dashboard/ai-protocol-drafts/${row.source_draft_id}`}
                          className="text-xs text-[#7A9A74] hover:underline"
                        >
                          Ver rascunho IA
                        </Link>
                      ) : (
                        <span className="text-xs text-[#A8927D]">Manual</span>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      {row.is_active ? (
                        <span className="brand-badge brand-badge-finalizado">Ativo</span>
                      ) : (
                        <span className="brand-badge brand-badge-arquivado flex items-center gap-1">
                          <Archive className="w-3 h-3" />
                          Arquivado
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-4 text-xs text-[#A8927D]">
                      {formatDateSafe(row.created_at)}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <Link
                        href={`/dashboard/protocols/${row.id}`}
                        className="text-xs font-medium text-[#7A9A74] hover:text-[#B47F6A] transition-colors px-2"
                      >
                        Ver
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {data && data.totalPages > 1 && (
          <div className="px-6 py-4 border-t border-[#EAD8C2] flex items-center justify-between">
            <span className="text-xs text-[#A8927D]">Página {data.page} de {data.totalPages}</span>
            <div className="flex gap-2">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={data.page <= 1}
                className="px-4 py-1.5 text-xs border border-[#EAD8C2] rounded-full text-[#8C6E52] hover:bg-[#FAF7F2] disabled:opacity-40 disabled:cursor-not-allowed">
                Anterior
              </button>
              <button onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))} disabled={data.page >= data.totalPages}
                className="px-4 py-1.5 text-xs border border-[#EAD8C2] rounded-full text-[#8C6E52] hover:bg-[#FAF7F2] disabled:opacity-40 disabled:cursor-not-allowed">
                Próxima
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Tip */}
      <div className="flex items-start gap-3 bg-[#FAF7F2] border border-[#EAD8C2] rounded-2xl p-4">
        <Plus className="w-5 h-5 text-[#7A9A74] shrink-0 mt-0.5" />
        <p className="text-sm text-[#8C6E52]">
          Protocolos são criados automaticamente ao aprovar um rascunho IA e clicar em{" "}
          <strong className="text-[#B47F6A]">Criar protocolo oficial</strong>.
        </p>
      </div>
    </div>
  );
}
