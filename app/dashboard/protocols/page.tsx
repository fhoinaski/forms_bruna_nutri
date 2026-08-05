"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Archive, BookOpen, CalendarDays, FileText, LibraryBig, Plus, Search, Sparkles } from "lucide-react";
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
  kind: "standard" | "personalized";
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
          kind: "standard",
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
    <div className="mx-auto max-w-5xl space-y-6 animate-fade-up">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="brand-kicker">Biblioteca</p>
          <h1 className="font-serif text-2xl font-semibold text-[#3A2B1F] sm:text-3xl">Protocolos padrão</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#75675E]">
            Modelos reutilizáveis para iniciar o cuidado com consistência. Na ficha da cliente, aplique como está ou crie uma cópia personalizada.
          </p>
        </div>
        <div className="grid gap-2 sm:flex sm:flex-row">
          <Link href="/dashboard/templates" className="brand-btn-secondary">
            <LibraryBig className="h-4 w-4" />
            Modelos predefinidos
          </Link>
          <Link href="/dashboard/protocols/novo" className="brand-btn-primary">
            <Plus className="h-4 w-4" />
            Novo protocolo padrão
          </Link>
        </div>
      </div>

      {/* Filtros */}
      <div className="brand-card p-5">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
          <div className="min-w-0">
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
          <label className="flex min-h-11 cursor-pointer select-none items-center gap-2 text-sm text-[#8C6E52]">
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
        <div className="flex items-center justify-between gap-3 border-b border-[#EAD8C2] px-4 py-4 sm:px-6">
          <h4 className="brand-section-title flex items-center gap-2">
            <BookOpen className="w-4 h-4" />
            Protocolos
          </h4>
          {data && (
            <span className="shrink-0 rounded-full border border-[#7A9A74]/30 px-3 py-1 text-xs text-[#7A9A74]">
              {data.total} protocolo{data.total !== 1 ? "s" : ""}
            </span>
          )}
        </div>

        <div className="md:hidden">
          {loading ? (
            <div className="py-12 text-center text-sm text-[#A8927D]">Carregando...</div>
          ) : !data?.items.length ? (
            <div className="px-4 py-12 text-center">
              <BookOpen className="mx-auto mb-3 h-10 w-10 text-[#EAD8C2]" />
              <p className="text-sm text-[#A8927D]">Nenhum protocolo padrão encontrado.</p>
              <p className="mt-1 text-xs text-[#A8927D]">
                Crie manualmente ou transforme um rascunho de IA revisado em modelo.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-[#EAD8C2]">
              {data.items.map((row) => (
                <Link
                  key={row.id}
                  href={`/dashboard/protocols/${row.id}`}
                  className="block px-4 py-4 transition-colors hover:bg-[#FAF7F2]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="break-words text-sm font-semibold leading-5 text-[#3A2B1F]">{row.title}</p>
                      {row.description && (
                        <p className="mt-1 line-clamp-2 text-xs leading-5 text-[#A8927D]">{row.description}</p>
                      )}
                    </div>
                    <span className={`shrink-0 ${row.is_active ? "brand-badge brand-badge-finalizado" : "brand-badge brand-badge-arquivado"}`}>
                      {row.is_active ? "Ativo" : "Arquivado"}
                    </span>
                  </div>

                  <div className="mt-4 grid gap-2 text-xs text-[#8C6E52]">
                    <div className="flex min-w-0 items-center gap-2">
                      <FileText className="h-3.5 w-3.5 shrink-0 text-[#A8927D]" />
                      <span className="min-w-0 break-words">{row.category ?? "Sem categoria"}</span>
                    </div>
                    <div className="flex min-w-0 items-center gap-2">
                      {row.source_draft_id ? <Sparkles className="h-3.5 w-3.5 shrink-0 text-[#A8927D]" /> : <BookOpen className="h-3.5 w-3.5 shrink-0 text-[#A8927D]" />}
                      <span>{row.source_draft_id ? "IA revisada" : "Manual"}</span>
                    </div>
                    <div className="flex min-w-0 items-center gap-2">
                      <CalendarDays className="h-3.5 w-3.5 shrink-0 text-[#A8927D]" />
                      <span>{formatDateSafe(row.created_at)}</span>
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
                    <p className="text-[#A8927D] text-sm">Nenhum protocolo padrão encontrado.</p>
                    <p className="text-[#A8927D] text-xs mt-1">
                      Crie manualmente ou transforme um rascunho de IA revisado em modelo.
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
                          IA revisada
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
          <div className="flex flex-col gap-3 border-t border-[#EAD8C2] px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <span className="text-xs text-[#A8927D]">Página {data.page} de {data.totalPages}</span>
            <div className="grid grid-cols-2 gap-2 sm:flex">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={data.page <= 1}
                className="rounded-full border border-[#EAD8C2] px-4 py-2 text-xs text-[#8C6E52] hover:bg-[#FAF7F2] disabled:cursor-not-allowed disabled:opacity-40 sm:py-1.5">
                Anterior
              </button>
              <button onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))} disabled={data.page >= data.totalPages}
                className="rounded-full border border-[#EAD8C2] px-4 py-2 text-xs text-[#8C6E52] hover:bg-[#FAF7F2] disabled:cursor-not-allowed disabled:opacity-40 sm:py-1.5">
                Próxima
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="flex items-start gap-3 bg-[#FAF7F2] border border-[#EAD8C2] rounded-xl p-4">
        <Plus className="w-5 h-5 text-[#7A9A74] shrink-0 mt-0.5" />
        <p className="text-sm text-[#8C6E52]">
          Um protocolo padrão nunca deve substituir a avaliação clínica. Use-o como ponto de partida e crie uma cópia personalizada sempre que objetivos, contexto familiar, restrições ou ritmo de adesão exigirem adaptação.
        </p>
      </div>
    </div>
  );
}
