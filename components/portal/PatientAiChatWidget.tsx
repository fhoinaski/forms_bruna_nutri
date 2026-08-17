"use client";

import { useEffect, useRef, useState } from "react";
import { Bot, Check, MessageSquarePlus, Send, Sparkles, X } from "lucide-react";
import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";
import { PatientFactsCard } from "@/components/portal/patient-ai-facts";
import { formatDateTimeBR } from "@/components/dashboard/ai-facts";
import type { PatientAssistantFactsPayload } from "@/lib/ai/core/patient-response";
import type { FoodAlternativeOption, PatientPortalSection } from "@/lib/ai/agents/patient/patient-portal-agent";

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

interface PatientProposalBase {
  proposalId?: string;
  expiresAt?: string;
  status: ProposalStatus;
  error?: string;
}

type PatientProposal =
  | (PatientProposalBase & { kind: "patient_appointment_request"; startsAtIso: string })
  | (PatientProposalBase & { kind: "patient_change_request"; title: string; details: string | null });

function buildPatientProposal(update: Record<string, unknown> | undefined): PatientProposal | null {
  if (!update) return null;
  const proposalId = update.proposalId as string | undefined;
  const expiresAt = update.expiresAt as string | undefined;
  if (update.kind === "patient_appointment_request") {
    return { kind: "patient_appointment_request", proposalId, expiresAt, status: "pending", startsAtIso: update.startsAtIso as string };
  }
  if (update.kind === "patient_change_request") {
    const preview = update.preview as { title?: string; details?: string | null } | undefined;
    return {
      kind: "patient_change_request", proposalId, expiresAt, status: "pending",
      title: preview?.title ?? "Solicitação para a nutricionista",
      details: preview?.details ?? null,
    };
  }
  return null;
}

type ChatMessage = {
  /** Identidade estavel da mensagem — nunca o indice do array. */
  id: string;
  role: "user" | "assistant";
  content: string;
  facts?: PatientAssistantFactsPayload;
  proposal?: PatientProposal;
};

let messageIdCounter = 0;
function createMessageId(): string {
  messageIdCounter += 1;
  return `msg_${Date.now().toString(36)}_${messageIdCounter}`;
}

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
  // Guarda sincrona contra envio concorrente — ver explicacao equivalente em
  // components/dashboard/AiChatWidget.tsx (mesmo bug, mesmo fix).
  const sendingRef = useRef(false);
  const activeRequestIdRef = useRef(0);
  const activeAbortControllerRef = useRef<AbortController | null>(null);
  // Espelho sincrono de `messages` — ver explicacao em AiChatWidget.tsx
  // (usar um updater de setState so pra "capturar" o valor numa variavel
  // local nao e garantido rodar antes da proxima linha de codigo).
  const messagesRef = useRef<ChatMessage[]>([]);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    return () => {
      activeAbortControllerRef.current?.abort();
    };
  }, []);

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
    activeRequestIdRef.current += 1;
    activeAbortControllerRef.current?.abort();
    activeAbortControllerRef.current = null;
    sendingRef.current = false;
    setSending(false);
    setMessages([]);
    setError("");
  }

  async function sendMessage(text: string) {
    const content = text.trim();
    if (!content || sendingRef.current) return;
    sendingRef.current = true;
    setSending(true);
    setError("");
    const userMessage: ChatMessage = { id: createMessageId(), role: "user", content };
    const requestId = ++activeRequestIdRef.current;
    const abortController = new AbortController();
    activeAbortControllerRef.current = abortController;
    const historyForRequest = [...messagesRef.current, userMessage];
    messagesRef.current = historyForRequest;
    setMessages(historyForRequest);
    setInput("");
    try {
      const response = await fetch("/api/portal/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: abortController.signal,
        body: JSON.stringify({
          messages: historyForRequest.slice(-MAX_HISTORY_MESSAGES_SENT).map(({ role, content: messageContent }) => ({ role, content: messageContent })),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? "Não consegui responder agora.");
      if (activeRequestIdRef.current !== requestId) return;
      const proposal = buildPatientProposal(data.proposedUpdate as Record<string, unknown> | undefined);
      messagesRef.current = [
        ...messagesRef.current,
        { id: createMessageId(), role: "assistant", content: data.reply, facts: data.facts, proposal: proposal ?? undefined },
      ];
      setMessages(messagesRef.current);
      const navigateAction = data.navigateAction as { section?: PatientPortalSection } | undefined;
      if (navigateAction?.section) scrollToSection(navigateAction.section);
    } catch (cause) {
      if (activeRequestIdRef.current !== requestId) return;
      if (cause instanceof DOMException && cause.name === "AbortError") return;
      setError(cause instanceof Error ? cause.message : "Não consegui responder agora. Tente novamente.");
    } finally {
      if (activeRequestIdRef.current === requestId) {
        sendingRef.current = false;
        setSending(false);
      }
    }
  }

  async function runQuickAction(action: (typeof QUICK_ACTIONS)[number]) {
    if (action.kind === "chat") {
      void sendMessage(action.message);
      return;
    }
    if (sendingRef.current) return;
    sendingRef.current = true;
    setSending(true);
    setError("");
    const requestId = ++activeRequestIdRef.current;
    const abortController = new AbortController();
    activeAbortControllerRef.current = abortController;
    setMessages((current) => [...current, { id: createMessageId(), role: "user", content: action.label }]);
    try {
      const response = await fetch("/api/portal/ai/quick-facts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: abortController.signal,
        body: JSON.stringify({ action: action.action }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? "Não consegui buscar essa informação agora.");
      if (activeRequestIdRef.current !== requestId) return;
      setMessages((current) => [...current, { id: createMessageId(), role: "assistant", content: "", facts: data.facts }]);
    } catch (cause) {
      if (activeRequestIdRef.current !== requestId) return;
      if (cause instanceof DOMException && cause.name === "AbortError") return;
      setError(cause instanceof Error ? cause.message : "Não consegui buscar essa informação agora.");
    } finally {
      if (activeRequestIdRef.current === requestId) {
        sendingRef.current = false;
        setSending(false);
      }
    }
  }

  function updateProposal(messageId: string, updater: (proposal: PatientProposal) => PatientProposal) {
    setMessages((current) => current.map((message) => {
      if (message.id !== messageId || !message.proposal) return message;
      return { ...message, proposal: updater(message.proposal) };
    }));
  }

  function discardProposal(messageId: string, proposal: PatientProposal) {
    updateProposal(messageId, (current) => ({ ...current, status: "discarded" }));
    if (proposal.proposalId) {
      void fetch(`/api/portal/ai/proposals/${proposal.proposalId}/cancel`, { method: "POST" }).catch(() => {});
    }
  }

  async function confirmProposal(messageId: string, proposal: PatientProposal) {
    if (!proposal.proposalId) {
      updateProposal(messageId, (current) => ({ ...current, status: "error", error: "Não foi possível confirmar. Peça novamente ao assistente." }));
      return;
    }
    updateProposal(messageId, (current) => ({ ...current, status: "applying", error: undefined }));
    try {
      const response = await fetch(`/api/portal/ai/proposals/${proposal.proposalId}/confirm`, { method: "POST" });
      const data = await response.json();
      if (!response.ok) {
        if (response.status === 410) {
          updateProposal(messageId, (current) => ({ ...current, status: "expired" }));
          return;
        }
        throw new Error(data.message ?? (proposal.kind === "patient_change_request" ? "Não foi possível enviar a solicitação." : "Não foi possível marcar a consulta."));
      }
      updateProposal(messageId, (current) => ({ ...current, status: "applied" }));
    } catch (cause) {
      updateProposal(messageId, (current) => ({
        ...current,
        status: "error",
        error: cause instanceof Error ? cause.message : (proposal.kind === "patient_change_request" ? "Não foi possível enviar a solicitação." : "Não foi possível marcar a consulta."),
      }));
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
            {messages.map((message) => {
              const facts = message.facts;
              const currentFoodForReview =
                facts?.type === "food_alternatives" && facts.data.found ? facts.data.currentFood : undefined;
              return (
              <div key={message.id} className="space-y-2">
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
                {facts && (
                  <PatientFactsCard
                    facts={facts}
                    onPickSlot={
                      facts.type === "available_slots"
                        ? (iso) => void sendMessage(`Quero marcar consulta nesse horário: ${formatDateTimeBR(iso)} (${iso})`)
                        : undefined
                    }
                    onRequestFoodReview={
                      currentFoodForReview
                        ? (alternative: FoodAlternativeOption) =>
                            void sendMessage(`Quero pedir a troca de ${currentFoodForReview} por ${alternative.descricao}.`)
                        : undefined
                    }
                  />
                )}
                {message.proposal && (
                  <PatientProposalCard
                    proposal={message.proposal}
                    onDiscard={() => discardProposal(message.id, message.proposal!)}
                    onConfirm={() => void confirmProposal(message.id, message.proposal!)}
                  />
                )}
              </div>
              );
            })}
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
        {proposal.kind === "patient_change_request" ? "Solicitação enviada para sua nutricionista." : "Consulta marcada."}
      </p>
    );
  }
  if (proposal.status === "expired") {
    return (
      <p className="rounded-xl border border-[#E7C9A9] bg-white px-3 py-2 text-xs leading-5 text-[#9B6F59]">
        Isso expirou. Peça novamente ao assistente.
      </p>
    );
  }

  const applying = proposal.status === "applying";
  const cardTitle = proposal.kind === "patient_change_request" ? proposal.title : "Marcar consulta";

  return (
    <div className="max-w-[92%] space-y-3 rounded-2xl border border-[#E7C9A9] bg-white p-3">
      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#9B6F59]">{cardTitle}</p>
      {proposal.kind === "patient_appointment_request" && (
        <p className="text-sm font-semibold text-[#3A3028]">{formatDateTimeBR(proposal.startsAtIso)}</p>
      )}
      {proposal.kind === "patient_change_request" && proposal.details && (
        <p className="text-sm text-[#3A3028]">{proposal.details}</p>
      )}
      {proposal.kind === "patient_change_request" && (
        <p className="text-[11px] italic text-[#9A8B80]">Isso não altera seu plano — só avisa sua nutricionista para revisar.</p>
      )}
      {proposal.status === "error" && proposal.error && (
        <p className="rounded-lg border border-[#F0D4C7] bg-[#FFF7F3] px-2.5 py-1.5 text-xs text-[#9B6F59]">{proposal.error}</p>
      )}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onDiscard} disabled={applying} className="rounded-full border border-[#E6D5C5] px-3 py-1.5 text-xs font-semibold text-[#75675E] transition hover:bg-[#FBF7F1] disabled:opacity-50">
          Cancelar
        </button>
        <button type="button" onClick={onConfirm} disabled={applying} className="rounded-full bg-[#607A56] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[#4F6847] disabled:cursor-not-allowed disabled:opacity-60">
          {proposal.kind === "patient_change_request"
            ? applying ? "Enviando..." : "Enviar"
            : applying ? "Marcando..." : "Confirmar"}
        </button>
      </div>
    </div>
  );
}
