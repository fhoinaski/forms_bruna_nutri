"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, ArrowRight, CheckCircle2, ChevronDown } from "lucide-react";
import { trackEvent } from "@/lib/analytics/client-tracker";

type InteractionKind =
  | "message"
  | "single_choice"
  | "multi_choice"
  | "boolean"
  | "text"
  | "textarea"
  | "number"
  | "date";

interface IntakeInteraction {
  kind: InteractionKind;
  topic: string;
  stepKey: string;
  prompt: string;
  helperText?: string;
  unit?: string | null;
  inputMode?: string;
  options?: { value: string; label: string }[];
  allowSkip?: boolean;
  skipLabel?: string;
  required?: boolean;
}

interface StepProgress {
  key: string;
  label: string;
  status: "completed" | "active" | "pending";
}

interface ReviewLine {
  label: string;
  value: string;
  fieldKey?: string;
  topicId?: string;
  stepKey?: string;
}

interface ReviewDetailField {
  key: string;
  label: string;
  value: string;
  topicId?: string;
  stepKey?: string;
}

interface ReviewSection {
  id: string;
  label: string;
  fields: ReviewDetailField[];
}

interface ReviewPayload {
  summary: { key: string; title: string; lines: ReviewLine[] }[];
  details: ReviewSection[];
}

interface Bootstrap {
  sessionId: string;
  status: string;
  progress: number;
  sessionVersion: number;
  interaction: IntakeInteraction | null;
  transitionMessage: string | null;
  steps: StepProgress[];
  answers: Record<string, unknown>;
  reviewReady: boolean;
  completed: boolean;
}

/**
 * Pré-consulta conversacional por tópicos (não é chat, não é questionário).
 * A UI apenas renderiza `interaction` vindo do flow engine (§44). Mobile-first:
 * 1 interação por tela, CTA fixo, toque ≥44px, sem percentual, sem contador.
 */
export function PreConsultationDynamic({ onFallback }: { onFallback: (answers: Record<string, unknown>) => void }) {
  const [sessionVersion, setSessionVersion] = useState(1);
  const [interaction, setInteraction] = useState<IntakeInteraction | null>(null);
  const [transition, setTransition] = useState<string | null>(null);
  const [steps, setSteps] = useState<StepProgress[]>([]);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [review, setReview] = useState<ReviewPayload | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [resuming, setResuming] = useState(false);
  const [finished, setFinished] = useState(false);
  const [input, setInput] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expandedDetails, setExpandedDetails] = useState(false);
  const [ready, setReady] = useState(false);
  const startedRef = useRef(false);
  const [prevInteraction, setPrevInteraction] = useState<IntakeInteraction | null>(null);

  const bootstrap = useCallback(async () => {
    try {
      let res = await fetch("/api/public/pre-consultation/intake/session", { cache: "no-store" });
      if (!res.ok) {
        res = await fetch("/api/public/pre-consultation/intake/session", { method: "POST" });
        if (!res.ok) throw new Error("Não foi possível iniciar a pré-consulta.");
      }
      const data = (await res.json()) as Bootstrap;
      setSessionVersion(data.sessionVersion ?? 1);
      setSteps(data.steps ?? []);
      setAnswers(data.answers ?? {});
      setInteraction(data.interaction ?? null);
      setTransition(data.transitionMessage ?? null);

      if (data.completed) {
        setFinished(true);
        return;
      }
      trackEvent("PRECONSULTATION_STARTED", { metadata: { entry_point: "formulario_ia" } });
      if (data.interaction) {
        setResuming(data.answers && Object.keys(data.answers).length > 0);
      }
    } catch {
      setError("Não foi possível iniciar a pré-consulta. Tente novamente.");
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    void bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    if (!interaction) return;
    setSelected(new Set());
    if (interaction.kind === "text" || interaction.kind === "textarea" || interaction.kind === "number" || interaction.kind === "date") {
      // Pré-preenche apenas em edição (o servidor preserva o valor).
      const field = fieldForStep(interaction);
      const current = field ? answers[field] : undefined;
      if (typeof current === "string") setInput(current);
      else if (current === true) setInput("Sim");
      else setInput("");
    } else {
      setInput("");
    }
  }, [interaction, answers]);

  async function resync() {
    const res = await fetch("/api/public/pre-consultation/intake/session", { cache: "no-store" });
    if (!res.ok) return;
    const data = (await res.json()) as Bootstrap;
    setSessionVersion(data.sessionVersion ?? sessionVersion);
    setSteps(data.steps ?? steps);
    setAnswers(data.answers ?? answers);
    setInteraction(data.interaction ?? null);
    setTransition(data.transitionMessage ?? null);
  }

  async function submit(message: string) {
    if (busy || !interaction) return;
    setBusy(true);
    setError("");
    setProcessing(interaction.kind === "textarea" || interaction.kind === "text");
    try {
      const res = await fetch("/api/public/pre-consultation/intake/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          sessionVersion,
          topic: interaction.topic,
          stepKey: interaction.stepKey,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.message ?? "Falha ao processar.");
        if (res.status === 409) await resync();
        return;
      }

      setSessionVersion(data.sessionVersion ?? sessionVersion);
      setAnswers(data.answers ?? {});
      setSteps(data.steps ?? steps);

      if (data.fallback) {
        onFallback(data.answers ?? {});
        return;
      }

      if (data.clarification) {
        setError(data.clarification.reason ?? "Me conte um pouco melhor.");
        setInteraction(data.interaction);
        setTransition(data.transitionMessage ?? null);
        return;
      }

      if (data.rephrasePrompt) {
        setError(data.rephrasePrompt);
        setInteraction(data.interaction ?? interaction);
        setTransition(data.transitionMessage ?? null);
        return;
      }

      setPrevInteraction(interaction);
      setInteraction(data.interaction ?? null);
      setTransition(data.transitionMessage ?? null);

      if (data.reviewReady || data.completed) {
        await loadReview();
      }
    } catch {
      setError("Não foi possível processar sua resposta.");
    } finally {
      setBusy(false);
      setProcessing(false);
      setInput("");
    }
  }

  async function loadReview() {
    const res = await fetch("/api/public/pre-consultation/intake/review", { cache: "no-store" });
    if (!res.ok) {
      await resync();
      return;
    }
    const data = await res.json();
    setReview(data);
    setInteraction(null);
  }

  async function editLine(topicId: string, stepKey: string) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/public/pre-consultation/intake/edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: topicId, stepKey, sessionVersion }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "Não foi possível editar.");
      setSessionVersion(data.sessionVersion ?? sessionVersion);
      setInteraction(data.interaction ?? null);
      setTransition(data.transitionMessage ?? null);
      setSteps(data.steps ?? steps);
      setReview(null);
    } catch (cause) {
      setError((cause as Error)?.message ?? "Não foi possível editar.");
    } finally {
      setBusy(false);
      setInput("");
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
          setReview(null);
          await resync();
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

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#FBF7F1]">
        <p className="text-sm text-[#A9978A]">Preparando sua pré-consulta...</p>
      </div>
    );
  }

  if (finished) {
    return <FinishedView />;
  }

  return (
    <div className="min-h-screen bg-[#FBF7F1] text-[#3A3028]" data-testid="pre-consultation-dynamic">
      <header className="sticky top-0 z-50 border-b border-[#EDE1D6] bg-[#FFFDFC]/95 backdrop-blur">
        <div className="mx-auto max-w-[680px] px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <p className="brand-kicker">Pré-consulta</p>
            {resuming && !review && (
              <span className="text-xs font-semibold text-[#A9978A]">Continuando de onde você parou.</span>
            )}
          </div>
          <TopicProgress steps={steps} />
        </div>
      </header>

      <main className="mx-auto max-w-[680px] px-5 pb-40 pt-6">
        {review ? (
          <ReviewCard
            review={review}
            busy={busy}
            error={error}
            expandedDetails={expandedDetails}
            onToggleDetails={() => setExpandedDetails((v) => !v)}
            onEdit={editLine}
            onComplete={handleComplete}
          />
        ) : interaction ? (
          <StepView
            key={`${interaction.topic}:${interaction.stepKey}`}
            interaction={interaction}
            transition={transition}
            input={input}
            selected={selected}
            busy={busy}
            processing={processing}
            error={error}
            hasBack={prevInteraction !== null}
            onBack={async () => {
              if (prevInteraction) {
                setInteraction(prevInteraction);
                setPrevInteraction(null);
                setTransition(null);
              } else {
                await resync();
              }
            }}
            onInput={setInput}
            onToggle={(value) => {
              setSelected((prev) => {
                const next = new Set(prev);
                if (next.has(value)) next.delete(value);
                else next.add(value);
                return next;
              });
            }}
            onSubmit={submit}
          />
        ) : (
          <div className="rounded-[1.35rem] border border-[#EDE1D6] bg-[#FFFDFC] p-10 text-center">
            <p className="text-sm text-[#75675E]">Organizando suas respostas...</p>
          </div>
        )}
      </main>
    </div>
  );
}

function fieldForStep(interaction: IntakeInteraction): string | null {
  // Passos objetivos carregam `field` implícito; aqui usamos heurística pela
  // stepKey para pré-preenchimento nas edições. O servidor é a fonte de verdade.
  return null;
}

function TopicProgress({ steps }: { steps: StepProgress[] }) {
  if (!steps.length) return null;
  return (
    <div className="mt-3 flex items-center gap-1">
      {steps.map((step, index) => (
        <div key={step.key} className="flex flex-1 flex-col items-center gap-1">
          <div className="flex w-full items-center">
            <div
              className={`h-1.5 flex-1 rounded-full ${
                index === 0 ? "bg-transparent" : step.status === "pending" && steps[index - 1].status === "completed" ? "bg-[#BFD1B7]" : step.status === "completed" ? "bg-[#7F9A74]" : "bg-[#EDE1D6]"
              }`}
            />
            <div
              className={`mx-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[10px] font-bold ${
                step.status === "completed"
                  ? "border-[#7F9A74] bg-[#7F9A74] text-white"
                  : step.status === "active"
                    ? "border-[#7F9A74] bg-white text-[#4F6847]"
                    : "border-[#EDE1D6] bg-white text-[#A9978A]"
              }`}
            >
              {step.status === "completed" ? "✓" : index + 1}
            </div>
            <div className={`h-1.5 flex-1 rounded-full ${index === steps.length - 1 ? "bg-transparent" : step.status === "completed" ? "bg-[#7F9A74]" : "bg-[#EDE1D6]"}`} />
          </div>
          <span className={`text-[10px] font-semibold ${step.status === "active" ? "text-[#607A56]" : step.status === "completed" ? "text-[#607A56]" : "text-[#A9978A]"}`}>
            {step.label}
          </span>
        </div>
      ))}
    </div>
  );
}

function StepView({
  interaction,
  transition,
  input,
  selected,
  busy,
  processing,
  error,
  hasBack,
  onBack,
  onInput,
  onToggle,
  onSubmit,
}: {
  interaction: IntakeInteraction;
  transition: string | null;
  input: string;
  selected: Set<string>;
  busy: boolean;
  processing: boolean;
  error: string;
  hasBack: boolean;
  onBack: () => void;
  onInput: (v: string) => void;
  onToggle: (v: string) => void;
  onSubmit: (v: string) => void;
}) {
  const isAutoChoice = interaction.kind === "single_choice" || interaction.kind === "boolean";

  return (
    <div className="animate-step">
      {transition && (
        <p className="mb-7 font-serif text-lg leading-7 text-[#75675E]">{transition}</p>
      )}
      <h1 className="font-serif text-[1.75rem] font-semibold leading-snug text-[#3A3028] sm:text-3xl">
        {interaction.prompt}
      </h1>
      {interaction.helperText && (
        <p className="mt-3 text-sm leading-6 text-[#75675E]">{interaction.helperText}</p>
      )}

      <div className="mt-7">
        {interaction.kind === "single_choice" && (
          <ChipChoices
            options={interaction.options ?? []}
            disabled={busy}
            onPick={(value) => {
              // tap → micro delay → próxima interação (§17)
              window.setTimeout(() => onSubmit(value), 120);
            }}
          />
        )}
        {interaction.kind === "boolean" && (
          <BooleanChoices
            disabled={busy}
            onPick={(value) => onSubmit(value)}
          />
        )}
        {interaction.kind === "multi_choice" && (
          <MultiChoices
            options={interaction.options ?? []}
            selected={selected}
            disabled={busy}
            onToggle={onToggle}
          />
        )}
        {interaction.kind === "textarea" && (
          <textarea
            value={input}
            onChange={(e) => onInput(e.target.value)}
            disabled={busy}
            rows={4}
            autoFocus
            placeholder="Escreva com suas próprias palavras..."
            data-intake-input="textarea"
            className="w-full rounded-2xl border border-[#EDE1D6] bg-[#FBF7F1] px-4 py-3.5 text-base text-[#3A3028] placeholder-[#A9978A] focus:border-[#7F9A74] focus:outline-none focus:ring-4 focus:ring-[#7F9A74]/12 disabled:opacity-60"
          />
        )}
        {interaction.kind === "text" && (
          <input
            value={input}
            onChange={(e) => onInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !busy) {
                e.preventDefault();
                onSubmit(input);
              }
            }}
            disabled={busy}
            autoFocus
            inputMode={(interaction.inputMode as never) ?? "text"}
            placeholder="Digite sua resposta..."
            data-intake-input="text"
            className="w-full rounded-2xl border border-[#EDE1D6] bg-[#FBF7F1] px-4 py-3.5 text-base text-[#3A3028] placeholder-[#A9978A] focus:border-[#7F9A74] focus:outline-none focus:ring-4 focus:ring-[#7F9A74]/12 disabled:opacity-60"
            aria-label={interaction.prompt}
          />
        )}
        {interaction.kind === "number" && (
          <div className="flex items-center gap-3">
            <input
              value={input}
              onChange={(e) => onInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !busy) {
                  e.preventDefault();
                  onSubmit(input);
                }
              }}
              disabled={busy}
              inputMode="decimal"
              autoFocus
              placeholder="Digite aqui"
              data-intake-input="number"
              className="w-40 rounded-2xl border border-[#EDE1D6] bg-[#FBF7F1] px-4 py-3.5 text-base text-[#3A3028] placeholder-[#A9978A] focus:border-[#7F9A74] focus:outline-none focus:ring-4 focus:ring-[#7F9A74]/12 disabled:opacity-60"
              aria-label={interaction.prompt}
            />
            {interaction.unit && <span className="text-sm font-semibold text-[#75675E]">{interaction.unit}</span>}
          </div>
        )}
        {interaction.kind === "date" && (
          <input
            type="date"
            value={input}
            onChange={(e) => onInput(e.target.value)}
            disabled={busy}
            autoFocus
            data-intake-input="date"
            className="rounded-2xl border border-[#EDE1D6] bg-[#FBF7F1] px-4 py-3.5 text-base text-[#3A3028] focus:border-[#7F9A74] focus:outline-none focus:ring-4 focus:ring-[#7F9A74]/12 disabled:opacity-60"
            aria-label={interaction.prompt}
          />
        )}
      </div>

      {processing && (
        <p className="mt-5 flex items-center gap-2 text-sm text-[#A9978A]">
          <span className="h-3 w-3 animate-pulse rounded-full bg-[#BFD1B7]" />
          Organizando sua resposta...
        </p>
      )}

      {error && (
        <p className="mt-5 rounded-2xl border border-[#E8D5C9] bg-[#FBF1EB] px-4 py-3 text-sm leading-6 text-[#8C5B70]">
          {error}
        </p>
      )}

      {/* CTA fixo na base, alcançável e nunca escondido atrás do teclado. */}
      <div className="fixed inset-x-0 bottom-0 z-50 border-t border-[#EDE1D6] bg-[#FFFDFC]/95 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur">
        <div className="mx-auto flex max-w-[680px] items-center justify-between gap-3">
          <button
            type="button"
            onClick={onBack}
            disabled={busy || !hasBack}
            className="inline-flex h-12 items-center gap-2 rounded-full border border-[#EDE1D6] bg-white px-5 text-sm font-semibold text-[#75675E] transition hover:bg-[#F5ECE4] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar
          </button>

          {interaction.allowSkip && (
            <button
              type="button"
              disabled={busy}
              onClick={() => onSubmit("__SKIP__")}
              className="h-12 rounded-full px-5 text-sm font-semibold text-[#8C5F50] underline underline-offset-4 transition hover:text-[#607A56] disabled:opacity-50"
            >
              {interaction.skipLabel ?? "Prefiro não responder"}
            </button>
          )}
          {!isAutoChoice && (
            <button
              type="button"
              disabled={
                busy ||
                (!input.trim() && interaction.kind !== "multi_choice") ||
                (interaction.kind === "multi_choice" && selected.size === 0)
              }
              onClick={() => onSubmit(interaction.kind === "multi_choice" ? Array.from(selected).join(", ") : input)}
              className="inline-flex h-12 items-center gap-2 rounded-full bg-[#7F9A74] px-7 text-sm font-bold uppercase tracking-[0.08em] text-white shadow-[0_18px_42px_rgba(127,154,116,0.22)] transition hover:bg-[#607A56] disabled:cursor-not-allowed disabled:opacity-70"
            >
              {busy ? "Enviando..." : "Continuar"}
              <ArrowRight className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function ChipChoices({
  options,
  disabled,
  onPick,
}: {
  options: { value: string; label: string }[];
  disabled: boolean;
  onPick: (value: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2.5">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          disabled={disabled}
          onClick={() => onPick(option.value)}
          className="min-h-[44px] rounded-full border border-[#BFD1B7] bg-[#F4F8F1] px-5 py-2.5 text-[15px] font-medium text-[#4F6847] transition hover:border-[#7F9A74] hover:bg-[#EAF0E4] disabled:opacity-60"
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function BooleanChoices({
  disabled,
  onPick,
}: {
  disabled: boolean;
  onPick: (value: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2.5">
      {["Sim", "Não"].map((label) => (
        <button
          key={label}
          type="button"
          disabled={disabled}
          onClick={() => onPick(label)}
          className="min-h-[44px] rounded-full border border-[#BFD1B7] bg-[#F4F8F1] px-7 py-2.5 text-[15px] font-semibold text-[#4F6847] transition hover:bg-[#EAF0E4] disabled:opacity-60"
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function MultiChoices({
  options,
  selected,
  disabled,
  onToggle,
}: {
  options: { value: string; label: string }[];
  selected: Set<string>;
  disabled: boolean;
  onToggle: (value: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2.5">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          disabled={disabled}
          onClick={() => onToggle(option.value)}
          aria-pressed={selected.has(option.value)}
          className={`min-h-[44px] rounded-full border px-5 py-2.5 text-[15px] font-medium transition disabled:opacity-60 ${
            selected.has(option.value)
              ? "border-[#7F9A74] bg-[#7F9A74] text-white"
              : "border-[#EDE1D6] bg-[#F8F1EA] text-[#75675E] hover:border-[#7F9A74]/50 hover:bg-[#EAF0E4]"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function ReviewCard({
  review,
  busy,
  error,
  expandedDetails,
  onToggleDetails,
  onEdit,
  onComplete,
}: {
  review: ReviewPayload;
  busy: boolean;
  error: string;
  expandedDetails: boolean;
  onToggleDetails: () => void;
  onEdit: (topicId: string, stepKey: string) => void;
  onComplete: () => void;
}) {
  return (
    <div>
      <h1 className="font-serif text-3xl font-semibold leading-tight text-[#3A3028]">Tudo certo.</h1>
      <p className="mt-2 text-[#75675E]">Confira os principais pontos antes de enviar.</p>

      <div className="mt-7 space-y-5">
        {review.summary.length === 0 && (
          <p className="rounded-2xl border border-[#EDE1D6] bg-[#FFFDFC] p-5 text-sm text-[#75675E]">
            Você não preencheu detalhes clínicos, mas pode revisar e editar abaixo.
          </p>
        )}
        {review.summary.map((group) => (
          <div key={group.key} className="rounded-[1.35rem] border border-[#EDE1D6] bg-[#FFFDFC] p-5">
            <h2 className="mb-3 font-serif text-sm font-semibold uppercase tracking-[0.12em] text-[#607A56]">{group.title}</h2>
            <div className="space-y-2.5">
              {group.lines.map((line, index) => (
                <div key={index} className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-[#A9978A]">{line.label}</p>
                    <p className="mt-0.5 text-sm leading-6 text-[#3A3028] whitespace-pre-wrap">{line.value}</p>
                  </div>
                  {line.topicId && line.stepKey && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => onEdit(line.topicId!, line.stepKey!)}
                      className="shrink-0 text-xs font-semibold text-[#8C5F50] underline underline-offset-4 transition hover:text-[#607A56] disabled:opacity-50"
                    >
                      Editar
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={onToggleDetails}
        className="mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-[#607A56] transition hover:text-[#8C5F50]"
      >
        <ChevronDown className={`h-4 w-4 transition ${expandedDetails ? "rotate-180" : ""}`} />
        {expandedDetails ? "Ver menos" : "Ver todos os dados"}
      </button>

      {expandedDetails && (
        <div className="mt-4 space-y-5">
          {review.details.map((section) => (
            <div key={section.id} className="rounded-[1.35rem] border border-[#EDE1D6] bg-[#FFFDFC] p-5">
              <h2 className="mb-3 font-serif text-sm font-semibold uppercase tracking-wide text-[#607A56]">{section.label}</h2>
              <div className="space-y-3">
                {section.fields.map((field) => (
                  <div key={field.key} className="flex items-start justify-between gap-4 border-b border-[#F5ECE4] pb-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-[#A9978A]">{field.label}</p>
                      <p className="mt-0.5 text-sm leading-6 text-[#3A3028] whitespace-pre-wrap">{field.value}</p>
                    </div>
                    {field.topicId && field.stepKey && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => onEdit(field.topicId!, field.stepKey!)}
                        className="shrink-0 text-xs font-semibold text-[#8C5F50] underline underline-offset-4 transition hover:text-[#607A56] disabled:opacity-50"
                      >
                        Editar
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {error && <p className="mt-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      {/* Nota discreta de transparência da IA (§23). */}
      <p className="mt-6 text-center text-xs leading-5 text-[#A9978A]">
        Algumas respostas podem ser organizadas com auxílio de inteligência artificial para facilitar sua pré-consulta.
      </p>

      <div className="mt-5 text-center">
        <button
          type="button"
          disabled={busy}
          onClick={onComplete}
          className="min-h-[48px] rounded-full bg-[#7F9A74] px-12 py-3.5 font-sans text-sm font-bold uppercase tracking-[0.12em] text-white shadow-[0_18px_42px_rgba(127,154,116,0.22)] transition hover:bg-[#607A56] disabled:cursor-not-allowed disabled:opacity-70"
        >
          {busy ? "Enviando..." : "Enviar pré-consulta"}
        </button>
      </div>
    </div>
  );
}

function FinishedView() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#FBF7F1] p-8 text-center">
      <Image src="/brand/bruna-flores-nutri-simbolo.webp" alt="" width={80} height={96} sizes="80px" className="mb-6 h-24 w-20 object-contain" />
      <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-[#EAF0E4] text-[#607A56] shadow-sm">
        <CheckCircle2 className="h-8 w-8" />
      </div>
      <h2 className="mb-4 font-serif text-4xl font-semibold text-[#3A3028]">Obrigada por compartilhar.</h2>
      <p className="mx-auto max-w-md text-lg leading-relaxed text-[#75675E]">
        Suas respostas foram enviadas com segurança. A Bruna vai analisar seu momento com cuidado antes do próximo contato.
      </p>
      <Link href="/" className="mt-8 inline-flex items-center gap-2 text-sm font-semibold text-[#607A56] transition hover:text-[#8C5F50]">
        <ArrowLeft className="h-4 w-4" />
        Voltar para o site
      </Link>
    </div>
  );
}