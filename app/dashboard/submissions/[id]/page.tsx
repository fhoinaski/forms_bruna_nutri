"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { format, parseISO, isValid } from "date-fns";
import {
  ArrowLeft,
  Printer,
  Save,
  Phone,
  Mail,
  Baby,
  UserPlus,
  ExternalLink,
  AlertTriangle,
  Sparkles,
  FileText,
} from "lucide-react";
import Link from "next/link";
import { BrandBadge } from "@/components/brand/BrandBadge";

function formatDateSafe(value: string): string {
  try {
    const d = parseISO(value);
    return isValid(d) ? format(d, "dd/MM/yyyy 'às' HH:mm") : "—";
  } catch {
    return "—";
  }
}

interface SubmissionDetail {
  id: string;
  patient_name: string;
  patient_email: string | null;
  patient_phone: string | null;
  child_name: string | null;
  child_age: string | null;
  form_type: string;
  status: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
  answers: Record<string, unknown>;
}

interface PreAnalysis {
  id: string;
  summary: string | null;
  attention_points: string | null;
  main_goal: string | null;
  restrictions: string | null;
  professional_notes: string | null;
  priority: string;
}

interface AiDraft {
  id: string;
  title: string;
  status: string;
  ai_model: string | null;
  created_at: string;
}

const ANSWER_SECTIONS = [
  {
    title: "Atendimento",
    fields: [
      { key: "tipoAtendimento", label: "Tipo de atendimento" },
    ],
  },
  {
    title: "Dados Pessoais",
    fields: [
      { key: "idade", label: "Idade" },
      { key: "nascimento", label: "Data de nascimento" },
      { key: "profissao", label: "Profissão" },
      { key: "cidade", label: "Cidade/Estado" },
    ],
  },
  {
    title: "Momento Atual",
    fields: [
      { key: "motivacao", label: "Motivação", full: true },
      { key: "objetivo", label: "Objetivo principal" },
      { key: "incomodo", label: "O que mais incomoda", full: true },
    ],
  },
  {
    title: "Histórico de Saúde",
    fields: [
      { key: "diagnostico", label: "Diagnóstico", full: true },
      { key: "medicacao", label: "Medicação contínua", full: true },
      { key: "anticoncepcional", label: "Anticoncepcional" },
      { key: "gestante", label: "Gestante/Amamentando" },
      { key: "sintomas", label: "Sintomas frequentes", full: true },
    ],
  },
  {
    title: "Suplementação",
    fields: [
      { key: "suplementos", label: "Uso atual", full: true },
      { key: "suplementosNegativo", label: "Não se adaptou", full: true },
    ],
  },
  {
    title: "Rotina Alimentar",
    fields: [
      { key: "rotina", label: "Rotina descrita", full: true },
      { key: "semComer", label: "Fica longo tempo sem comer" },
      { key: "comerEmocao", label: "Come por fome/emoção" },
      { key: "fomeDia", label: "Fome ao longo do dia", full: true },
    ],
  },
  {
    title: "Sono, Estresse e Rotina",
    fields: [
      { key: "sonoHoras", label: "Horas de sono" },
      { key: "descansada", label: "Acorda descansada" },
      { key: "estresse", label: "Nível de estresse" },
      { key: "atividadeFisica", label: "Atividade física", full: true },
    ],
  },
  {
    title: "Saúde Intestinal",
    fields: [
      { key: "intestinoFreq", label: "Frequência" },
      { key: "desconforto", label: "Gases/Desconforto" },
    ],
  },
  {
    title: "Preferências",
    fields: [
      { key: "naoGosta", label: "Não gosta/tolera", full: true },
      { key: "favoritos", label: "Favoritos no dia a dia", full: true },
    ],
  },
  {
    title: "Dia Alimentar",
    fields: [{ key: "diaAlimentar", label: "Relato", full: true }],
  },
  {
    title: "Expectativas",
    fields: [
      { key: "expectativas", label: "O que espera?", full: true },
      { key: "disposicao", label: "Disposição para mudar (0-10)" },
    ],
  },
  {
    title: "Espaço Livre",
    fields: [{ key: "espacoLivre", label: "Mensagem", full: true }],
  },
];

const STATUS_OPTIONS = [
  { value: "novo", label: "Novo" },
  { value: "em_andamento", label: "Em andamento" },
  { value: "finalizado", label: "Finalizado" },
  { value: "arquivado", label: "Arquivado" },
];

const DRAFT_STATUS_LABELS: Record<string, string> = {
  draft: "Rascunho",
  reviewed: "Revisado",
  approved: "Aprovado",
  rejected: "Rejeitado",
};

const DRAFT_STATUS_COLORS: Record<string, string> = {
  draft: "bg-[#EAD8C2] text-[#8C6E52]",
  reviewed: "bg-blue-100 text-blue-700",
  approved: "bg-[#D4EDDA] text-[#4A7C59]",
  rejected: "bg-red-100 text-red-700",
};

function renderValue(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  if (Array.isArray(v)) return v.join(", ");
  return String(v);
}

export default function SubmissionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [data, setData] = useState<SubmissionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // CRM
  const [clientId, setClientId] = useState<string | null>(null);
  const [converting, setConverting] = useState(false);
  const [convertError, setConvertError] = useState("");

  // Pré-análise
  const [preAnalysis, setPreAnalysis] = useState<PreAnalysis | null>(null);
  const [paLoading, setPaLoading] = useState(true);
  const [paSaving, setPaSaving] = useState(false);
  const [paSaved, setPaSaved] = useState(false);
  const [paError, setPaError] = useState("");
  const [paSummary, setPaSummary] = useState("");
  const [paAttentionPoints, setPaAttentionPoints] = useState("");
  const [paMainGoal, setPaMainGoal] = useState("");
  const [paRestrictions, setPaRestrictions] = useState("");
  const [paProfessionalNotes, setPaProfessionalNotes] = useState("");
  const [paPriority, setPaPriority] = useState("normal");

  // Rascunhos IA
  const [drafts, setDrafts] = useState<AiDraft[]>([]);
  const [draftsLoading, setDraftsLoading] = useState(true);
  const [extraInstructions, setExtraInstructions] = useState("");
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState("");
  const [lastGeneratedDraftId, setLastGeneratedDraftId] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/admin/submissions/${id}`)
      .then((res) => res.json())
      .then((res: SubmissionDetail) => {
        setData(res);
        setStatus(res.status || "novo");
        setNotes(res.notes || "");
      })
      .catch(console.error)
      .finally(() => setLoading(false));

    fetch(`/api/admin/clients?submissionId=${id}`)
      .then((res) => res.json())
      .then((res: { items: Array<{ id: string }> }) => {
        if (res.items?.length > 0) setClientId(res.items[0].id);
      })
      .catch(() => null);

    fetch(`/api/admin/submissions/${id}/pre-analysis`)
      .then((res) => res.json())
      .then((res: PreAnalysis | null) => {
        if (res) {
          setPreAnalysis(res);
          setPaSummary(res.summary ?? "");
          setPaAttentionPoints(res.attention_points ?? "");
          setPaMainGoal(res.main_goal ?? "");
          setPaRestrictions(res.restrictions ?? "");
          setPaProfessionalNotes(res.professional_notes ?? "");
          setPaPriority(res.priority ?? "normal");
        }
      })
      .catch(() => null)
      .finally(() => setPaLoading(false));

    fetch(`/api/admin/submissions/${id}/ai-protocol-drafts`)
      .then((res) => res.json())
      .then((res: AiDraft[]) => setDrafts(res ?? []))
      .catch(() => null)
      .finally(() => setDraftsLoading(false));
  }, [id]);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      await fetch(`/api/admin/submissions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, notes }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const handleConvert = async () => {
    setConverting(true);
    setConvertError("");
    try {
      const res = await fetch(`/api/admin/submissions/${id}/convert-to-client`, {
        method: "POST",
      });
      const json = await res.json() as { success: boolean; clientId: string; message?: string };
      if (!res.ok || !json.success) {
        setConvertError(json.message ?? "Erro ao criar cliente.");
        return;
      }
      router.push(`/dashboard/clients/${json.clientId}`);
    } catch {
      setConvertError("Erro de rede. Tente novamente.");
    } finally {
      setConverting(false);
    }
  };

  const handleSavePreAnalysis = async () => {
    setPaSaving(true);
    setPaSaved(false);
    setPaError("");
    try {
      const res = await fetch(`/api/admin/submissions/${id}/pre-analysis`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          summary: paSummary || null,
          attention_points: paAttentionPoints || null,
          main_goal: paMainGoal || null,
          restrictions: paRestrictions || null,
          professional_notes: paProfessionalNotes || null,
          priority: paPriority,
        }),
      });
      const json = await res.json() as { success: boolean; message?: string };
      if (!res.ok || !json.success) {
        setPaError(json.message ?? "Erro ao salvar pré-análise.");
        return;
      }
      setPaSaved(true);
      setTimeout(() => setPaSaved(false), 3000);
    } catch {
      setPaError("Erro de rede. Tente novamente.");
    } finally {
      setPaSaving(false);
    }
  };

  const handleGenerateDraft = async () => {
    setGenerating(true);
    setGenerateError("");
    setLastGeneratedDraftId(null);
    try {
      const res = await fetch(`/api/admin/submissions/${id}/ai-protocol-drafts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ extraInstructions: extraInstructions || null }),
      });
      const json = await res.json() as { success: boolean; draftId: string; message?: string };
      if (!res.ok || !json.success) {
        setGenerateError(json.message ?? "Erro ao gerar rascunho.");
        return;
      }
      setLastGeneratedDraftId(json.draftId);
      // Recarrega lista de rascunhos
      const draftsRes = await fetch(`/api/admin/submissions/${id}/ai-protocol-drafts`);
      const newDrafts = await draftsRes.json() as AiDraft[];
      setDrafts(newDrafts ?? []);
    } catch {
      setGenerateError("Erro de rede. Tente novamente.");
    } finally {
      setGenerating(false);
    }
  };

  if (loading) {
    return (
      <div className="text-center py-20 text-[#A8927D] text-sm">Carregando...</div>
    );
  }
  if (!data) {
    return (
      <div className="text-center py-20 text-[#A8927D] text-sm">
        Formulário não encontrado.
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-16 animate-fade-up">
      {/* Top bar */}
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 text-sm text-[#7A9A74] hover:text-[#B47F6A] transition-colors font-medium"
        >
          <ArrowLeft className="w-4 h-4" />
          Voltar
        </Link>

        <div className="flex items-center gap-2 flex-wrap">
          {clientId ? (
            <Link
              href={`/dashboard/clients/${clientId}`}
              className="inline-flex items-center gap-2 bg-[#7A9A74] text-white px-5 py-2 rounded-full text-sm font-semibold hover:bg-[#688a62] transition-colors"
            >
              <ExternalLink className="w-4 h-4" />
              Abrir cliente
            </Link>
          ) : (
            <button
              onClick={handleConvert}
              disabled={converting}
              className="inline-flex items-center gap-2 bg-[#7A9A74] text-white px-5 py-2 rounded-full text-sm font-semibold hover:bg-[#688a62] transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <UserPlus className="w-4 h-4" />
              {converting ? "Criando..." : "Criar cliente"}
            </button>
          )}

          <a
            href={`/dashboard/submissions/${id}/print`}
            target="_blank"
            className="inline-flex items-center gap-2 bg-[#F4C9C6] text-[#B47F6A] px-5 py-2 rounded-full text-sm font-semibold hover:bg-[#f1b8b4] transition-colors"
          >
            <Printer className="w-4 h-4" />
            Imprimir / PDF
          </a>
        </div>
      </div>

      {convertError && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <p className="text-red-600 text-sm">{convertError}</p>
        </div>
      )}

      {/* Patient card */}
      <div className="brand-card overflow-hidden">
        {/* Header */}
        <div className="p-8 border-b border-[#EAD8C2] bg-gradient-to-br from-[#FAF7F2] to-[#EAD8C2]/30 text-center relative overflow-hidden">
          <div className="absolute right-[-30px] top-[-30px] opacity-10 pointer-events-none">
            <svg width="180" height="180" viewBox="0 0 100 100" fill="none">
              <circle cx="50" cy="50" r="45" stroke="#7A9A74" strokeWidth="0.5" />
              <circle cx="50" cy="50" r="30" stroke="#B47F6A" strokeWidth="0.5" />
              <circle cx="50" cy="20" r="5" fill="#F4C9C6" />
            </svg>
          </div>
          <p className="brand-kicker mb-3">Relatório do Paciente</p>
          <h1 className="font-serif font-bold text-3xl text-[#7A9A74] mb-3">
            {data.patient_name}
          </h1>
          <div className="flex flex-wrap justify-center gap-4 text-sm text-[#8C6E52] mb-3">
            {data.patient_phone && (
              <span className="flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5" />
                {data.patient_phone}
              </span>
            )}
            {data.patient_email && (
              <span className="flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5" />
                {data.patient_email}
              </span>
            )}
            {data.child_name && (
              <span className="flex items-center gap-1.5">
                <Baby className="w-3.5 h-3.5" />
                {data.child_name}
                {data.child_age ? ` (${data.child_age})` : ""}
              </span>
            )}
          </div>
          <p className="text-xs text-[#A8927D]">
            Recebido em {formatDateSafe(data.created_at)}
          </p>
          <div className="mt-3 flex justify-center">
            <BrandBadge status={data.status} />
          </div>
        </div>

        {/* Management panel */}
        <div className="p-6 bg-[#FAF7F2]/60 border-b border-[#EAD8C2]">
          <div className="flex flex-wrap gap-4 items-end">
            <div>
              <label className="brand-label">Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="brand-input w-auto"
              >
                {STATUS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex-1 min-w-[200px]">
              <label className="brand-label">Notas internas</label>
              <input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Observações sobre este paciente..."
                className="brand-input"
              />
            </div>
            <button
              onClick={handleSave}
              disabled={saving}
              className="brand-btn-primary"
            >
              <Save className="w-4 h-4" />
              {saving ? "Salvando..." : saved ? "Salvo!" : "Salvar"}
            </button>
          </div>
        </div>

        {/* Answers */}
        <div className="p-8 space-y-10">
          {ANSWER_SECTIONS.map((section) => {
            const visible = section.fields
              .map((f) => ({ ...f, rendered: renderValue(data.answers[f.key]) }))
              .filter((f) => f.rendered !== null);

            if (visible.length === 0) return null;

            return (
              <div
                key={section.title}
                className="border-b border-[#EAD8C2]/50 pb-8 last:border-0 last:pb-0"
              >
                <h3 className="font-serif font-bold text-xl text-[#B47F6A] mb-6">
                  {section.title}
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  {visible.map((f) => (
                    <div key={f.key} className={f.full ? "col-span-1 md:col-span-2" : ""}>
                      <p className="brand-label mb-2">{f.label}</p>
                      <div className="bg-[#FAF7F2] rounded-xl p-4 text-[#3A2B1F] text-sm whitespace-pre-wrap leading-relaxed border border-[#EAD8C2]/60">
                        {f.rendered}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}

          {data.notes && (
            <div className="border-t border-[#EAD8C2]/50 pt-8">
              <h3 className="font-serif font-bold text-xl text-[#B47F6A] mb-6">
                Notas Internas
              </h3>
              <div className="bg-[#FAF7F2] rounded-xl p-4 text-[#3A2B1F] text-sm whitespace-pre-wrap leading-relaxed border border-[#EAD8C2]/60">
                {data.notes}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Pré-análise profissional */}
      <div className="brand-card overflow-hidden">
        <div className="p-6 border-b border-[#EAD8C2] bg-gradient-to-br from-[#FAF7F2] to-[#EAD8C2]/20">
          <h2 className="font-serif font-bold text-xl text-[#B47F6A]">
            Pré-análise profissional
          </h2>
          <p className="text-sm text-[#A8927D] mt-1">
            Registre suas impressões clínicas antes de gerar o rascunho de protocolo.
          </p>
        </div>

        <div className="p-6 space-y-4">
          {paLoading ? (
            <p className="text-sm text-[#A8927D]">Carregando...</p>
          ) : (
            <>
              {preAnalysis && (
                <p className="text-xs text-[#A8927D]">
                  Última atualização salva — editando pré-análise existente.
                </p>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className="brand-label">Resumo clínico</label>
                  <textarea
                    value={paSummary}
                    onChange={(e) => setPaSummary(e.target.value)}
                    rows={3}
                    placeholder="Impressão geral sobre o caso..."
                    className="brand-input resize-none"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="brand-label">Pontos de atenção</label>
                  <textarea
                    value={paAttentionPoints}
                    onChange={(e) => setPaAttentionPoints(e.target.value)}
                    rows={3}
                    placeholder="Sinais clínicos, riscos, observações importantes..."
                    className="brand-input resize-none"
                  />
                </div>

                <div>
                  <label className="brand-label">Objetivo principal</label>
                  <input
                    value={paMainGoal}
                    onChange={(e) => setPaMainGoal(e.target.value)}
                    placeholder="Ex: Perda de peso sustentável"
                    className="brand-input"
                  />
                </div>

                <div>
                  <label className="brand-label">Prioridade</label>
                  <select
                    value={paPriority}
                    onChange={(e) => setPaPriority(e.target.value)}
                    className="brand-input"
                  >
                    <option value="normal">Normal</option>
                    <option value="alta">Alta</option>
                    <option value="urgente">Urgente</option>
                  </select>
                </div>

                <div className="md:col-span-2">
                  <label className="brand-label">Restrições identificadas</label>
                  <textarea
                    value={paRestrictions}
                    onChange={(e) => setPaRestrictions(e.target.value)}
                    rows={2}
                    placeholder="Alergias, intolerâncias, contraindicações..."
                    className="brand-input resize-none"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="brand-label">Notas profissionais</label>
                  <textarea
                    value={paProfessionalNotes}
                    onChange={(e) => setPaProfessionalNotes(e.target.value)}
                    rows={4}
                    placeholder="Observações detalhadas, hipóteses, condutas preliminares..."
                    className="brand-input resize-none"
                  />
                </div>
              </div>

              {paError && (
                <p className="text-sm text-red-600">{paError}</p>
              )}

              <div className="flex items-center gap-3 pt-2">
                <button
                  onClick={handleSavePreAnalysis}
                  disabled={paSaving}
                  className="brand-btn-primary"
                >
                  <Save className="w-4 h-4" />
                  {paSaving ? "Salvando..." : paSaved ? "Salvo!" : "Salvar pré-análise"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Agente de IA interno */}
      <div className="brand-card overflow-hidden">
        <div className="p-6 border-b border-[#EAD8C2] bg-gradient-to-br from-[#FAF7F2] to-[#EAD8C2]/20">
          <h2 className="font-serif font-bold text-xl text-[#B47F6A] flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-[#B47F6A]" />
            Agente de IA interno
          </h2>
          <p className="text-sm text-[#A8927D] mt-1">
            Gere um rascunho de protocolo nutricional para revisão profissional.
          </p>
        </div>

        <div className="p-6 space-y-4">
          {/* Aviso obrigatório */}
          <div className="flex gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4">
            <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-amber-800 space-y-1">
              <p className="font-semibold">Aviso importante</p>
              <p>
                O rascunho gerado pela IA é apenas um apoio para a profissional responsável.
                Ele <strong>não substitui avaliação clínica</strong> e deve ser
                revisado, editado e aprovado antes de qualquer uso.
              </p>
            </div>
          </div>

          <div>
            <label className="brand-label">Instruções extras (opcional)</label>
            <textarea
              value={extraInstructions}
              onChange={(e) => setExtraInstructions(e.target.value)}
              rows={3}
              placeholder="Diretrizes específicas para este caso, foco do protocolo, abordagem preferida..."
              className="brand-input resize-none"
            />
          </div>

          {generateError && (
            <p className="text-sm text-red-600">{generateError}</p>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={handleGenerateDraft}
              disabled={generating}
              className="brand-btn-primary"
            >
              <Sparkles className="w-4 h-4" />
              {generating ? "Gerando rascunho..." : "Gerar rascunho de protocolo"}
            </button>

            {lastGeneratedDraftId && (
              <Link
                href={`/dashboard/ai-protocol-drafts/${lastGeneratedDraftId}`}
                className="inline-flex items-center gap-2 bg-[#F4C9C6] text-[#B47F6A] px-5 py-2 rounded-full text-sm font-semibold hover:bg-[#f1b8b4] transition-colors"
              >
                <FileText className="w-4 h-4" />
                Revisar rascunho gerado
              </Link>
            )}
          </div>

          {/* Lista de rascunhos existentes */}
          {!draftsLoading && drafts.length > 0 && (
            <div className="pt-4 border-t border-[#EAD8C2]">
              <h3 className="text-sm font-semibold text-[#8C6E52] mb-3">
                Rascunhos anteriores ({drafts.length})
              </h3>
              <ul className="space-y-2">
                {drafts.map((draft) => (
                  <li key={draft.id}>
                    <Link
                      href={`/dashboard/ai-protocol-drafts/${draft.id}`}
                      className="flex items-center justify-between gap-3 bg-[#FAF7F2] rounded-xl px-4 py-3 border border-[#EAD8C2]/60 hover:border-[#B47F6A]/40 transition-colors group"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <FileText className="w-4 h-4 text-[#A8927D] flex-shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-[#3A2B1F] truncate group-hover:text-[#B47F6A] transition-colors">
                            {draft.title}
                          </p>
                          <p className="text-xs text-[#A8927D]">
                            {formatDateSafe(draft.created_at)}
                            {draft.ai_model ? ` · ${draft.ai_model}` : ""}
                          </p>
                        </div>
                      </div>
                      <span
                        className={`text-xs font-medium px-2.5 py-1 rounded-full flex-shrink-0 ${
                          DRAFT_STATUS_COLORS[draft.status] ?? "bg-[#EAD8C2] text-[#8C6E52]"
                        }`}
                      >
                        {DRAFT_STATUS_LABELS[draft.status] ?? draft.status}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {!draftsLoading && drafts.length === 0 && (
            <p className="text-sm text-[#A8927D] pt-2">
              Nenhum rascunho gerado ainda para este formulário.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
