"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Archive, BookOpen, Save } from "lucide-react";
import { format, parseISO, isValid } from "date-fns";

function formatDateSafe(value: string): string {
  try {
    const d = parseISO(value);
    return isValid(d) ? format(d, "dd/MM/yyyy 'às' HH:mm") : "—";
  } catch { return "—"; }
}

interface ProtocolPhase {
  id: string;
  title: string;
  days: string | null;
  objective: string | null;
  actions_json: string;
  notes: string | null;
  phase_order: number;
}

interface Protocol {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  source_draft_id: string | null;
  is_active: number;
  created_at: string;
  phases: ProtocolPhase[];
}

export default function ProtocolDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [data, setData] = useState<Protocol | null>(null);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`/api/admin/protocols/${id}`)
      .then((res) => {
        if (!res.ok) { router.push("/dashboard/protocols"); return null; }
        return res.json() as Promise<Protocol>;
      })
      .then((d) => {
        if (!d) return;
        setData(d);
        setTitle(d.title);
        setDescription(d.description ?? "");
        setCategory(d.category ?? "");
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [id, router]);

  const handleSave = async () => {
    setSaving(true); setSaved(false); setError("");
    try {
      const res = await fetch(`/api/admin/protocols/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, description: description || null, category: category || null }),
      });
      if (!res.ok) throw new Error();
      setData((d) => d ? { ...d, title, description: description || null, category: category || null } : d);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      setError("Não foi possível salvar.");
    } finally {
      setSaving(false);
    }
  };

  const handleArchive = async () => {
    if (!confirm("Arquivar este protocolo?")) return;
    setArchiving(true); setError("");
    try {
      await fetch(`/api/admin/protocols/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archive: true }),
      });
      setData((d) => d ? { ...d, is_active: 0 } : d);
    } catch {
      setError("Não foi possível arquivar.");
    } finally {
      setArchiving(false);
    }
  };

  if (loading) return <div className="text-center py-20 text-[#A8927D] text-sm">Carregando...</div>;
  if (!data) return null;

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-16 animate-fade-up">
      {/* Top bar */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <Link href="/dashboard/protocols"
          className="inline-flex items-center gap-2 text-sm text-[#7A9A74] hover:text-[#B47F6A] transition-colors font-medium">
          <ArrowLeft className="w-4 h-4" />
          Protocolos
        </Link>
        <div className="flex items-center gap-2">
          {data.is_active ? (
            <span className="brand-badge brand-badge-finalizado">Ativo</span>
          ) : (
            <span className="brand-badge brand-badge-arquivado">Arquivado</span>
          )}
        </div>
      </div>

      {/* Header */}
      <div className="brand-card overflow-hidden">
        <div className="p-8 border-b border-[#EAD8C2] bg-gradient-to-br from-[#FAF7F2] to-[#EAD8C2]/30">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 bg-[#7A9A74]/10 rounded-2xl flex items-center justify-center shrink-0">
              <BookOpen className="w-6 h-6 text-[#7A9A74]" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="brand-kicker mb-1">Protocolo oficial</p>
              <h1 className="font-serif font-bold text-2xl text-[#3A2B1F]">{data.title}</h1>
              <p className="text-xs text-[#A8927D] mt-1">Criado em {formatDateSafe(data.created_at)}</p>
              {data.source_draft_id && (
                <Link
                  href={`/dashboard/ai-protocol-drafts/${data.source_draft_id}`}
                  className="inline-flex items-center gap-1 text-xs text-[#7A9A74] hover:underline mt-2"
                >
                  Ver rascunho IA de origem
                </Link>
              )}
            </div>
          </div>
        </div>

        {/* Edit form */}
        <div className="p-8 space-y-5">
          <h2 className="font-serif font-semibold text-lg text-[#B47F6A]">Informações</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="md:col-span-2">
              <label className="brand-label">Título</label>
              <input value={title} onChange={(e) => setTitle(e.target.value)} className="brand-input" />
            </div>
            <div>
              <label className="brand-label">Categoria</label>
              <input value={category} onChange={(e) => setCategory(e.target.value)}
                placeholder="Ex: nutricional, materno-infantil..." className="brand-input" />
            </div>
          </div>
          <div>
            <label className="brand-label">Descrição / Resumo do caso</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)}
              rows={4} className="brand-input resize-y" placeholder="Resumo clínico do protocolo..." />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex items-center justify-between flex-wrap gap-3 pt-2">
            <button onClick={handleSave} disabled={saving} className="brand-btn-primary">
              <Save className="w-4 h-4" />
              {saving ? "Salvando..." : saved ? "Salvo!" : "Salvar alterações"}
            </button>
            {data.is_active === 1 && (
              <button onClick={handleArchive} disabled={archiving}
                className="inline-flex items-center gap-2 text-xs font-medium text-[#8C6E52] border border-[#EAD8C2] rounded-full px-4 py-2 hover:bg-[#EAD8C2]/40 transition-colors disabled:opacity-50">
                <Archive className="w-3.5 h-3.5" />
                {archiving ? "Arquivando..." : "Arquivar protocolo"}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Fases */}
      {data.phases.length > 0 && (
        <div className="brand-card overflow-hidden">
          <div className="px-6 py-4 border-b border-[#EAD8C2]">
            <h2 className="brand-section-title">Fases do protocolo ({data.phases.length})</h2>
          </div>
          <div className="p-6 space-y-4">
            {data.phases.map((phase) => {
              let actions: string[] = [];
              try { actions = JSON.parse(phase.actions_json) as string[]; } catch { actions = []; }
              return (
                <div key={phase.id} className="border border-[#EAD8C2] rounded-xl p-5">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-serif font-semibold text-[#7A9A74]">{phase.title}</h3>
                    {phase.days && (
                      <span className="text-xs bg-[#EAD8C2] text-[#8C6E52] px-2 py-0.5 rounded-full">
                        Dias {phase.days}
                      </span>
                    )}
                  </div>
                  {phase.objective && (
                    <p className="text-sm text-[#3A2B1F] mb-3">{phase.objective}</p>
                  )}
                  {actions.length > 0 && (
                    <ul className="space-y-1.5 mb-3">
                      {actions.map((a, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-[#3A2B1F]">
                          <span className="w-1.5 h-1.5 bg-[#7A9A74] rounded-full mt-1.5 shrink-0" />
                          {a}
                        </li>
                      ))}
                    </ul>
                  )}
                  {phase.notes && (
                    <p className="text-xs text-[#8C6E52] italic border-t border-[#EAD8C2] pt-3">
                      Nota: {phase.notes}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
