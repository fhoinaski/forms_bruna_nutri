"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, CheckCircle2 } from "lucide-react";

type IntakeFieldType = "text" | "textarea" | "number" | "date" | "single_choice" | "multiple_choice" | "boolean";

interface IntakeFieldView {
  key: string;
  section: string;
  type: IntakeFieldType;
  label: string;
  conversationalPrompt: string;
  required: boolean;
  sensitive: boolean;
  unit: string | null;
  options: { value: string; label: string }[];
}

interface IntakeReviewSection {
  id: string;
  label: string;
  fields: { key: string; label: string; value: string }[];
}

interface FallbackHandler {
  (answers: Record<string, unknown>): void;
}

export function PreConsultationIntake({ onFallback }: { onFallback: FallbackHandler }) {
  const [sessionVersion, setSessionVersion] = useState<number>(1);
  const [currentField, setCurrentField] = useState<IntakeFieldView | null>(null);
  const [messages, setMessages] = useState<{ role: "assistant" | "user"; content: string }[]>([]);
  const [input, setInput] = useState("");
  const [selectedOptions, setSelectedOptions] = useState<Set<string>>(new Set());
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<string>("active");
  const [review, setReview] = useState<{ sections: IntakeReviewSection[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [finished, setFinished] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, currentField, review, scrollToBottom]);

  // Resume / start session
  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      try {
        let res = await fetch("/api/public/pre-consultation/intake/session", { cache: "no-store" });
        if (!res.ok) {
          // Sem sessão ainda → cria.
          res = await fetch("/api/public/pre-consultation/intake/session", { method: "POST" });
          if (!res.ok) throw new Error("Não foi possível iniciar a pré-consulta guiada.");
        }
        const data = await res.json();
        if (cancelled) return;

        setSessionVersion(data.sessionVersion ?? 1);
        setProgress(data.progress ?? 0);
        setStatus(data.status ?? "active");
        setCurrentField(data.nextField ?? null);

        if (data.status === "completed" && data.completedSubmissionId) {
          setFinished(true);
          return;
        }

        if (!data.nextField && data.status === "review") {
          const reviewRes = await fetch("/api/public/pre-consultation/intake/review", { cache: "no-store" }).catch(() => null);
          if (reviewRes?.ok) {
            const reviewData = await reviewRes.json();
            if (!cancelled) {
              setReview(reviewData);
              setStatus("review");
              setSessionVersion(data.sessionVersion ?? 1);
            }
          } else if (!cancelled) {
            setError("Não foi possível carregar a revisão.");
          }
        } else if (data.nextField) {
          setMessages([
            {
              role: "assistant",
              content: `Olá! Vou ajudar você a preencher sua pré-consulta. ${data.nextField.conversationalPrompt}`,
            },
          ]);
        }
      } catch {
        if (!cancelled) setError("Não foi possível iniciar a pré-consulta guiada. Tente o formulário tradicional.");
      }
    }

    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, []);

  async function loadReview(version: number) {
    const res = await fetch("/api/public/pre-consultation/intake/review", { cache: "no-store" });
    if (!res.ok) {
      setError("Não foi possível carregar a revisão.");
      return;
    }
    const data = await res.json();
    setReview(data);
    setStatus("review");
    setSessionVersion(version);
    setMessages((prev) => [
      ...prev,
      { role: "assistant", content: "Concluímos a coleta! Confira suas informações abaixo." },
    ]);
  }

  async function switchToReview(version: number) {
    // O backend já está em "review" quando nextField era nulo; chama review.
    await loadReview(version);
  }

  function handleFieldChoice(option: string) {
    if (currentField?.type === "multiple_choice") {
      const next = new Set(selectedOptions);
      if (next.has(option)) next.delete(option);
      else next.add(option);
      setSelectedOptions(next);
      return;
    }
    setInput(option);
    void sendMessage(option);
  }

  function handleBooleanChoice(value: boolean) {
    void sendMessage(value ? "Sim" : "Não");
  }

  async function sendMessage(message: string) {
    if (busy || status === "completed") return;
    setBusy(true);
    setError("");
    const text = message.trim();
    if (!text) {
      setBusy(false);
      return;
    }
    setMessages((prev) => [...prev, { role: "user", content: text }]);

    try {
      const res = await fetch("/api/public/pre-consultation/intake/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, sessionVersion }),
      });
      const data = await res.json();

      if (!res.ok) {
        if (data.message) setError(data.message);
        throw new Error(data.message ?? "Falha ao processar.");
      }

      setSessionVersion(data.sessionVersion ?? sessionVersion);
      setProgress(data.progress ?? progress);
      setStatus(data.status ?? status);
      setSelectedOptions(new Set());

      if (data.fallback) {
        onFallback(data.answers ?? {});
        return;
      }

      setMessages((prev) => [...prev, { role: "assistant", content: data.message ?? "" }]);

      if (data.completed) {
        setCurrentField(null);
        await switchToReview(data.sessionVersion ?? sessionVersion);
      } else {
        setCurrentField(data.nextField ?? null);
      }
    } catch (cause) {
      if ((cause as Error)?.message) setError((cause as Error).message);
    } finally {
      setBusy(false);
      setInput("");
    }
  }

  async function handleSubmit() {
    const text =
      currentField?.type === "multiple_choice"
        ? Array.from(selectedOptions).join(", ")
        : input;
    if (!text) return;
    await sendMessage(text);
  }

  async function handleEdit(fieldKey: string) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/public/pre-consultation/intake/edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ field: fieldKey, sessionVersion }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "Não foi possível editar.");
      setSessionVersion(data.sessionVersion ?? sessionVersion);
      setProgress(data.progress ?? progress);
      setCurrentField(data.field ?? null);
      setReview(null);
      setStatus("active");
      setInput("");
      setSelectedOptions(new Set());
    } catch (cause) {
      setError((cause as Error)?.message ?? "Não foi possível editar.");
    } finally {
      setBusy(false);
    }
  }

  async function handleComplete() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/public/pre-consultation/intake/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionVersion }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.missingRequiredFields?.length) {
          // Faltam obrigatórios: sai da revisão e volta a preencher.
          setReview(null);
          setStatus("active");
          await resyncSession();
          setError(data.message ?? "Revise as informações obrigatórias.");
          return;
        }
        throw new Error(data.message ?? "Não foi possível enviar.");
      }
      setFinished(true);
    } catch (cause) {
      setError((cause as Error)?.message ?? "Não foi possível enviar.");
    } finally {
      setBusy(false);
    }
  }

  async function resyncSession() {
    const res = await fetch("/api/public/pre-consultation/intake/session", { cache: "no-store" });
    if (!res.ok) return;
    const data = await res.json();
    setSessionVersion(data.sessionVersion ?? sessionVersion);
    setProgress(data.progress ?? progress);
    setStatus(data.status ?? status);
    setCurrentField(data.nextField ?? null);
  }

  function renderControl() {
    if (!currentField || status === "completed" || status === "review") return null;

    switch (currentField.type) {
      case "single_choice":
        return (
          <div className="flex flex-wrap gap-2 pt-1">
            {currentField.options.map((option) => (
              <button
                key={option.value}
                type="button"
                disabled={busy}
                onClick={() => handleFieldChoice(option.value)}
                className="rounded-full border border-[#BFD1B7] bg-[#F4F8F1] px-4 py-2.5 text-sm font-medium text-[#4F6847] transition hover:border-[#7F9A74] hover:bg-[#EAF0E4] disabled:opacity-60"
              >
                {option.label}
              </button>
            ))}
          </div>
        );
      case "multiple_choice":
        return (
          <div className="flex flex-col gap-2 pt-1">
            {currentField.options.map((option) => (
              <label key={option.value} className="flex items-center gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={selectedOptions.has(option.value)}
                  onChange={() => handleFieldChoice(option.value)}
                  className="h-5 w-5 rounded accent-[#607A56]"
                />
                {option.label}
              </label>
            ))}
          </div>
        );
      case "boolean":
        return (
          <div className="flex gap-2 pt-1">
            <button type="button" disabled={busy} onClick={() => handleBooleanChoice(true)}
              className="rounded-full border border-[#BFD1B7] bg-[#F4F8F1] px-6 py-2.5 text-sm font-semibold text-[#4F6847] transition hover:bg-[#EAF0E4] disabled:opacity-60">
              Sim
            </button>
            <button type="button" disabled={busy} onClick={() => handleBooleanChoice(false)}
              className="rounded-full border border-[#EDE1D6] bg-[#FFFDFC] px-6 py-2.5 text-sm font-semibold text-[#75675E] transition hover:bg-[#F5ECE4] disabled:opacity-60">
              Não
            </button>
          </div>
        );
      case "textarea":
        return (
          <div className="pt-1">
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              disabled={busy}
              rows={4}
              placeholder="Escreva com suas próprias palavras..."
              className="w-full resize-y rounded-xl border border-[#EDE1D6] bg-[#FBF7F1] px-4 py-3 text-base text-[#3A3028] placeholder-[#A9978A] focus:border-[#7F9A74] focus:outline-none focus:ring-4 focus:ring-[#7F9A74]/12 disabled:opacity-60"
            />
          </div>
        );
      case "number":
        return (
          <div className="flex items-center gap-3 pt-1">
            <input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              disabled={busy}
              inputMode="decimal"
              placeholder="Digite aqui"
              className="w-32 rounded-xl border border-[#EDE1D6] bg-[#FBF7F1] px-4 py-3 text-base text-[#3A3028] placeholder-[#A9978A] focus:border-[#7F9A74] focus:outline-none focus:ring-4 focus:ring-[#7F9A74]/12 disabled:opacity-60"
              aria-label={currentField.label}
            />
            {currentField.unit && <span className="text-sm font-semibold text-[#75675E]">{currentField.unit}</span>}
          </div>
        );
      case "date":
        return (
          <div className="pt-1">
            <input
              type="date"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              disabled={busy}
              className="rounded-xl border border-[#EDE1D6] bg-[#FBF7F1] px-4 py-3 text-base text-[#3A3028] focus:border-[#7F9A74] focus:outline-none focus:ring-4 focus:ring-[#7F9A74]/12 disabled:opacity-60"
              aria-label={currentField.label}
            />
          </div>
        );
      default:
        return (
          <div className="flex items-center gap-2 pt-1">
            <input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !busy) {
                  event.preventDefault();
                  void handleSubmit();
                }
              }}
              disabled={busy}
              className="flex-1 rounded-xl border border-[#EDE1D6] bg-[#FBF7F1] px-4 py-3 text-base text-[#3A3028] placeholder-[#A9978A] focus:border-[#7F9A74] focus:outline-none focus:ring-4 focus:ring-[#7F9A74]/12 disabled:opacity-60"
              placeholder="Digite sua resposta..."
              aria-label={currentField.label}
            />
            {currentField.unit && <span className="text-sm font-semibold text-[#75675E]">{currentField.unit}</span>}
          </div>
        );
    }
  }

  if (finished) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#FBF7F1] p-8 text-center">
        <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-[#EAF0E4] text-[#607A56]">
          <CheckCircle2 className="h-8 w-8" />
        </div>
        <h2 className="mb-4 font-serif text-4xl font-semibold text-[#3A3028]">Pré-consulta enviada.</h2>
        <p className="mx-auto max-w-md text-lg leading-relaxed text-[#75675E]">
          Suas respostas foram registradas com segurança e serão revisadas pela nutricionista.
        </p>
        <Link href="/" className="mt-8 inline-flex items-center gap-2 text-sm font-semibold text-[#607A56] transition hover:text-[#8C5F50]">
          <ArrowLeft className="h-4 w-4" />
          Voltar ao site
        </Link>
      </div>
    );
  }

  if (review) {
    return (
      <div className="mx-auto max-w-3xl px-5 py-12 pb-24">
        <h1 className="font-serif text-4xl font-semibold text-[#3A3028]">Confira suas informações</h1>
        <p className="mt-3 text-[#75675E]">Revise cada seção. Você pode editar qualquer resposta antes de enviar.</p>

        <div className="mt-8 space-y-6">
          {review.sections.map((section) => (
            <div key={section.id} className="rounded-[1.35rem] border border-[#EDE1D6] bg-[#FFFDFC] p-6">
              <h2 className="mb-4 font-serif text-xl font-semibold uppercase tracking-wide text-[#607A56]">{section.label}</h2>
              <div className="space-y-3">
                {section.fields.map((field) => (
                  <div key={field.key} className="flex items-start justify-between gap-4 border-b border-[#F5ECE4] pb-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-[#A9978A]">{field.label}</p>
                      <p className="mt-1 text-sm leading-6 text-[#3A3028]">{field.value}</p>
                    </div>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => handleEdit(field.key)}
                      className="shrink-0 text-xs font-semibold text-[#8C5F50] underline underline-offset-4 transition hover:text-[#607A56] disabled:opacity-50"
                    >
                      Editar
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {error && <p className="mt-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

        <div className="mt-10 text-center">
          <button
            type="button"
            disabled={busy}
            onClick={handleComplete}
            className="rounded-full bg-[#7F9A74] px-12 py-4 font-sans text-sm font-bold uppercase tracking-[0.12em] text-white shadow-[0_18px_42px_rgba(127,154,116,0.22)] transition hover:bg-[#607A56] disabled:cursor-not-allowed disabled:opacity-70"
          >
            {busy ? "Enviando..." : "Confirmar e enviar pré-consulta"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-[#FBF7F1]">
      <div className="sticky top-0 z-50 border-b border-[#EDE1D6] bg-[#FFFDFC]/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#A9978A]">Pré-consulta</p>
            <p className="font-serif text-lg font-semibold text-[#3A3028]">{progress}%</p>
          </div>
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-[#EDE1D6]">
            <div className="h-full rounded-full bg-gradient-to-r from-[#7F9A74] to-[#E8C5BD] transition-all duration-500" style={{ width: `${progress}%` }} />
          </div>
        </div>
      </div>

      <div ref={scrollRef} className="mx-auto w-full max-w-3xl flex-1 space-y-4 overflow-y-auto px-4 py-6">
        {messages.map((message, index) => (
          <div key={index} className={`flex ${message.role === "assistant" ? "justify-start" : "justify-end"}`}>
            <div
              className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm leading-6 ${
                message.role === "assistant"
                  ? "border border-[#EDE1D6] bg-[#FFFDFC] text-[#3A3028]"
                  : "bg-[#7F9A74] text-white"
              }`}
            >
              {message.content}
            </div>
          </div>
        ))}

        {currentField && (
          <div className="rounded-2xl border border-[#D9E4D3] bg-[#F4F8F1]/60 p-4" data-intake-field={currentField.key} data-intake-field-type={currentField.type}>
            <p className="text-sm font-semibold text-[#3A3028]">{currentField.conversationalPrompt}</p>
            {currentField.required && <span className="text-xs font-semibold text-[#8C5B70]"> *obrigatório</span>}
            {renderControl()}
            {(currentField.type === "text" || currentField.type === "textarea" || currentField.type === "number" || currentField.type === "date" || currentField.type === "multiple_choice") && (
              <div className="mt-3 flex justify-end">
                <button
                  type="button"
                  disabled={busy || !input.trim()}
                  onClick={handleSubmit}
                  className="inline-flex items-center gap-2 rounded-full bg-[#7F9A74] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#607A56] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {busy ? "Enviando..." : "Enviar"} <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>
        )}

        {error && <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
      </div>
    </div>
  );
}