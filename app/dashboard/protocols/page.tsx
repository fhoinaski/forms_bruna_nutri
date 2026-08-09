"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Archive,
  ArrowRight,
  BookOpen,
  CalendarDays,
  FileText,
  Layers3,
  LibraryBig,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { format, isValid, parseISO } from "date-fns";
import { HelpPopover } from "@/components/dashboard/HelpPopover";

function formatDateSafe(value: string): string {
  try {
    const d = parseISO(value);
    return isValid(d) ? format(d, "dd/MM/yyyy") : "-";
  } catch {
    return "-";
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

function ProtocolStatus({ active }: { active: number }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] ${
      active
        ? "border-[#D9E4D3] bg-[#EAF0E4] text-[#607A56]"
        : "border-[#EDE1D6] bg-[#F1ECE7] text-[#75675E]"
    }`}>
      {!active && <Archive className="h-3 w-3" />}
      {active ? "Ativo" : "Arquivado"}
    </span>
  );
}

function ProtocolCard({ protocol }: { protocol: Protocol }) {
  return (
    <Link
      href={`/dashboard/protocols/${protocol.id}`}
      className="group flex h-full flex-col rounded-[1.25rem] border border-[#EDE1D6] bg-[#FFFDFC] p-5 shadow-[0_14px_35px_rgba(58,48,40,0.045)] transition hover:border-[#7F9A74]/45 hover:bg-[#FBF7F1]"
    >
      <div className="flex items-start justify-between gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#EAF0E4] text-[#607A56]">
          <ShieldCheck className="h-5 w-5" />
        </span>
        <ProtocolStatus active={protocol.is_active} />
      </div>
      <div className="mt-4 min-w-0">
        <p className="break-words font-semibold leading-5 text-[#3A3028]">{protocol.title}</p>
        {protocol.description && (
          <p className="mt-2 line-clamp-3 text-sm leading-6 text-[#75675E]">
            {protocol.description}
          </p>
        )}
      </div>
      <div className="mt-4 flex flex-wrap gap-2 text-[11px] font-semibold text-[#75675E]">
        <span className="rounded-full bg-[#FBF7F1] px-2.5 py-1">
          {protocol.category || "Sem categoria"}
        </span>
        <span className="rounded-full bg-[#FBF7F1] px-2.5 py-1">
          {protocol.source_draft_id ? "IA revisada" : "Manual"}
        </span>
      </div>
      <div className="mt-auto flex items-center justify-between pt-5">
        <span className="inline-flex items-center gap-1 text-xs text-[#A9978A]">
          <CalendarDays className="h-3.5 w-3.5" />
          {formatDateSafe(protocol.created_at)}
        </span>
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#607A56]">
          Abrir
          <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
        </span>
      </div>
    </Link>
  );
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

  const stats = useMemo(() => ({
    shown: data?.items.length ?? 0,
    active: data?.items.filter((item) => item.is_active).length ?? 0,
    ai: data?.items.filter((item) => item.source_draft_id).length ?? 0,
  }), [data?.items]);

  return (
    <div className="mx-auto max-w-7xl space-y-7 animate-fade-up">
      <section className="overflow-hidden rounded-[1.5rem] border border-[#EDE1D6] bg-[#FFFDFC] shadow-[0_18px_45px_rgba(58,48,40,0.055)]">
        <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="p-6 sm:p-7">
            <p className="brand-kicker mb-3">Biblioteca clínica</p>
            <div className="flex items-start gap-3">
              <h1 className="font-serif text-4xl font-semibold leading-tight text-[#3A3028] sm:text-5xl">
                Protocolos padrão
              </h1>
              <HelpPopover topicKey="protocols" />
            </div>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-[#75675E]">
              Crie condutas base por objetivo, fase e contexto para acelerar o
              atendimento. Na ficha do paciente, aplique o modelo e personalize.
            </p>
            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              <Link
                href="/dashboard/protocols/novo"
                className="group rounded-2xl border border-[#EDE1D6] bg-[#FBF7F1] p-4 transition hover:border-[#7F9A74]/45 hover:bg-[#F5FAF0]"
              >
                <Plus className="h-5 w-5 text-[#607A56]" />
                <span className="mt-3 flex items-center gap-2 text-sm font-semibold text-[#3A3028]">
                  Novo protocolo
                  <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
                </span>
                <span className="mt-1 block text-xs leading-5 text-[#75675E]">
                  Monte fases, objetivos e ações clínicas.
                </span>
              </Link>
              <Link
                href="/dashboard/templates"
                className="group rounded-2xl border border-[#EDE1D6] bg-[#FBF7F1] p-4 transition hover:border-[#7F9A74]/45 hover:bg-[#F5FAF0]"
              >
                <LibraryBig className="h-5 w-5 text-[#607A56]" />
                <span className="mt-3 flex items-center gap-2 text-sm font-semibold text-[#3A3028]">
                  Modelos de dieta
                  <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
                </span>
                <span className="mt-1 block text-xs leading-5 text-[#75675E]">
                  Organize dietas, suplementos e substituições.
                </span>
              </Link>
              <Link
                href="/dashboard/ajuda"
                className="group rounded-2xl border border-[#EDE1D6] bg-[#FBF7F1] p-4 transition hover:border-[#7F9A74]/45 hover:bg-[#F5FAF0]"
              >
                <BookOpen className="h-5 w-5 text-[#8C5F50]" />
                <span className="mt-3 flex items-center gap-2 text-sm font-semibold text-[#3A3028]">
                  Como usar
                  <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
                </span>
                <span className="mt-1 block text-xs leading-5 text-[#75675E]">
                  Entenda quando usar modelo ou personalização.
                </span>
              </Link>
            </div>
          </div>

          <aside className="border-t border-[#EDE1D6] bg-[#FBF7F1] p-6 lg:border-l lg:border-t-0">
            <p className="brand-kicker mb-3">Resumo</p>
            <div className="grid grid-cols-2 gap-3">
              <Stat label="Listados" value={stats.shown} />
              <Stat label="Ativos" value={stats.active} />
              <Stat label="IA" value={stats.ai} />
              <Stat label="Total" value={data?.total ?? 0} />
            </div>
            <p className="mt-4 rounded-2xl border border-[#EDE1D6] bg-[#FFFDFC] p-4 text-xs leading-5 text-[#75675E]">
              Protocolos padrão servem como base. O plano entregue ao cliente
              deve considerar prontuário, exames, preferências, rotina e evolução.
            </p>
          </aside>
        </div>
      </section>

      <section className="rounded-[1.35rem] border border-[#EDE1D6] bg-[#FFFDFC] p-5 shadow-[0_18px_45px_rgba(58,48,40,0.055)]">
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
          <div className="min-w-0">
            <label className="brand-label">Busca</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#A9978A]" />
              <input
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                placeholder="Título, categoria ou descrição..."
                className="brand-input brand-input-with-icon"
              />
            </div>
          </div>
          <label className="flex min-h-11 cursor-pointer select-none items-center gap-2 rounded-xl border border-[#EDE1D6] bg-[#FBF7F1] px-4 text-sm text-[#75675E]">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => { setShowInactive(e.target.checked); setPage(1); }}
              className="rounded accent-[#7F9A74]"
            />
            Mostrar arquivados
          </label>
        </div>
      </section>

      <section className="overflow-hidden rounded-[1.35rem] border border-[#EDE1D6] bg-[#FFFDFC] shadow-[0_18px_45px_rgba(58,48,40,0.055)]">
        <div className="flex flex-col gap-3 border-b border-[#EDE1D6] px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div>
            <p className="brand-kicker mb-1">Protocolos reutilizáveis</p>
            <h2 className="font-serif text-xl font-semibold text-[#3A3028]">
              Biblioteca de condutas
            </h2>
          </div>
          {data && (
            <span className="w-fit rounded-full border border-[#7F9A74]/30 px-3 py-1 text-xs font-semibold text-[#607A56]">
              {data.total} protocolo{data.total !== 1 ? "s" : ""}
            </span>
          )}
        </div>

        {loading ? (
          <div className="py-14 text-center text-sm text-[#A9978A]">Carregando protocolos...</div>
        ) : !data?.items.length ? (
          <div className="py-14 text-center">
            <Layers3 className="mx-auto mb-3 h-10 w-10 text-[#C4B3A6]" />
            <p className="font-serif text-xl font-semibold text-[#3A3028]">
              Nenhum protocolo padrão encontrado.
            </p>
            <p className="mt-2 text-sm text-[#75675E]">
              Crie manualmente ou transforme um rascunho de IA revisado em modelo.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 bg-[#FBF7F1] p-4 md:grid-cols-2 xl:grid-cols-3">
            {data.items.map((protocol) => (
              <ProtocolCard key={protocol.id} protocol={protocol} />
            ))}
          </div>
        )}

        {data && data.totalPages > 1 && (
          <div className="flex flex-col gap-3 border-t border-[#EDE1D6] px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <span className="text-xs text-[#A9978A]">Página {data.page} de {data.totalPages}</span>
            <div className="grid grid-cols-2 gap-2 sm:flex">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={data.page <= 1}
                className="rounded-full border border-[#EDE1D6] px-4 py-2 text-xs text-[#75675E] hover:bg-[#FBF7F1] disabled:cursor-not-allowed disabled:opacity-40 sm:py-1.5">
                Anterior
              </button>
              <button onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))} disabled={data.page >= data.totalPages}
                className="rounded-full border border-[#EDE1D6] px-4 py-2 text-xs text-[#75675E] hover:bg-[#FBF7F1] disabled:cursor-not-allowed disabled:opacity-40 sm:py-1.5">
                Próxima
              </button>
            </div>
          </div>
        )}
      </section>

      <div className="grid gap-4 md:grid-cols-3">
        <InfoCard
          icon={<FileText className="h-5 w-5" />}
          title="Modelo"
          text="Base reutilizável para iniciar dietas, substituições e condutas."
        />
        <InfoCard
          icon={<ShieldCheck className="h-5 w-5" />}
          title="Protocolo"
          text="Sequência de fases, objetivos e ações que orientam o acompanhamento."
        />
        <InfoCard
          icon={<Sparkles className="h-5 w-5" />}
          title="Personalização"
          text="Cópia ajustada ao paciente dentro do prontuário, antes de entregar."
        />
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl bg-[#FFFDFC] p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#A9978A]">{label}</p>
      <p className="mt-2 font-serif text-3xl font-semibold text-[#607A56]">{value}</p>
    </div>
  );
}

function InfoCard({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <div className="rounded-[1.25rem] border border-[#EDE1D6] bg-[#FFFDFC] p-5 shadow-[0_14px_35px_rgba(58,48,40,0.045)]">
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#EAF0E4] text-[#607A56]">
        {icon}
      </div>
      <p className="mt-4 font-serif text-xl font-semibold text-[#3A3028]">{title}</p>
      <p className="mt-2 text-sm leading-6 text-[#75675E]">{text}</p>
    </div>
  );
}
