"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Loader2, Send, Sparkles, X } from "lucide-react";
import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";
import { NUTRITION_TEXT_FIELD_LABELS, type NutritionRecordTextFieldKey } from "@/lib/clinical/nutrition-record-fields";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface ProposedActionLike {
  kind: string;
  proposalId?: string;
  risk?: string;
  fields?: Record<string, string>;
  preview?: { title?: string; mealPlanTitle?: string; changeSummaries?: { mealName: string; before: string | null; after: string | null }[] };
  tasks?: { title: string; description?: string | null; dueInDays?: number | null }[];
  content?: { summary: string; evolution?: string | null; conduct?: string | null; plan?: string | null; goals?: string | null; nextSteps?: string | null };
  professionalNotes?: string;
  [key: string]: unknown;
}

// Mesmo estilo compacto usado em components/dashboard/AiChatWidget.tsx — sem
// a classe "prose" porque o plugin de tipografia do Tailwind nao esta
// registrado no projeto.
const markdownComponents: Components = {
  p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
  ul: ({ children }) => <ul className="mb-2 list-disc space-y-1 pl-4 last:mb-0">{children}</ul>,
  ol: ({ children }) => <ol className="mb-2 list-decimal space-y-1 pl-4 last:mb-0">{children}</ol>,
  li: ({ children }) => <li className="leading-6">{children}</li>,
  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
  code: ({ children }) => <code className="rounded bg-black/10 px-1 py-0.5 text-[0.85em]">{children}</code>,
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className="underline">
      {children}
    </a>
  ),
};

// Mensagem de confirmacao especifica por tipo de proposta — generica demais
// ("Aplicado com sucesso.") deixava a nutricionista sem saber O QUE mudou,
// especialmente para nutrition_record, cujo resultado (campos do prontuario)
// nao aparece em nenhuma aba do Modo Consulta (ver ConsultationRecordSummary).
function describeAppliedProposal(proposal: ProposedActionLike): string {
  if (proposal.kind === "nutrition_record" && proposal.fields) {
    const labels = Object.keys(proposal.fields)
      .map((key) => NUTRITION_TEXT_FIELD_LABELS[key as NutritionRecordTextFieldKey] ?? key)
      .filter(Boolean);
    return labels.length
      ? `Prontuário atualizado: ${labels.join(", ")}. Confira em "Prontuário desta consulta", logo abaixo das anotações.`
      : "Prontuário atualizado.";
  }
  if (proposal.kind === "meal_plan_change") return "Plano alimentar atualizado — confira na aba Plano.";
  if (proposal.kind === "consultation_tasks_batch") {
    const count = proposal.tasks?.length ?? 0;
    return count ? `${count} tarefa${count > 1 ? "s" : ""} criada${count > 1 ? "s" : ""}.` : "Tarefas criadas.";
  }
  if (proposal.kind === "consultation_summary") return "Resumo da consulta salvo.";
  if (proposal.kind === "client_protocol") return "Notas do protocolo atualizadas — confira na aba Protocolo.";
  return "Aplicado com sucesso.";
}

const STEP_SUGGESTIONS: Record<string, string[]> = {
  resumo: ["Resumir histórico", "Listar pontos para revisar", "Ver pendências"],
  mudancas: ["Resumir alterações", "Comparar evolução", "Destacar mudanças relevantes"],
  anamnese: ["Verificar informações faltantes", "Organizar notas da consulta", "Resumir hábitos e rotina"],
  antropometria: ["Resumir evolução antropométrica", "Comparar medidas", "Preparar orientação para a consulta"],
  plano: ["Analisar plano atual", "Sugerir revisão do plano", "Verificar aderência ao plano"],
  recomendacoes: ["Organizar orientações", "Resumir conduta", "Propor metas revisáveis"],
  retorno: ["Resumir consulta", "Listar próximos passos", "Ver pendências antes de concluir"],
};

/**
 * Copiloto do Modo Consulta (Área C, secao 6/24/25). Painel lateral
 * recolhivel, chat dedicado. Reaproveita a MESMA rota /api/admin/ai/chat e
 * a MESMA infraestrutura generica de confirmacao de proposals
 * (/api/admin/ai/proposals/[id]/confirm|cancel) que o widget administrativo
 * ja usa — nao existe uma segunda arquitetura de IA aqui.
 *
 * Decisao documentada: nao extrai um hook compartilhado com
 * components/dashboard/AiChatWidget.tsx nesta rodada (arquivo grande,
 * refatora-lo com seguranca exigiria mais tempo do que o escopo permite) —
 * duplica o necessario. Ver relatorio final.
 */
export function ConsultationCopilot({
  clientId,
  consultationSessionId,
  activeStep,
  externalMessage,
  onExternalMessageSent,
  onProposalConfirmed,
}: {
  clientId: string;
  consultationSessionId: string;
  activeStep: string;
  externalMessage: string | null;
  onExternalMessageSent: () => void;
  onProposalConfirmed: (kind: string) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [proposal, setProposal] = useState<ProposedActionLike | null>(null);
  const [proposalBusy, setProposalBusy] = useState(false);
  const [error, setError] = useState("");
  const quickSuggestions = STEP_SUGGESTIONS[activeStep] ?? STEP_SUGGESTIONS.resumo;
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages, proposal]);

  useEffect(() => {
    if (externalMessage) {
      void sendMessage(externalMessage);
      onExternalMessageSent();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalMessage]);

  async function sendMessage(text: string) {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    const nextMessages = [...messages, { role: "user" as const, content: trimmed }];
    setMessages(nextMessages);
    setInput("");
    setSending(true);
    setError("");
    try {
      const response = await fetch("/api/admin/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: nextMessages,
          context: { clientId, currentPage: "client_consultation", consultationSessionId },
        }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.message || "Falha ao consultar o assistente.");
      }
      const data = await response.json();
      setMessages((current) => [...current, { role: "assistant", content: data.reply || "" }]);
      if (data.proposedUpdate) setProposal(data.proposedUpdate as ProposedActionLike);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao consultar o assistente.");
    } finally {
      setSending(false);
    }
  }

  async function confirmProposal() {
    if (!proposal?.proposalId) return;
    setProposalBusy(true);
    try {
      const response = await fetch(`/api/admin/ai/proposals/${proposal.proposalId}/confirm`, { method: "POST" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.message || "Não foi possível confirmar.");
      setMessages((current) => [...current, { role: "assistant", content: describeAppliedProposal(proposal) }]);
      onProposalConfirmed(proposal.kind);
      setProposal(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível confirmar.");
    } finally {
      setProposalBusy(false);
    }
  }

  async function cancelProposal() {
    if (!proposal?.proposalId) return;
    setProposalBusy(true);
    try {
      await fetch(`/api/admin/ai/proposals/${proposal.proposalId}/cancel`, { method: "POST" });
    } finally {
      setProposal(null);
      setProposalBusy(false);
    }
  }

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={() => setCollapsed(false)}
        className="fixed right-4 top-1/2 z-40 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-[#D9E4D3] bg-white shadow-md hover:bg-[#EEF3EA]"
        aria-label="Abrir copiloto"
      >
        <ChevronLeft className="h-5 w-5 text-[#4F6847]" />
      </button>
    );
  }

  return (
    <div className="flex h-full flex-col rounded-2xl border border-[#EDE1D6] bg-white">
      <div className="flex items-center justify-between border-b border-[#EDE1D6] px-4 py-3">
        <div className="flex items-center gap-1.5">
          <Sparkles className="h-4 w-4 text-[#607A56]" />
          <h2 className="font-serif text-base font-semibold text-[#3A3028]">Copiloto</h2>
        </div>
        <button type="button" onClick={() => setCollapsed(true)} className="text-[#9A978A] hover:text-[#3A3028]" aria-label="Recolher copiloto">
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
        {messages.length === 0 && (
          <div className="space-y-2">
            <p className="text-xs text-[#75675E]">Pergunte em linguagem natural ou use um atalho:</p>
            <div className="flex flex-wrap gap-1.5">
              {quickSuggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => void sendMessage(suggestion)}
                  className="rounded-full border border-[#D9E4D3] bg-[#EEF3EA] px-2.5 py-1 text-[11px] font-semibold text-[#4F6847] hover:bg-[#E1EBDB]"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((message, index) => (
          <div
            key={index}
            className={`max-w-[92%] rounded-2xl px-3 py-2 text-sm ${message.role === "user" ? "ml-auto whitespace-pre-wrap bg-[#7F9A74] text-white" : "bg-[#FBF7F1] text-[#3A3028]"}`}
          >
            {message.role === "user" ? message.content : <ReactMarkdown components={markdownComponents}>{message.content}</ReactMarkdown>}
          </div>
        ))}
        {sending && <Loader2 className="h-4 w-4 animate-spin text-[#9A978A]" />}
        {proposal && <ProposalCard proposal={proposal} busy={proposalBusy} onConfirm={() => void confirmProposal()} onCancel={() => void cancelProposal()} />}
        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          void sendMessage(input);
        }}
        className="flex items-center gap-2 border-t border-[#EDE1D6] p-3"
      >
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Pergunte algo sobre esta consulta..."
          className="brand-input flex-1"
        />
        <button type="submit" disabled={sending || !input.trim()} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#7F9A74] text-white hover:bg-[#607A56] disabled:opacity-50">
          <Send className="h-4 w-4" />
        </button>
      </form>
    </div>
  );
}

function ProposalCard({ proposal, busy, onConfirm, onCancel }: { proposal: ProposedActionLike; busy: boolean; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="space-y-2 rounded-xl border border-[#D9E4D3] bg-[#F4F8F1] p-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#607A56]">Alteração proposta{proposal.risk ? ` · ${proposal.risk === "clinical" ? "clínica" : "requer confirmação"}` : ""}</p>
      <ProposalBody proposal={proposal} />
      <div className="flex justify-end gap-2">
        <button type="button" disabled={busy} onClick={onCancel} className="inline-flex items-center gap-1 rounded-full border border-[#EDE1D6] px-3 py-1.5 text-xs font-semibold text-[#75675E] hover:bg-white disabled:opacity-50">
          <X className="h-3.5 w-3.5" /> Cancelar
        </button>
        <button type="button" disabled={busy} onClick={onConfirm} className="inline-flex items-center gap-1 rounded-full bg-[#7F9A74] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#607A56] disabled:opacity-50">
          <Check className="h-3.5 w-3.5" /> {busy ? "Aplicando..." : "Confirmar"}
        </button>
      </div>
    </div>
  );
}

function ProposalBody({ proposal }: { proposal: ProposedActionLike }) {
  if (proposal.kind === "meal_plan_change" && proposal.preview?.changeSummaries) {
    return (
      <div className="space-y-1 text-sm text-[#3A3028]">
        {proposal.preview.changeSummaries.map((change, index) => (
          <p key={index}>
            <span className="text-[#9A6F5E]">{change.mealName}: </span>
            {change.before && <span className="line-through text-[#B47F6A]">{change.before}</span>}
            {change.before && change.after && " → "}
            {change.after && <span className="font-semibold">{change.after}</span>}
          </p>
        ))}
      </div>
    );
  }
  if (proposal.kind === "consultation_tasks_batch" && proposal.tasks) {
    return (
      <ul className="list-disc space-y-0.5 pl-4 text-sm text-[#3A3028]">
        {proposal.tasks.map((task, index) => <li key={index}>{task.title}{task.dueInDays != null ? ` (em ${task.dueInDays} dias)` : ""}</li>)}
      </ul>
    );
  }
  if (proposal.kind === "consultation_summary" && proposal.content) {
    return (
      <div className="space-y-1 text-sm text-[#3A3028]">
        <p>{proposal.content.summary}</p>
        {proposal.content.conduct && <p><span className="font-semibold">Conduta: </span>{proposal.content.conduct}</p>}
        {proposal.content.nextSteps && <p><span className="font-semibold">Próximos passos: </span>{proposal.content.nextSteps}</p>}
      </div>
    );
  }
  if (proposal.kind === "client_protocol" && proposal.professionalNotes) {
    return <p className="text-sm text-[#3A3028]">{proposal.professionalNotes}</p>;
  }
  if (proposal.fields) {
    const entries = Object.entries(proposal.fields).filter(([, value]) => value?.trim());
    return (
      <div className="space-y-1 text-sm text-[#3A3028]">
        {entries.map(([key, value]) => <p key={key}>{value}</p>)}
      </div>
    );
  }
  return <p className="text-sm text-[#3A3028]">Revise os detalhes antes de confirmar.</p>;
}
