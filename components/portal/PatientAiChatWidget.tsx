"use client";

import { useEffect, useRef, useState } from "react";
import { Bot, Check, MessageSquarePlus, Send, Sparkles, X } from "lucide-react";
import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";
import { PatientFactsCard } from "@/components/portal/patient-ai-facts";
import { formatDateTimeBR } from "@/components/dashboard/ai-facts";
import type { PatientAssistantFactsPayload } from "@/lib/ai/core/patient-response";
import type { PatientPortalSection } from "@/lib/ai/agents/patient/patient-portal-agent";

/**
 * Assistente do PORTAL DO PACIENTE — widget PROPRIO, independente do
 * AiChatWidget administrativo (components/dashboard/AiChatWidget.tsx).
 * Fala com /api/portal/ai/**, nunca com /api/admin/ai/**. Paleta bege/verde
 * do portal (mesma de app/portal/page.tsx), nao a do dashboard.
 */

const SECTION_ANCHOR_IDS: Record<PatientPortalSection, string> = {
  meal_plan: "portal-meal-plan",
  appointments: "portal-appointments",
  tasks: "portal-tasks",
};

type ProposalStatus = "pending" | "applying" | "applied" | "discarded" | "error" | "expired";

interface PatientProposal {
  proposalId?: string;
  expiresAt?: string;
  startsAtIso: string;
  status: ProposalStatus;
  error?: string;
}

function buildPatientProposal(update: Record<string, unknown> | undefined): PatientProposal | null {
  if (!update || update.kind !== "patient_appointment_request") return null;
  return {
    proposalId: update.proposalId as string | undefined,
    expiresAt: update.expiresAt as string | undefined,
    startsAtIso: update.startsAtIso as string,
    status: "pending",
  };
}

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  facts?: PatientAssistantFactsPayload;
  proposal?: PatientProposal;
};

const MAX_HISTORY_MESSAGES_SENT = 16;

const markdownComponents: Components = {
  p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
  ul: ({ children }) => <ul className="mb-2 list-disc space-y-1 pl-4 last:mb-0">{children}</ul>,
  ol: ({ children }) => <ol className="mb-2 list-decimal space-y-1 pl-4 last:mb-0">{children}</ol>,
  li: ({ children }) => <li className="leading-6">{children}</li>,
  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
};

const QUICK_ACTIONS = [
  { id: "meal_plan", label: "Meu plano", kind: "deterministic" as const, action: "meal_plan" as const },
  { id: "appointments", label: "Próxima consulta", kind: "deterministic" as const, action: "appointments" as const },
  { id: "tasks", label: "Minhas tarefas", kind: "deterministic" as const, action: "tasks" as const },
  { id: "food_question", label: "Dúvidas sobre alimentos", kind: "chat" as const, message: "Tenho uma dúvida sobre um alimento do meu plano." },
];

export function PatientAiChatWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const panelRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!panelRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending]);

  function scrollToSection(section: PatientPortalSection) {
    const id = SECTION_ANCHOR_IDS[section];
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function startNewConversation() {
    setMessages([]);
    setError("");
  }

  async function sendMessage(text: string) {
    const content = text.trim();
    if (!content || sending) return;
    setError("");
    const nextMessages: ChatMessage[] = [...messages, { role: "user", content }];
    setMessages(nextMessages);
    setInput("");
    setSending(true);
    try {
      const response = await fetch("/api/portal/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: nextMessages.slice(-MAX_HISTORY_MESSAGES_SENT).map(({ role, content: messageContent }) => ({ role, content: messageContent })),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? "Não consegui responder agora.");
      const proposal = buildPatientProposal(data.proposedUpdate as Record<string, unknown> | undefined);
      setMessages([...nextMessages, { role: "assistant", content: data.reply, facts: data.facts, proposal: proposal ?? undefined }]);
      const navigateAction = data.navigateAction as { section?: PatientPortalSection } | undefined;
      if (navigateAction?.section) scrollToSection(navigateAction.section);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não consegui responder agora. Tente novamente.");
    } finally {
      setSending(false);
    }
  }

  async function runQuickAction(action: (typeof QUICK_ACTIONS)[number]) {
    if (action.kind === "chat") {
      void sendMessage(action.message);
      return;
    }
    if (sending) return;
    setError("");
    setMessages((current) => [...current, { role: "user", content: action.label }]);
    setSending(true);
    try {
      const response = await fetch("/api/portal/ai/quick-facts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: action.action }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? "Não consegui buscar essa informação agora.");
      setMessages((current) => [...current, { role: "assistant", content: "", facts: data.facts }]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não consegui buscar essa informação agora.");
    } finally {
      setSending(false);
    }
  }

  function updateProposal(messageIndex: number, updater: (proposal: PatientProposal) => PatientProposal) {
    setMessages((current) => current.map((message, index) => {
      if (index !== messageIndex || !message.proposal) return message;
      return { ...message, proposal: updater(message.proposal) };
    }));
  }

  function discardProposal(messageIndex: number, proposal: PatientProposal) {
    updateProposal(messageIndex, (current) => ({ ...current, status: "discarded" }));
    if (proposal.proposalId) {
      void fetch(`/api/portal/ai/proposals/${proposal.proposalId}/cancel`, { method: "POST" }).catch(() => {});
    }
  }

  async function confirmProposal(messageIndex: number, proposal: PatientProposal) {
    if (!proposal.proposalId) {
      updateProposal(messageIndex, (current) => ({ ...current, status: "error", error: "Não foi possível confirmar. Peça novamente ao assistente." }));
      return;
    }
    updateProposal(messageIndex, (current) => ({ ...current, status: "applying", error: undefined }));
    try {
      const response = await fetch(`/api/portal/ai/proposals/${proposal.proposalId}/confirm`, { method: "POST" });
      const data = await response.json();
      if (!response.ok) {
        if (response.status === 410) {
          updateProposal(messageIndex, (current) => ({ ...current, status: "expired" }));
          return;
        }
        throw new Error(data.message ?? "Não foi possível marcar a consulta.");
      }
      updateProposal(messageIndex, (current) => ({ ...current, status: "applied" }));
    } catch (cause) {
      updateProposal(messageIndex, (current) => ({ ...current, status: "error", error: cause instanceof Error ? cause.message : "Não foi possível marcar a consulta." }));
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label="Assistente do portal"
        className="fixed bottom-5 right-5 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-[#607A56] text-white shadow-[0_12px_32px_rgba(96,122,86,0.4)] transition hover:bg-[#4F6847] print:hidden"
      >
        {open ? <X className="h-6 w-6" /> : <Bot className="h-6 w-6" />}
      </button>

      {open && (
        <div
          ref={panelRef}
          className="fixed bottom-24 right-5 z-40 flex h-[min(32rem,75vh)] w-[calc(100vw-2.5rem)] max-w-96 flex-col overflow-hidden rounded-2xl border border-[#E6D5C5] bg-[#FFFDFB] shadow-2xl"
        >
          <div className="flex items-center justify-between gap-3 border-b border-[#E6D5C5] bg-white/70 px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#EEF3EA] text-[#607A56]"><Bot className="h-4 w-4" /></span>
              <div>
                <p className="text-sm font-semibold text-[#3A3028]">Assistente do portal</p>
                <p className="text-[11px] text-[#9A8B80]">Tira dúvidas do seu acompanhamento</p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={startNewConversation}
                disabled={messages.length === 0}
                aria-label="Iniciar nova conversa"
                title="Nova conversa"
                className="rounded-full p-1.5 text-[#9A8B80] hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
              >
                <MessageSquarePlus className="h-4 w-4" />
              </button>
              <button type="button" onClick={() => setOpen(false)} aria-label="Fechar" className="rounded-full p-1.5 text-[#9A8B80] hover:bg-white">
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5 border-b border-[#E6D5C5] bg-[#FFFDFB] px-3 py-2">
            {QUICK_ACTIONS.map((action) => (
              <button
                key={action.id}
                type="button"
                onClick={() => void runQuickAction(action)}
                disabled={sending}
                className="rounded-full border border-[#D9E4D3] bg-[#EEF3EA] px-2.5 py-1 text-[11px] font-semibold text-[#4F6847] transition hover:bg-[#E1EBDB] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {action.label}
              </button>
            ))}
          </div>

          <div ref={scrollRef} aria-live="polite" className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
            {messages.length === 0 && (
              <div className="space-y-3">
                <p className="text-sm leading-6 text-[#75675E]">
                  Olá! Posso te ajudar a ver seu plano alimentar, sua próxima consulta, suas tarefas, e tirar dúvidas gerais sobre alimentação. Pergunte algo como &quot;qual meu café da manhã?&quot; ou &quot;quando é minha consulta?&quot;.
                </p>
                <p className="rounded-xl border border-[#E6D5C5] bg-white/70 px-3 py-2 text-[11px] leading-5 text-[#9A8B80]">
                  Este assistente usa inteligência artificial para ajudar a localizar e explicar informações do seu acompanhamento. Alterações no seu plano continuam sob responsabilidade da nutricionista.
                </p>
              </div>
            )}
            {messages.map((message, index) => (
              <div key={index} className="space-y-2">
                {message.content && (
                  <div
                    className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-6 ${
                      message.role === "user" ? "ml-auto whitespace-pre-wrap bg-[#607A56] text-white" : "bg-[#EEF3EA] text-[#3A3028]"
                    }`}
                  >
                    {message.role === "assistant" ? (
                      <ReactMarkdown components={markdownComponents}>{message.content}</ReactMarkdown>
                    ) : (
                      message.content
                    )}
                  </div>
                )}
                {message.facts && (
                  <PatientFactsCard
                    facts={message.facts}
                    onPickSlot={
                      message.facts.type === "available_slots"
                        ? (iso) => void sendMessage(`Quero marcar consulta nesse horário: ${formatDateTimeBR(iso)} (${iso})`)
                        : undefined
                    }
                  />
                )}
                {message.proposal && (
                  <PatientProposalCard
                    proposal={message.proposal}
                    onDiscard={() => discardProposal(index, message.proposal!)}
                    onConfirm={() => void confirmProposal(index, message.proposal!)}
                  />
                )}
              </div>
            ))}
            {sending && (
              <div className="flex items-center gap-2 text-xs text-[#9A8B80]">
                <Sparkles className="h-3.5 w-3.5 animate-pulse" />
                Pensando...
              </div>
            )}
            {error && (
              <div className="rounded-xl border border-[#E7C9A9] bg-white px-3 py-2 text-xs leading-5 text-[#9B6F59]">{error}</div>
            )}
          </div>

          <form
            onSubmit={(event) => {
              event.preventDefault();
              void sendMessage(input);
            }}
            className="border-t border-[#E6D5C5] bg-white/70 p-3"
          >
            <div className="flex items-center gap-2">
              <input
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="Digite sua dúvida..."
                aria-label="Mensagem para o assistente"
                className="flex-1 rounded-full border border-[#E6D5C5] bg-white px-4 py-2 text-sm text-[#3A3028] outline-none focus:border-[#607A56]"
                disabled={sending}
              />
              <button
                type="submit"
                disabled={sending || !input.trim()}
                aria-label="Enviar"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#607A56] text-white transition hover:bg-[#4F6847] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}

function PatientProposalCard({ proposal, onDiscard, onConfirm }: {
  proposal: PatientProposal;
  onDiscard: () => void;
  onConfirm: () => void;
}) {
  if (proposal.status === "discarded") {
    return <p className="rounded-xl border border-[#E6D5C5] bg-white/70 px-3 py-2 text-xs text-[#9A8B80]">Pedido cancelado.</p>;
  }
  if (proposal.status === "applied") {
    return (
      <p className="flex items-center gap-1.5 rounded-xl border border-[#D9E4D3] bg-[#EEF3EA] px-3 py-2 text-xs font-semibold text-[#4F6847]">
        <Check className="h-3.5 w-3.5" />
        Consulta marcada.
      </p>
    );
  }
  if (proposal.status === "expired") {
    return (
      <p className="rounded-xl border border-[#E7C9A9] bg-white px-3 py-2 text-xs leading-5 text-[#9B6F59]">
        Esse horário expirou. Peça novamente ao assistente.
      </p>
    );
  }

  const applying = proposal.status === "applying";

  return (
    <div className="max-w-[92%] space-y-3 rounded-2xl border border-[#E7C9A9] bg-white p-3">
      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#9B6F59]">Marcar consulta</p>
      <p className="text-sm font-semibold text-[#3A3028]">{formatDateTimeBR(proposal.startsAtIso)}</p>
      {proposal.status === "error" && proposal.error && (
        <p className="rounded-lg border border-[#F0D4C7] bg-[#FFF7F3] px-2.5 py-1.5 text-xs text-[#9B6F59]">{proposal.error}</p>
      )}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onDiscard} disabled={applying} className="rounded-full border border-[#E6D5C5] px-3 py-1.5 text-xs font-semibold text-[#75675E] transition hover:bg-[#FBF7F1] disabled:opacity-50">
          Cancelar
        </button>
        <button type="button" onClick={onConfirm} disabled={applying} className="rounded-full bg-[#607A56] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[#4F6847] disabled:cursor-not-allowed disabled:opacity-60">
          {applying ? "Marcando..." : "Confirmar"}
        </button>
      </div>
    </div>
  );
}
