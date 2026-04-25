"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Save,
  Eye,
  Clock,
  Sparkles,
  ChevronDown,
  ChevronUp,
  BookOpen,
} from "lucide-react";
import type { ProtocolDraftOutput } from "@/lib/validators/ai-protocol";

interface DraftDetail {
  id: string;
  submission_id: string | null;
  title: string;
  status: string;
  ai_model: string | null;
  prompt_version: string | null;
  input_snapshot_json: string;
  output_json: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
}

const STATUS_CONFIG: Record<string, { label: string; cls: string }> = {
  draft: { label: "Rascunho", cls: "brand-badge brand-badge-andamento" },
  reviewed: { label: "Revisado", cls: "brand-badge brand-badge-novo" },
  approved: { label: "Aprovado", cls: "brand-badge brand-badge-finalizado" },
  rejected: { label: "Rejeitado", cls: "brand-badge brand-badge-arquivado" },
};

function SectionCard({ title, children, defaultOpen = true }: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="brand-card overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-6 py-4 border-b border-[#EAD8C2] hover:bg-[#FAF7F2]/60 transition-colors"
      >
        <h3 className="font-serif font-semibold text-base text-[#B47F6A]">{title}</h3>
        {open ? (
          <ChevronUp className="w-4 h-4 text-[#A8927D]" />
        ) : (
          <ChevronDown className="w-4 h-4 text-[#A8927D]" />
        )}
      </button>
      {open && <div className="p-6">{children}</div>}
    </div>
  );
}

function TextBlock({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-[#FAF7F2] border border-[#EAD8C2]/60 rounded-xl px-4 py-3 text-sm text-[#3A2B1F] leading-relaxed whitespace-pre-wrap">
      {children}
    </div>
  );
}

function ListItems({ items }: { items: string[] }) {
  if (!items?.length) return <p className="text-[#A8927D] text-sm italic">—</p>;
  return (
    <ul className="space-y-1.5">
      {items.map((item, i) => (
        <li key={i} className="flex items-start gap-2 text-sm text-[#3A2B1F]">
          <span className="w-1.5 h-1.5 bg-[#7A9A74] rounded-full mt-1.5 shrink-0" />
          {item}
        </li>
      ))}
    </ul>
  );
}

export default function DraftReviewPage() {
  const { draftId } = useParams<{ draftId: string }>();
  const router = useRouter();

  const [draft, setDraft] = useState<DraftDetail | null>(null);
  const [output, setOutput] = useState<ProtocolDraftOutput | null>(null);
  const [loading, setLoading] = useState(true);

  const [editTitle, setEditTitle] = useState("");
  const [editProfNotes, setEditProfNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState("");
  const [creatingProtocol, setCreatingProtocol] = useState(false);
  const [createdProtocolId, setCreatedProtocolId] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/admin/ai-protocol-drafts/${draftId}`)
      .then((res) => {
        if (!res.ok) {
          router.push("/dashboard");
          return null;
        }
        return res.json() as Promise<DraftDetail>;
      })
      .then((d) => {
        if (!d) return;
        setDraft(d);
        setEditTitle(d.title);
        try {
          const parsed = JSON.parse(d.output_json) as ProtocolDraftOutput;
          setOutput(parsed);
          setEditProfNotes(parsed.professionalReviewNotes ?? "");
        } catch {
          setOutput(null);
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [draftId, router]);

  const handleSave = async () => {
    if (!draft || !output) return;
    setSaving(true);
    setSaved(false);
    setError("");
    try {
      const updatedOutput: ProtocolDraftOutput = {
        ...output,
        title: editTitle,
        professionalReviewNotes: editProfNotes,
      };
      const res = await fetch(`/api/admin/ai-protocol-drafts/${draftId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: editTitle,
          output_json: JSON.stringify(updatedOutput),
        }),
      });
      if (!res.ok) throw new Error("Erro ao salvar");
      setOutput(updatedOutput);
      setDraft((d) => d ? { ...d, title: editTitle } : d);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      setError("Não foi possível salvar. Tente novamente.");
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = async (newStatus: "reviewed" | "approved" | "rejected") => {
    setActionLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/ai-protocol-drafts/${draftId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) throw new Error("Erro ao atualizar status");
      setDraft((d) => d ? { ...d, status: newStatus } : d);
    } catch {
      setError("Não foi possível atualizar o status. Tente novamente.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleCreateProtocol = async () => {
    setCreatingProtocol(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/ai-protocol-drafts/${draftId}/create-protocol`, {
        method: "POST",
      });
      const json = await res.json() as { success: boolean; protocolId: string; message?: string };
      if (!res.ok || !json.success) {
        setError(json.message ?? "Erro ao criar protocolo.");
        return;
      }
      setCreatedProtocolId(json.protocolId);
      router.push(`/dashboard/protocols/${json.protocolId}`);
    } catch {
      setError("Erro de rede. Tente novamente.");
    } finally {
      setCreatingProtocol(false);
    }
  };

  if (loading) {
    return <div className="text-center py-20 text-[#A8927D] text-sm">Carregando rascunho...</div>;
  }
  if (!draft || !output) {
    return <div className="text-center py-20 text-[#A8927D] text-sm">Rascunho não encontrado.</div>;
  }

  const statusCfg = STATUS_CONFIG[draft.status] ?? STATUS_CONFIG.draft;
  const isLocked = draft.status === "approved" || draft.status === "rejected";

  return (
    <div className="max-w-4xl mx-auto space-y-5 pb-16 animate-fade-up">
      {/* Top bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {draft.submission_id ? (
          <Link
            href={`/dashboard/submissions/${draft.submission_id}`}
            className="inline-flex items-center gap-2 text-sm text-[#7A9A74] hover:text-[#B47F6A] transition-colors font-medium"
          >
            <ArrowLeft className="w-4 h-4" />
            Voltar ao formulário
          </Link>
        ) : (
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 text-sm text-[#7A9A74] hover:text-[#B47F6A] transition-colors font-medium"
          >
            <ArrowLeft className="w-4 h-4" />
            Dashboard
          </Link>
        )}
        <span className={statusCfg.cls}>{statusCfg.label}</span>
      </div>

      {/* Aviso obrigatório */}
      <div className="flex gap-3 bg-amber-50 border border-amber-200 rounded-2xl p-4">
        <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-amber-800">Rascunho gerado por IA — requer revisão profissional</p>
          <p className="text-xs text-amber-700 mt-1 leading-relaxed">
            Este protocolo é um rascunho de apoio e NÃO pode ser aplicado sem revisão e aprovação da nutricionista responsável.
            A IA é apenas uma ferramenta auxiliar. A decisão final e responsabilidade são exclusivamente da profissional.
          </p>
        </div>
      </div>

      {/* Header do rascunho */}
      <div className="brand-card p-6">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 bg-[#7A9A74]/10 rounded-2xl flex items-center justify-center shrink-0">
            <Sparkles className="w-6 h-6 text-[#7A9A74]" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="brand-kicker mb-1">Rascunho de conduta nutricional</p>
            {isLocked ? (
              <h1 className="font-serif text-xl font-bold text-[#3A2B1F]">{draft.title}</h1>
            ) : (
              <input
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                className="brand-input font-serif text-lg font-semibold"
              />
            )}
            <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-[#A8927D]">
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                Gerado em {new Date(draft.created_at).toLocaleString("pt-BR")}
              </span>
              {draft.ai_model && (
                <span className="bg-[#EAD8C2] text-[#8C6E52] px-2 py-0.5 rounded-full">
                  {draft.ai_model}
                </span>
              )}
              {output.generatedWithoutExternalAi && (
                <span className="bg-[#FEF9C3] text-[#B45309] px-2 py-0.5 rounded-full">
                  Gerado sem IA externa
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Resumo do caso */}
      <SectionCard title="Resumo do caso">
        <TextBlock>{output.caseSummary}</TextBlock>
      </SectionCard>

      {/* Objetivos */}
      <SectionCard title="Objetivos principais">
        <ListItems items={output.mainGoals} />
      </SectionCard>

      {/* Pontos de atenção */}
      <SectionCard title="Pontos de atenção">
        <ul className="space-y-2">
          {output.attentionPoints?.map((pt, i) => (
            <li key={i} className="flex items-start gap-2 text-sm">
              <span className="w-1.5 h-1.5 bg-[#B47F6A] rounded-full mt-1.5 shrink-0" />
              <span className="text-[#3A2B1F]">{pt}</span>
            </li>
          ))}
        </ul>
      </SectionCard>

      {/* Protocolo sugerido */}
      <SectionCard title={`Rascunho de conduta — ${output.suggestedProtocol?.durationDays ?? "?"} dias`}>
        <div className="space-y-5">
          {output.suggestedProtocol?.phases?.map((phase, i) => (
            <div key={i} className="border border-[#EAD8C2] rounded-xl p-5">
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-serif font-semibold text-[#7A9A74]">{phase.title}</h4>
                <span className="text-xs text-[#A8927D] bg-[#EAD8C2] px-2 py-0.5 rounded-full">
                  Dias {phase.days}
                </span>
              </div>
              <p className="text-xs font-semibold text-[#B47F6A] uppercase tracking-wide mb-2">
                Objetivo
              </p>
              <p className="text-sm text-[#3A2B1F] mb-4">{phase.objective}</p>
              <p className="text-xs font-semibold text-[#B47F6A] uppercase tracking-wide mb-2">
                Sugestões de ação
              </p>
              <ListItems items={phase.actions} />
              {phase.notes && (
                <p className="mt-3 text-xs text-[#8C6E52] italic border-t border-[#EAD8C2] pt-3">
                  Nota: {phase.notes}
                </p>
              )}
            </div>
          ))}
        </div>
      </SectionCard>

      {/* Tarefas sugeridas */}
      <SectionCard title="Tarefas sugeridas">
        <div className="space-y-3">
          {output.tasks?.map((task, i) => (
            <div key={i} className="flex items-start gap-3 p-3 bg-[#FAF7F2] rounded-xl border border-[#EAD8C2]/60">
              <div className="w-8 h-8 bg-[#EAD8C2] rounded-full flex items-center justify-center text-[#8C6E52] text-xs font-bold shrink-0">
                {task.dueInDays}d
              </div>
              <div>
                <p className="text-sm font-semibold text-[#3A2B1F]">{task.title}</p>
                <p className="text-xs text-[#8C6E52] mt-0.5">{task.description}</p>
              </div>
            </div>
          ))}
        </div>
      </SectionCard>

      {/* Perguntas de follow-up */}
      <SectionCard title="Perguntas de follow-up" defaultOpen={false}>
        <ListItems items={output.followUpQuestions} />
      </SectionCard>

      {/* Materiais educativos */}
      <SectionCard title="Materiais educativos sugeridos" defaultOpen={false}>
        <ListItems items={output.educationalMaterials} />
      </SectionCard>

      {/* Notas de segurança */}
      <SectionCard title="Notas de segurança" defaultOpen={false}>
        <ul className="space-y-2">
          {output.safetyNotes?.map((note, i) => (
            <li key={i} className="flex items-start gap-2 text-sm">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
              <span className="text-[#3A2B1F]">{note}</span>
            </li>
          ))}
        </ul>
      </SectionCard>

      {/* Notas profissionais — editável */}
      <div className="brand-card p-6 space-y-4">
        <h3 className="font-serif font-semibold text-base text-[#B47F6A]">
          Anotações da profissional
        </h3>
        <p className="text-xs text-[#A8927D]">
          Use este campo para registrar ajustes, discordâncias ou complementos ao rascunho da IA.
        </p>
        <textarea
          value={editProfNotes}
          onChange={(e) => setEditProfNotes(e.target.value)}
          rows={5}
          disabled={isLocked}
          className="brand-input resize-y disabled:opacity-60 disabled:cursor-not-allowed"
          placeholder="Anote aqui sua revisão profissional, ajustes ou discordâncias com o rascunho..."
        />

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3">
            <p className="text-red-600 text-sm">{error}</p>
          </div>
        )}

        {!isLocked && (
          <div className="flex items-center justify-between flex-wrap gap-3">
            <button
              onClick={handleSave}
              disabled={saving}
              className="brand-btn-primary"
            >
              <Save className="w-4 h-4" />
              {saving ? "Salvando..." : saved ? "Salvo!" : "Salvar revisão"}
            </button>

            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => handleStatusChange("reviewed")}
                disabled={actionLoading || draft.status === "reviewed"}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-[#7A9A74] border border-[#7A9A74]/40 rounded-full hover:bg-[#7A9A74]/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Eye className="w-3.5 h-3.5" />
                Marcar como revisado
              </button>
              <button
                onClick={() => handleStatusChange("approved")}
                disabled={actionLoading}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-[#7A9A74] rounded-full hover:bg-[#688a62] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                Aprovar
              </button>
              <button
                onClick={() => handleStatusChange("rejected")}
                disabled={actionLoading}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-[#B47F6A] rounded-full hover:bg-[#9a6a57] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <XCircle className="w-3.5 h-3.5" />
                Rejeitar
              </button>
            </div>
          </div>
        )}

        {isLocked && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm text-[#8C6E52] bg-[#EAD8C2]/40 rounded-xl px-4 py-3">
              <CheckCircle2 className="w-4 h-4 text-[#7A9A74]" />
              <span>
                Rascunho <strong>{statusCfg.label.toLowerCase()}</strong>.
                Para editar, altere o status para &quot;Rascunho&quot; ou crie um novo.
              </span>
            </div>
            {draft.status === "approved" && (
              <div className="flex items-center justify-between flex-wrap gap-3 bg-[#7A9A74]/8 border border-[#7A9A74]/20 rounded-xl px-5 py-4">
                <div>
                  <p className="font-semibold text-sm text-[#3A2B1F]">Rascunho aprovado</p>
                  <p className="text-xs text-[#8C6E52] mt-0.5">
                    Converta em protocolo oficial para aplicar a clientes.
                  </p>
                </div>
                {createdProtocolId ? (
                  <Link href={`/dashboard/protocols/${createdProtocolId}`}
                    className="inline-flex items-center gap-2 bg-[#7A9A74] text-white px-5 py-2 rounded-full text-sm font-semibold hover:bg-[#688a62] transition-colors">
                    <BookOpen className="w-4 h-4" />
                    Ver protocolo criado
                  </Link>
                ) : (
                  <button onClick={handleCreateProtocol} disabled={creatingProtocol}
                    className="inline-flex items-center gap-2 bg-[#7A9A74] text-white px-5 py-2 rounded-full text-sm font-semibold hover:bg-[#688a62] transition-colors disabled:opacity-60 disabled:cursor-not-allowed">
                    <BookOpen className="w-4 h-4" />
                    {creatingProtocol ? "Criando protocolo..." : "Criar protocolo oficial"}
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
