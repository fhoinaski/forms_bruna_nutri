"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Archive, BookOpen, CheckCircle2, Copy, Sparkles, UserRound } from "lucide-react";
import { format, isValid, parseISO } from "date-fns";
import {
  ProtocolBuilder,
  type ProtocolFormValue,
} from "@/components/protocols/ProtocolBuilder";

function formatDateSafe(value: string): string {
  try {
    const date = parseISO(value);
    return isValid(date) ? format(date, "dd/MM/yyyy 'às' HH:mm") : "-";
  } catch {
    return "-";
  }
}

interface ProtocolPhase {
  title: string;
  days: string | null;
  objective: string | null;
  actions_json: string;
  notes: string | null;
}

interface Protocol {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  kind: "standard" | "personalized";
  client_id: string | null;
  copied_from_protocol_id: string | null;
  source_draft_id: string | null;
  is_active: number;
  created_at: string;
  phases: ProtocolPhase[];
}

function parseActions(value: string): string[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

export default function ProtocolDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [data, setData] = useState<Protocol | null>(null);
  const [value, setValue] = useState<ProtocolFormValue>({ title: "", description: "", category: "", targetGroup: "", phases: [] });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch(`/api/admin/protocols/${id}`)
      .then(async (response) => {
        if (!response.ok) {
          router.push("/dashboard/protocols");
          return null;
        }
        return response.json() as Promise<Protocol>;
      })
      .then((protocol) => {
        if (!protocol) return;
        setData(protocol);
        setValue({
          title: protocol.title,
          description: protocol.description ?? "",
          category: protocol.category ?? "",
          phases: protocol.phases.map((phase) => ({
            title: phase.title,
            days: phase.days ?? "",
            objective: phase.objective ?? "",
            actions: parseActions(phase.actions_json),
            notes: phase.notes ?? "",
          })),
        });
      })
      .catch(() => setError("Não foi possível carregar o protocolo."))
      .finally(() => setLoading(false));
  }, [id, router]);

  const save = async () => {
    setSaving(true);
    setError("");
    setSaved(false);

    try {
      const response = await fetch(`/api/admin/protocols/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: value.title,
          description: value.description || null,
          category: value.category || null,
          phases: value.phases.map((phase) => ({
            ...phase,
            days: phase.days || null,
            objective: phase.objective || null,
            notes: phase.notes || null,
            actions: phase.actions.map((action) => action.trim()).filter(Boolean),
          })),
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "Não foi possível salvar.");
      setData((current) => current ? { ...current, title: value.title, description: value.description || null, category: value.category || null } : current);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível salvar.");
    } finally {
      setSaving(false);
    }
  };

  const archive = async () => {
    if (!window.confirm("Arquivar este protocolo? Aplicações já registradas permanecem no histórico.")) return;
    setArchiving(true);
    setError("");

    try {
      const response = await fetch(`/api/admin/protocols/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archive: true }),
      });
      if (!response.ok) throw new Error();
      setData((current) => current ? { ...current, is_active: 0 } : current);
    } catch {
      setError("Não foi possível arquivar.");
    } finally {
      setArchiving(false);
    }
  };

  if (loading) return <div className="py-20 text-center text-sm text-[#A8927D]">Carregando...</div>;
  if (!data) return null;

  const KindIcon = data.kind === "personalized" ? UserRound : BookOpen;

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-16 animate-fade-up">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href={data.client_id ? `/dashboard/clients/${data.client_id}` : "/dashboard/protocols"} className="inline-flex items-center gap-2 text-sm font-medium text-[#607A56] hover:text-[#B47F6A]">
          <ArrowLeft className="h-4 w-4" />
          {data.client_id ? "Voltar ao cliente" : "Voltar à biblioteca"}
        </Link>
        <span className={data.is_active ? "brand-badge brand-badge-finalizado" : "brand-badge brand-badge-arquivado"}>
          {data.is_active ? "Ativo" : "Arquivado"}
        </span>
      </div>

      <header className="overflow-hidden rounded-[1.35rem] border border-[#EDE1D6] bg-[#FFFDFC] shadow-[0_18px_45px_rgba(58,48,40,0.055)]">
        <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="flex min-w-0 flex-col gap-4 p-5 sm:flex-row sm:items-start sm:p-6">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-[#EAF0E4] text-[#607A56]">
              <KindIcon className="h-6 w-6" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="brand-kicker">{data.kind === "personalized" ? "Protocolo personalizado" : "Protocolo padrão"}</p>
                {data.copied_from_protocol_id && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-[#FBF7F1] px-2.5 py-1 text-[10px] font-semibold text-[#75675E]">
                    <Copy className="h-3 w-3" />
                    Cópia individual
                  </span>
                )}
                {data.source_draft_id && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-[#F3E8E5] px-2.5 py-1 text-[10px] font-semibold text-[#8C5F50]">
                    <Sparkles className="h-3 w-3" />
                    Origem IA revisada
                  </span>
                )}
              </div>
              <h1 className="mt-2 break-words font-serif text-2xl font-semibold text-[#3A3028] sm:text-3xl">{data.title}</h1>
              <p className="mt-2 text-xs text-[#A8927D]">Criado em {formatDateSafe(data.created_at)}</p>
            </div>
          </div>

          <aside className="border-t border-[#EDE1D6] bg-[#FBF7F1] p-5 lg:border-l lg:border-t-0">
            <p className="brand-kicker mb-3">Uso correto</p>
            <div className="space-y-2 text-sm text-[#75675E]">
              {data.kind === "personalized" ? (
                <>
                  <p className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#607A56]" />Este protocolo pertence a um cliente específico.</p>
                  <p className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#607A56]" />Ajustes aqui não alteram o modelo padrão.</p>
                </>
              ) : (
                <>
                  <p className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#607A56]" />Este é um modelo reutilizável da biblioteca.</p>
                  <p className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#607A56]" />Para uso individual, personalize dentro do prontuário.</p>
                </>
              )}
            </div>
          </aside>
        </div>
      </header>

      {saved && <p className="rounded-xl border border-[#D9E4D3] bg-[#F4F8F1] px-4 py-3 text-sm text-[#4F6847]">Protocolo salvo com sucesso.</p>}

      <ProtocolBuilder value={value} onChange={setValue} onSubmit={save} saving={saving} submitLabel="Salvar alterações" error={error} />

      {data.is_active === 1 && (
        <div className="flex justify-end border-t border-[#EDE1D6] pt-5">
          <button onClick={archive} disabled={archiving} className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-red-200 px-5 py-2.5 text-sm font-semibold text-red-700 transition hover:bg-red-50 disabled:opacity-50 sm:w-auto">
            <Archive className="h-4 w-4" />
            {archiving ? "Arquivando..." : "Arquivar protocolo"}
          </button>
        </div>
      )}
    </div>
  );
}
