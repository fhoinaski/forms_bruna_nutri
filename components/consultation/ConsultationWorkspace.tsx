"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  Clock,
  FileText,
  RefreshCw,
  Save,
  Utensils,
} from "lucide-react";
import { ConsultationCopilot } from "@/components/consultation/ConsultationCopilot";
import { ClinicalMealPlanPreAnalysis } from "@/components/consultation/ClinicalMealPlanPreAnalysis";
import { ConsultationFinishDialog } from "@/components/consultation/ConsultationFinishDialog";
import type {
  ConsultationWorkspaceDraft,
  PatientConsultationWorkspaceViewModel,
} from "@/lib/repositories/patient-consultation-workspace";
import { getAnthropometryHref, getMealPlanHref, getProtocolHref, getScheduleReturnHref } from "@/lib/patient-record/navigation";

const DRAFT_FIELDS: Array<{ key: keyof ConsultationWorkspaceDraft; label: string; hint: string; rows: number }> = [
  { key: "evolution", label: "Evolução desde a última consulta", hint: "Mudanças clínicas, rotina, apetite, energia, evolução do objetivo.", rows: 4 },
  { key: "adherence", label: "Adesão", hint: "Adesão ao plano, dificuldades práticas, refeições fora da rotina.", rows: 3 },
  { key: "symptoms", label: "Sintomas e queixas", hint: "Sintomas digestivos, sono, ciclo, sinais de alerta ou desconfortos.", rows: 3 },
  { key: "conduct", label: "Conduta", hint: "Decisões tomadas durante a consulta e orientações combinadas.", rows: 4 },
  { key: "goals", label: "Metas", hint: "Metas de curto prazo e combinados para o próximo retorno.", rows: 3 },
  { key: "observations", label: "Observações livres", hint: "Notas adicionais exatamente como registradas pela nutricionista.", rows: 4 },
];

const CONSULTATION_STEPS = [
  { id: "resumo", label: "Resumo", description: "Contexto clínico e pendências" },
  { id: "mudancas", label: "Mudanças", description: "Desde o último atendimento" },
  { id: "anamnese", label: "Anamnese", description: "Prontuário e informações faltantes" },
  { id: "antropometria", label: "Antropometria", description: "Avaliação e evolução" },
  { id: "plano", label: "Plano", description: "Plano alimentar existente" },
  { id: "recomendacoes", label: "Recomendações", description: "Conduta e metas" },
  { id: "retorno", label: "Retorno", description: "Agenda e próximos passos" },
] as const;

type ConsultationStep = typeof CONSULTATION_STEPS[number]["id"];

function isConsultationStep(value: string | null): value is ConsultationStep {
  return CONSULTATION_STEPS.some((step) => step.id === value);
}

type SaveStatus = "idle" | "dirty" | "saving" | "saved" | "error";

function formatDate(value: string | null | undefined, options: Intl.DateTimeFormatOptions = { day: "2-digit", month: "2-digit", year: "numeric" }) {
  if (!value) return "Sem data";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Sem data";
  return date.toLocaleDateString("pt-BR", options);
}

function formatDateTime(value: string | null | undefined) {
  return formatDate(value, { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function formatWeight(value: number | null | undefined) {
  return typeof value === "number" ? `${value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} kg` : "Sem avaliação registrada";
}

function statusLabel(status: string) {
  if (status === "in_progress") return "Em atendimento";
  if (status === "completed") return "Finalizada";
  if (status === "cancelled") return "Cancelada";
  return status;
}

function saveLabel(status: SaveStatus) {
  if (status === "dirty") return "Alterações não salvas";
  if (status === "saving") return "Salvando";
  if (status === "saved") return "Salvo";
  if (status === "error") return "Não foi possível salvar";
  return "";
}

function isSameDraft(a: ConsultationWorkspaceDraft, b: ConsultationWorkspaceDraft) {
  return DRAFT_FIELDS.every((field) => a[field.key] === b[field.key]);
}

function ContextCard({ label, value, detail, action }: { label: string; value: string; detail?: string | null; action?: ReactNode }) {
  return (
    <div className="rounded-lg border border-[#EDE1D6] bg-[#FFFDFC] p-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#8C6E52]">{label}</p>
      <p className="mt-1 text-sm font-semibold text-[#3A3028]">{value}</p>
      {detail && <p className="mt-1 text-xs leading-5 text-[#75675E]">{detail}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function ConsultationWorkspace({ clientId }: { clientId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("sessionId");
  const requestedStep = searchParams.get("step");
  const activeStep: ConsultationStep = isConsultationStep(requestedStep) ? requestedStep : "resumo";
  const [workspace, setWorkspace] = useState<PatientConsultationWorkspaceViewModel | null>(null);
  const [draft, setDraft] = useState<ConsultationWorkspaceDraft | null>(null);
  const [lastSavedDraft, setLastSavedDraft] = useState<ConsultationWorkspaceDraft | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [actionError, setActionError] = useState("");
  const [showFinish, setShowFinish] = useState(false);
  const [finished, setFinished] = useState(false);
  const [pendingCopilotMessage, setPendingCopilotMessage] = useState<string | null>(null);

  const consultation = workspace?.consultation ?? null;
  const dirty = useMemo(() => Boolean(draft && lastSavedDraft && !isSameDraft(draft, lastSavedDraft)), [draft, lastSavedDraft]);

  async function loadWorkspace(explicitSessionId = sessionId) {
    setLoading(true);
    setLoadError("");
    try {
      const params = explicitSessionId ? `?sessionId=${encodeURIComponent(explicitSessionId)}` : "";
      const response = await fetch(`/api/admin/clients/${clientId}/consultation${params}`, { cache: "no-store" });
      if (!response.ok) throw new Error("Não foi possível carregar a consulta.");
      const data = (await response.json()) as { workspace: PatientConsultationWorkspaceViewModel };
      setWorkspace(data.workspace);
      const nextDraft = data.workspace.consultation?.draft ?? null;
      setDraft(nextDraft);
      setLastSavedDraft(nextDraft);
      setSaveStatus("idle");
    } catch {
      setLoadError("Não foi possível carregar a consulta.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadWorkspace(sessionId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, sessionId]);

  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  function guardNavigation(next: () => void) {
    if (dirty && !window.confirm("Existem alterações não salvas nesta consulta. Sair sem salvar?")) return;
    next();
  }

  function selectStep(step: ConsultationStep) {
    const params = new URLSearchParams();
    const currentSessionId = sessionId ?? consultation?.id;
    if (currentSessionId) params.set("sessionId", currentSessionId);
    params.set("step", step);
    guardNavigation(() => router.push(`/dashboard/clients/${clientId}/consulta?${params.toString()}`));
  }

  async function startSession() {
    setActionError("");
    const response = await fetch(`/api/admin/clients/${clientId}/consultation`, { method: "POST" });
    const data = await response.json().catch(() => null) as { workspace?: PatientConsultationWorkspaceViewModel; message?: string } | null;
    if (!response.ok || !data?.workspace?.consultation) {
      setActionError(data?.message ?? "Não foi possível iniciar a consulta.");
      return;
    }
    setWorkspace(data.workspace);
    setDraft(data.workspace.consultation.draft);
    setLastSavedDraft(data.workspace.consultation.draft);
    router.replace(`/dashboard/clients/${clientId}/consulta?sessionId=${data.workspace.consultation.id}`);
  }

  async function save() {
    if (!consultation || !draft || !consultation.canEdit) return false;
    setSaveStatus("saving");
    setActionError("");
    try {
      const response = await fetch(`/api/admin/consultation-sessions/${consultation.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, draft }),
      });
      const result = await response.json().catch(() => null) as { message?: string } | null;
      if (!response.ok) throw new Error(result?.message);
      setLastSavedDraft(draft);
      setSaveStatus("saved");
      return true;
    } catch (error) {
      setSaveStatus("error");
      setActionError(error instanceof Error && error.message ? error.message : "Não foi possível salvar. Tente novamente.");
      return false;
    }
  }

  function updateDraft(key: keyof ConsultationWorkspaceDraft, value: string) {
    setDraft((current) => {
      if (!current) return current;
      const next = { ...current, [key]: value };
      setSaveStatus(lastSavedDraft && isSameDraft(next, lastSavedDraft) ? "idle" : "dirty");
      return next;
    });
  }

  async function openFinish() {
    if (dirty) {
      const saved = await save();
      if (!saved) return;
    }
    setShowFinish(true);
  }

  if (loading) {
    return (
      <div className="space-y-4 p-4 sm:p-6" aria-label="Carregando consulta">
        <div className="h-24 animate-pulse rounded-lg border border-[#EDE1D6] bg-[#FBF7F1]" />
        <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
          <div className="h-80 animate-pulse rounded-lg border border-[#EDE1D6] bg-[#FBF7F1]" />
          <div className="h-96 animate-pulse rounded-lg border border-[#EDE1D6] bg-[#FBF7F1]" />
        </div>
      </div>
    );
  }

  if (loadError || !workspace) {
    return (
      <div className="mx-auto mt-10 max-w-md rounded-lg border border-[#E8C3BA] bg-[#FFF7F5] p-6 text-center text-sm text-[#9A5C4E]">
        <p>{loadError || "Não foi possível carregar a consulta."}</p>
        <button type="button" onClick={() => void loadWorkspace(sessionId)} className="mt-4 brand-btn-secondary">
          <RefreshCw className="h-4 w-4" /> Tentar novamente
        </button>
      </div>
    );
  }

  if (finished) {
    return (
      <div className="mx-auto mt-10 flex max-w-md flex-col items-center gap-3 rounded-lg border border-[#D9E4D3] bg-[#F4F8F1] p-8 text-center">
        <CheckCircle2 className="h-10 w-10 text-[#607A56]" />
        <p className="font-serif text-lg font-semibold text-[#3A3028]">Consulta finalizada</p>
        <button type="button" onClick={() => router.push(`/dashboard/clients/${clientId}`)} className="brand-btn-primary">Voltar para a ficha</button>
      </div>
    );
  }

  if (!consultation || !draft) {
    return (
      <div className="mx-auto mt-10 max-w-md rounded-lg border border-[#EDE1D6] bg-white p-8 text-center">
        <p className="text-sm font-semibold text-[#3A3028]">Nenhuma consulta em andamento para este paciente.</p>
        <p className="mt-1 text-xs text-[#75675E]">O workspace será vinculado ao paciente e à sessão criada agora.</p>
        {actionError && <p className="mt-3 text-xs text-[#9A5C4E]">{actionError}</p>}
        <button type="button" onClick={() => void startSession()} className="mt-4 brand-btn-primary">Iniciar consulta</button>
      </div>
    );
  }

  const readOnly = !consultation.canEdit;

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <header className="rounded-lg border border-[#EDE1D6] bg-white p-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <nav className="mb-2 flex flex-wrap items-center gap-1 text-xs text-[#75675E]" aria-label="Breadcrumb">
              <Link href="/dashboard/clients" className="font-semibold hover:text-[#3A3028]">Pacientes</Link>
              <span>/</span>
              <button type="button" onClick={() => guardNavigation(() => router.push(`/dashboard/clients/${clientId}`))} className="font-semibold hover:text-[#3A3028]">
                {workspace.patient.name}
              </button>
              <span>/</span>
              <span>Consulta</span>
            </nav>
            <h1 className="font-serif text-2xl font-semibold text-[#3A3028]">{workspace.patient.name}</h1>
            <p className="mt-1 text-sm text-[#75675E]">
              {consultation.appointmentType ?? "Consulta"} · {formatDateTime(consultation.appointmentDate ?? consultation.startedAt)} · {statusLabel(consultation.status)}
            </p>
            {consultation.readOnlyReason && <p className="mt-2 text-xs font-semibold text-[#9A5C4E]">{consultation.readOnlyReason}</p>}
          </div>
          <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
            <span aria-live="polite" className="min-h-5 text-xs font-semibold text-[#75675E]">{saveLabel(saveStatus)}</span>
            <button type="button" disabled={readOnly || saveStatus === "saving" || !dirty} onClick={() => void save()} className="brand-btn-secondary disabled:cursor-not-allowed disabled:opacity-50">
              <Save className="h-4 w-4" /> Salvar
            </button>
            <button type="button" disabled={readOnly || saveStatus === "saving"} onClick={() => void openFinish()} className="brand-btn-primary disabled:cursor-not-allowed disabled:opacity-50">
              Finalizar consulta
            </button>
          </div>
        </div>
        {actionError && <p className="mt-3 text-xs text-[#9A5C4E]">{actionError}</p>}
      </header>

      <nav aria-label="Etapas da consulta" className="overflow-x-auto rounded-lg border border-[#EDE1D6] bg-white p-2">
        <ol className="flex min-w-max gap-1">
          {CONSULTATION_STEPS.map((step, index) => {
            const current = activeStep === step.id;
            return (
              <li key={step.id}>
                <button
                  type="button"
                  aria-current={current ? "step" : undefined}
                  onClick={() => selectStep(step.id)}
                  className={`min-h-11 rounded-md px-3 py-2 text-left text-xs transition ${current ? "bg-[#EEF3EA] font-semibold text-[#3A3028]" : "text-[#75675E] hover:bg-[#FBF7F1]"}`}
                >
                  <span className="mr-1 text-[10px] text-[#8C6E52]">{index + 1}</span>{step.label}
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="space-y-3 lg:sticky lg:top-4 lg:self-start" aria-label="Contexto do paciente">
          <ContextCard label="Objetivo" value={workspace.patient.primaryGoal ?? "Anamnese ainda não preenchida"} action={
            <button type="button" onClick={() => guardNavigation(() => router.push(`/dashboard/clients/${clientId}?tab=anamnese`))} className="text-xs font-semibold text-[#607A56] hover:text-[#3A3028]">
              {workspace.patient.primaryGoal ? "Ver anamnese" : "Preencher anamnese"}
            </button>
          } />
          <ContextCard
            label="Peso atual"
            value={formatWeight(workspace.latestAnthropometry?.weightKg)}
            detail={workspace.weightDelta ? `Variação desde a anterior: ${workspace.weightDelta.label}` : workspace.previousAnthropometry ? null : "Sem comparação anterior"}
            action={<button type="button" onClick={() => guardNavigation(() => router.push(getAnthropometryHref(clientId, consultation.id)))} className="text-xs font-semibold text-[#607A56] hover:text-[#3A3028]">Registrar avaliação</button>}
          />
          <ContextCard label="Última consulta" value={workspace.previousConsultation ? formatDate(workspace.previousConsultation.date) : "Sem consulta anterior"} detail={workspace.previousConsultation?.type ?? null} />
          <ContextCard
            label="Plano alimentar"
            value={workspace.activeMealPlan ? `Ativo v${workspace.activeMealPlan.version}` : "Nenhum plano ativo"}
            detail={workspace.draftMealPlan ? `Rascunho v${workspace.draftMealPlan.version} em andamento` : workspace.activeMealPlan?.title ?? null}
            action={<button type="button" onClick={() => guardNavigation(() => router.push(getMealPlanHref(clientId, { consultationId: consultation.id, draft: Boolean(workspace.draftMealPlan) })))} className="text-xs font-semibold text-[#607A56] hover:text-[#3A3028]">{workspace.activeMealPlan ? "Abrir plano" : "Criar plano"}</button>}
          />
          <div className="rounded-lg border border-[#EDE1D6] bg-[#FFFDFC] p-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#8C6E52]">Restrições importantes</p>
            {workspace.keyRestrictions.length ? (
              <ul className="mt-2 space-y-1 text-xs text-[#3A3028]">
                {workspace.keyRestrictions.map((item) => <li key={item.id}>{item.label}</li>)}
              </ul>
            ) : (
              <p className="mt-1 text-sm text-[#75675E]">Nenhuma restrição ativa registrada.</p>
            )}
          </div>
          <ContextCard
            label="Pré-consulta"
            value={workspace.intakeSummary ? `Respondida em ${formatDate(workspace.intakeSummary.submittedAt)}` : "Pré-consulta não respondida"}
            detail={workspace.intakeSummary?.objective ?? workspace.intakeSummary?.serviceType ?? null}
            action={workspace.intakeSummary && (
              <button type="button" onClick={() => guardNavigation(() => router.push(workspace.intakeSummary?.href ?? "/dashboard/respostas"))} className="text-xs font-semibold text-[#607A56] hover:text-[#3A3028]">Abrir respostas</button>
            )}
          />
          <ContextCard
            label="Protocolos"
            value={workspace.activeProtocols[0]?.title ?? "Nenhum protocolo ativo"}
            detail={workspace.activeProtocols.length > 1 ? `${workspace.activeProtocols.length} protocolos ativos/pausados` : null}
            action={<button type="button" onClick={() => guardNavigation(() => router.push(getProtocolHref(clientId, consultation.id)))} className="text-xs font-semibold text-[#607A56] hover:text-[#3A3028]">Abrir protocolos</button>}
          />
          <button type="button" onClick={() => guardNavigation(() => router.push(getScheduleReturnHref(clientId, consultation.id)))} className="brand-btn-secondary w-full">
            <CalendarDays className="h-4 w-4" /> Agendar retorno
          </button>
        </aside>

        <main className="space-y-4">
          <section className="rounded-lg border border-[#EDE1D6] bg-[#FFFDFC] p-4" aria-labelledby="consultation-step-title">
            <p className="brand-kicker">Etapa {CONSULTATION_STEPS.findIndex((step) => step.id === activeStep) + 1} de {CONSULTATION_STEPS.length}</p>
            <h2 id="consultation-step-title" className="mt-1 font-serif text-xl font-semibold text-[#3A3028]">
              {CONSULTATION_STEPS.find((step) => step.id === activeStep)?.label}
            </h2>
            <p className="mt-1 text-sm text-[#75675E]">{CONSULTATION_STEPS.find((step) => step.id === activeStep)?.description}</p>
          </section>

          {activeStep === "resumo" && (
            <section className="grid gap-3 sm:grid-cols-2" aria-label="Resumo da consulta">
              <ContextCard label="Objetivo atual" value={workspace.patient.primaryGoal ?? "Anamnese ainda não preenchida"} />
              <ContextCard label="Última consulta" value={workspace.previousConsultation ? formatDate(workspace.previousConsultation.date) : "Sem consulta anterior"} />
              <ContextCard label="Plano atual" value={workspace.activeMealPlan ? `${workspace.activeMealPlan.title} · v${workspace.activeMealPlan.version}` : "Nenhum plano ativo"} />
              <ContextCard label="Última avaliação" value={formatWeight(workspace.latestAnthropometry?.weightKg)} detail={workspace.weightDelta ? `Variação: ${workspace.weightDelta.label}` : null} />
            </section>
          )}

          {activeStep === "mudancas" && (
            <section className="rounded-lg border border-[#EDE1D6] bg-white p-5" aria-label="Mudanças desde a última consulta">
              <h3 className="font-serif text-lg font-semibold text-[#3A3028]">Dados disponíveis desde o último atendimento</h3>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <ContextCard label="Peso" value={workspace.weightDelta ? `${formatWeight(workspace.previousAnthropometry?.weightKg)} → ${formatWeight(workspace.latestAnthropometry?.weightKg)}` : "Sem comparação antropométrica"} detail={workspace.weightDelta ? workspace.weightDelta.label : null} />
                <ContextCard label="Pré-consulta" value={workspace.intakeSummary ? `Respondida em ${formatDate(workspace.intakeSummary.submittedAt)}` : "Nenhuma resposta disponível"} detail={workspace.intakeSummary?.motivation ?? workspace.intakeSummary?.objective ?? null} />
              </div>
              <p className="mt-3 text-xs text-[#75675E]">Esta etapa mostra somente dados registrados; nenhum resumo clínico é inventado automaticamente.</p>
            </section>
          )}

          {activeStep === "anamnese" && (
            <ContextCard label="Anamnese" value={workspace.patient.primaryGoal ?? "Ainda não preenchida"} detail="A edição permanece no prontuário existente para preservar versionamento e histórico." action={<button type="button" onClick={() => guardNavigation(() => router.push(`/dashboard/clients/${clientId}?tab=anamnese`))} className="text-xs font-semibold text-[#607A56] hover:text-[#3A3028]">Abrir anamnese</button>} />
          )}

          {activeStep === "antropometria" && (
            <ContextCard label="Antropometria" value={formatWeight(workspace.latestAnthropometry?.weightKg)} detail={workspace.latestAnthropometry?.bmi !== null && workspace.latestAnthropometry?.bmi !== undefined ? `IMC: ${workspace.latestAnthropometry.bmi.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}` : "IMC não disponível"} action={<button type="button" onClick={() => guardNavigation(() => router.push(getAnthropometryHref(clientId, consultation.id)))} className="text-xs font-semibold text-[#607A56] hover:text-[#3A3028]">Registrar avaliação</button>} />
          )}

          {activeStep === "plano" && (
            <ContextCard label="Plano alimentar" value={workspace.activeMealPlan ? `${workspace.activeMealPlan.title} · ativo` : workspace.draftMealPlan ? `${workspace.draftMealPlan.title} · rascunho` : "Nenhum plano criado"} detail={workspace.draftMealPlan ? `Rascunho v${workspace.draftMealPlan.version}; a consulta nunca o publica automaticamente.` : null} action={<button type="button" onClick={() => guardNavigation(() => router.push(getMealPlanHref(clientId, { consultationId: consultation.id, draft: Boolean(workspace.draftMealPlan) })))} className="text-xs font-semibold text-[#607A56] hover:text-[#3A3028]">Abrir plano alimentar</button>} />
          )}

          {activeStep === "retorno" && (
            <ContextCard label="Retorno" value={workspace.appointmentContext ? formatDateTime(workspace.appointmentContext.startsAt) : "Nenhum retorno agendado"} detail={workspace.appointmentContext?.title ?? "A agenda existente continua responsável pelo agendamento."} action={<button type="button" onClick={() => guardNavigation(() => router.push(getScheduleReturnHref(clientId, consultation.id)))} className="text-xs font-semibold text-[#607A56] hover:text-[#3A3028]">Agendar retorno</button>} />
          )}

          <section className="rounded-lg border border-[#EDE1D6] bg-white p-5">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="brand-kicker">Consulta atual</p>
                <h2 className="mt-1 font-serif text-xl font-semibold text-[#3A3028]">{activeStep === "recomendacoes" ? "Recomendações e conduta" : "Registro clínico"}</h2>
                <p className="mt-1 text-sm text-[#75675E]">Campos salvos explicitamente nesta sessão. A IA pode apoiar, mas não salva nem calcula dados.</p>
              </div>
              <button
                type="button"
                disabled={readOnly || !Object.values(draft).some((value) => value.trim())}
                onClick={() => setPendingCopilotMessage(`Organize estas notas da consulta e proponha atualização do prontuário: ${Object.entries(draft).map(([key, value]) => `${key}: ${value}`).join("\n")}`)}
                className="brand-btn-secondary disabled:cursor-not-allowed disabled:opacity-50"
              >
                <BookOpen className="h-4 w-4" /> Preparar resumo
              </button>
            </div>
            <div className="mt-5 space-y-4">
              {DRAFT_FIELDS.map((field) => (
                <label key={field.key} className="block">
                  <span className="text-sm font-semibold text-[#3A3028]">{field.label}</span>
                  <span className="mt-0.5 block text-xs text-[#75675E]">{field.hint}</span>
                  <textarea
                    value={draft[field.key]}
                    onChange={(event) => updateDraft(field.key, event.target.value)}
                    disabled={readOnly}
                    rows={field.rows}
                    className="brand-input mt-2 w-full resize-y disabled:bg-[#F6F1EA] disabled:text-[#75675E]"
                  />
                </label>
              ))}
            </div>
          </section>

          <section className="grid gap-3 md:grid-cols-3">
            <button type="button" onClick={() => guardNavigation(() => router.push(getAnthropometryHref(clientId, consultation.id)))} className="rounded-lg border border-[#EDE1D6] bg-white p-4 text-left hover:bg-[#FBF7F1]">
              <Activity className="mb-2 h-5 w-5 text-[#607A56]" />
              <p className="text-sm font-semibold text-[#3A3028]">Nova avaliação</p>
              <p className="mt-1 text-xs text-[#75675E]">Reutiliza antropometria existente.</p>
            </button>
            <button type="button" onClick={() => guardNavigation(() => router.push(getMealPlanHref(clientId, { consultationId: consultation.id, draft: Boolean(workspace.draftMealPlan) })))} className="rounded-lg border border-[#EDE1D6] bg-white p-4 text-left hover:bg-[#FBF7F1]">
              <Utensils className="mb-2 h-5 w-5 text-[#607A56]" />
              <p className="text-sm font-semibold text-[#3A3028]">Abrir plano alimentar</p>
              <p className="mt-1 text-xs text-[#75675E]">Sem renderizar o editor dentro da consulta.</p>
            </button>
            <button type="button" onClick={() => guardNavigation(() => router.push(`/dashboard/clients/${clientId}?tab=anamnese`))} className="rounded-lg border border-[#EDE1D6] bg-white p-4 text-left hover:bg-[#FBF7F1]">
              <FileText className="mb-2 h-5 w-5 text-[#607A56]" />
              <p className="text-sm font-semibold text-[#3A3028]">Ver anamnese</p>
              <p className="mt-1 text-xs text-[#75675E]">P4 cuidará da UX completa.</p>
            </button>
          </section>

          <ClinicalMealPlanPreAnalysis clientId={clientId} />

          <div className="rounded-lg border border-[#EDE1D6] bg-white">
            <ConsultationCopilot
              clientId={clientId}
              consultationSessionId={consultation.id}
              externalMessage={pendingCopilotMessage}
              onExternalMessageSent={() => setPendingCopilotMessage(null)}
              onProposalConfirmed={() => void loadWorkspace(consultation.id)}
            />
          </div>
        </main>
      </div>

      {showFinish && (
        <ConsultationFinishDialog
          consultationSessionId={consultation.id}
          clientId={clientId}
          summary={{
            patientName: workspace.patient.name,
            startedAt: consultation.startedAt,
            status: statusLabel(consultation.status),
            hasUnsavedChanges: dirty,
          }}
          onClose={() => setShowFinish(false)}
          onFinished={() => {
            setShowFinish(false);
            setFinished(true);
          }}
        />
      )}

      {dirty && (
        <div className="fixed bottom-4 left-1/2 z-40 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 rounded-lg border border-[#EAD8C2] bg-white p-3 shadow-lg">
          <div className="flex items-center justify-between gap-3">
            <p className="flex items-center gap-2 text-xs font-semibold text-[#8C6E52]"><AlertTriangle className="h-4 w-4" /> Alterações não salvas</p>
            <button type="button" onClick={() => void save()} className="brand-btn-secondary">Salvar</button>
          </div>
        </div>
      )}
    </div>
  );
}
