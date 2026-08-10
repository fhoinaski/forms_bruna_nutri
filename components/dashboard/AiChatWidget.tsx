"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bot, Send, Sparkles, X } from "lucide-react";
import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";
import { SUGGESTED_CHAT_PROMPTS } from "@/lib/ai/system-chat-knowledge";

const INTRO_SHOWN_KEY = "bruna_nutri_ai_chat_intro_shown";

// Estilo compacto para markdown dentro de uma bolha de chat pequena — nao
// usa a classe "prose" porque o plugin de tipografia do Tailwind nao esta
// registrado no projeto, e o espacamento padrao dele seria grande demais
// para uma bolha de chat de qualquer forma.
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

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export function AiChatWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const panelRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (window.localStorage.getItem(INTRO_SHOWN_KEY)) return;
    window.localStorage.setItem(INTRO_SHOWN_KEY, "1");
    setOpen(true);
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

  async function sendMessage(text: string) {
    const content = text.trim();
    if (!content || sending) return;
    setError("");
    const nextMessages: ChatMessage[] = [...messages, { role: "user", content }];
    setMessages(nextMessages);
    setInput("");
    setSending(true);
    try {
      const response = await fetch("/api/admin/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: nextMessages }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? "Não foi possível responder agora.");
      setMessages([...nextMessages, { role: "assistant", content: data.reply }]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível responder agora.");
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label="Assistente do sistema"
        className="fixed bottom-5 right-5 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-[#7F9A74] text-white shadow-[0_12px_32px_rgba(127,154,116,0.4)] transition hover:bg-[#607A56] print:hidden"
      >
        {open ? <X className="h-6 w-6" /> : <Bot className="h-6 w-6" />}
      </button>

      {open && (
        <div
          ref={panelRef}
          className="fixed bottom-24 right-5 z-40 flex h-[min(32rem,70vh)] w-[calc(100vw-2.5rem)] max-w-96 flex-col overflow-hidden rounded-2xl border border-[#EDE1D6] bg-[#FFFDFC] shadow-2xl"
        >
          <div className="flex items-center justify-between gap-3 border-b border-[#EDE1D6] bg-[#FBF7F1] px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#EAF0E4] text-[#607A56]"><Bot className="h-4 w-4" /></span>
              <div>
                <p className="text-sm font-semibold text-[#3A3028]">Assistente do sistema</p>
                <p className="text-[11px] text-[#8A7B70]">Ajuda a usar o dashboard</p>
              </div>
            </div>
            <button type="button" onClick={() => setOpen(false)} aria-label="Fechar" className="rounded-full p-1 text-[#8C6E52] hover:bg-white">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
            {messages.length === 0 && (
              <div className="space-y-3">
                <p className="text-sm leading-6 text-[#75675E]">
                  Olá! Sou o assistente do sistema — posso explicar como usar qualquer tela ou funcionalidade do dashboard. Não dou orientação clínica, só ajudo a usar o sistema.
                </p>
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#8C6E52]">Perguntas rápidas</p>
                <div className="flex flex-wrap gap-2">
                  {SUGGESTED_CHAT_PROMPTS.map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      onClick={() => void sendMessage(prompt)}
                      className="rounded-full border border-[#D9E4D3] bg-white px-3 py-1.5 text-left text-xs text-[#4F6847] transition hover:bg-[#EAF0E4]"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((message, index) => (
              <div
                key={index}
                className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-6 ${
                  message.role === "user"
                    ? "ml-auto whitespace-pre-wrap bg-[#7F9A74] text-white"
                    : "bg-[#F4F8F1] text-[#3A3028]"
                }`}
              >
                {message.role === "assistant" ? (
                  <ReactMarkdown components={markdownComponents}>{message.content}</ReactMarkdown>
                ) : (
                  message.content
                )}
              </div>
            ))}
            {sending && (
              <div className="flex items-center gap-2 text-xs text-[#8A7B70]">
                <Sparkles className="h-3.5 w-3.5 animate-pulse" />
                Pensando...
              </div>
            )}
            {error && (
              <div className="rounded-xl border border-[#EAD8C2] bg-white px-3 py-2 text-xs leading-5 text-[#8C5F50]">
                {error}
                {error.toLowerCase().includes("configur") && (
                  <>
                    {" "}
                    <Link href="/dashboard/settings/ai" className="font-semibold underline" onClick={() => setOpen(false)}>
                      Abrir configurações
                    </Link>
                  </>
                )}
              </div>
            )}
          </div>

          <form
            onSubmit={(event) => {
              event.preventDefault();
              void sendMessage(input);
            }}
            className="flex items-center gap-2 border-t border-[#EDE1D6] bg-[#FBF7F1] p-3"
          >
            <input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Digite sua dúvida sobre o sistema..."
              className="flex-1 rounded-full border border-[#EDE1D6] bg-white px-4 py-2 text-sm text-[#3A3028] outline-none focus:border-[#7F9A74]"
              disabled={sending}
            />
            <button
              type="submit"
              disabled={sending || !input.trim()}
              aria-label="Enviar"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#7F9A74] text-white transition hover:bg-[#607A56] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
        </div>
      )}
    </>
  );
}
