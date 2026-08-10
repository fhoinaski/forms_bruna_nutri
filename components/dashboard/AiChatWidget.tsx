"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bot, Check, Paperclip, Send, Sparkles, X } from "lucide-react";
import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";
import { SUGGESTED_CHAT_PROMPTS } from "@/lib/ai/agents/system/system-knowledge";
import { NUTRITION_TEXT_FIELD_LABELS, type NutritionRecordTextFieldKey } from "@/lib/clinical/nutrition-record-fields";
import { PRE_ANALYSIS_FIELD_LABELS, type PreAnalysisFieldKey } from "@/lib/clinical/pre-analysis-fields";
import { NEW_CLIENT_FIELD_LABELS, type NewClientFieldKey } from "@/lib/clinical/client-fields";
import { ALLOWED_ATTACHMENT_MEDIA_TYPES, MAX_ATTACHMENT_RAW_BYTES, type AllowedAttachmentMediaType } from "@/lib/ai/agents/system/chat-attachments";

const INTRO_SHOWN_KEY = "bruna_nutri_ai_chat_intro_shown";
const DAILY_BRIEFING_SHOWN_KEY_PREFIX = "bruna_nutri_daily_briefing_shown_";

type DailyBriefingAppointment = { id: string; title: string; starts_at: string; client_name: string | null; appointment_type: string };
type DailyBriefingPerson = { id: string; name?: string; patient_name?: string; created_at: string };
type DailyBriefingTask = { id: string; title: string; client_name: string | null; due_date: string | null };
type DailyBriefing = {
  dateKey: string;
  agendamentos: DailyBriefingAppointment[];
  novosClientes: DailyBriefingPerson[];
  novasSubmissoes: DailyBriefingPerson[];
  tarefas: DailyBriefingTask[];
};

function todaySaoPauloKey(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

function buildDailyBriefingMarkdown(hoje: DailyBriefing): string {
  const formatTime = (iso: string) => new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }).format(new Date(iso));
  const sections: string[] = ["## Bom dia! Aqui está o resumo de hoje"];

  sections.push(
    hoje.agendamentos.length
      ? `**Consultas hoje (${hoje.agendamentos.length}):**\n` + hoje.agendamentos
          .map((appointment) => `- ${formatTime(appointment.starts_at)} — ${appointment.client_name ?? "sem cliente vinculado"} (${appointment.title})`)
          .join("\n")
      : "**Consultas hoje:** nenhuma agendada."
  );

  if (hoje.novosClientes.length) {
    sections.push(`**Novos pacientes cadastrados hoje (${hoje.novosClientes.length}):**\n` + hoje.novosClientes.map((client) => `- ${client.name}`).join("\n"));
  }

  if (hoje.novasSubmissoes.length) {
    sections.push(`**Novas pré-consultas recebidas hoje (${hoje.novasSubmissoes.length}):**\n` + hoje.novasSubmissoes.map((submission) => `- ${submission.patient_name}`).join("\n"));
  }

  if (hoje.tarefas.length) {
    sections.push(`**Tarefas com prazo hoje (${hoje.tarefas.length}):**\n` + hoje.tarefas.map((task) => `- ${task.title}${task.client_name ? ` (${task.client_name})` : ""}`).join("\n"));
  }

  if (!hoje.agendamentos.length && !hoje.novosClientes.length && !hoje.novasSubmissoes.length && !hoje.tarefas.length) {
    sections.push("Sem novidades além disso — dia tranquilo. Se precisar de algo, é só perguntar.");
  }

  return sections.join("\n\n");
}

// So a janela mais recente da conversa e enviada a cada chamada — a
// interface guarda o historico inteiro, mas o custo/latencia da IA e o
// limite do servidor ficam sempre limitados, nao importa quanto tempo o
// chat esteja aberto.
const MAX_HISTORY_MESSAGES_SENT = 20;

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

type ProposedField = { key: string; label: string; value: string; included: boolean };
type ProposalStatus = "pending" | "applying" | "applied" | "discarded" | "error";

type ProposedRecipeIngredient = { food_name: string; grams: number; taco_number: number | null };

const NEW_PROTOCOL_FIELD_LABELS: Record<string, string> = {
  title: "Título",
  category: "Categoria",
  description: "Descrição",
  professional_notes: "Notas profissionais",
};

const NEW_BLOG_POST_FIELD_LABELS: Record<string, string> = {
  title: "Título",
  excerpt: "Resumo",
  content_markdown: "Conteúdo (Markdown)",
  category: "Categoria",
  tags: "Tags (separadas por vírgula)",
  seo_title: "Título SEO",
  seo_description: "Descrição SEO",
};

const NEW_APPOINTMENT_FIELD_LABELS: Record<string, string> = {
  title: "Título",
  appointment_type: "Tipo",
  starts_at_display: "Data e hora (DD/MM/AAAA HH:mm)",
  location: "Local ou link",
  notes: "Observações",
};

const NEW_TASK_FIELD_LABELS: Record<string, string> = {
  title: "Título",
  description: "Descrição",
  due_date_display: "Prazo (DD/MM/AAAA)",
};

const APPLIED_MESSAGES: Partial<Record<ChatProposal["kind"], string>> = {
  new_client: "Cliente cadastrado. Abrindo a ficha...",
  new_recipe: "Receita salva na biblioteca. Abrindo a lista...",
  new_protocol: "Protocolo criado.",
  new_blog_post: "Rascunho salvo no blog. Abrindo a lista...",
  new_appointment: "Consulta agendada.",
  new_task: "Tarefa criada.",
};

function parseBrDateTimeToIso(text: string): string | null {
  const match = text.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})[ T](\d{2}):(\d{2})$/);
  if (!match) return null;
  const [, day, month, year, hour, minute] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function parseBrDateToIsoDate(text: string): string | null {
  const match = text.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return null;
  const [, day, month, year] = match;
  return `${year}-${month}-${day}`;
}

type ChatProposal =
  | { kind: "nutrition_record"; clientId: string; title: string; applyLabel: string; fields: ProposedField[]; status: ProposalStatus; error?: string }
  | { kind: "pre_analysis"; submissionId: string; title: string; applyLabel: string; fields: ProposedField[]; status: ProposalStatus; error?: string }
  | { kind: "client_protocol"; clientId: string; clientProtocolId: string; title: string; applyLabel: string; fields: ProposedField[]; status: ProposalStatus; error?: string }
  | { kind: "new_client"; title: string; applyLabel: string; fields: ProposedField[]; status: ProposalStatus; error?: string }
  | { kind: "new_recipe"; title: string; applyLabel: string; fields: ProposedField[]; ingredients: ProposedRecipeIngredient[]; status: ProposalStatus; error?: string }
  | { kind: "new_protocol"; clientId: string; title: string; applyLabel: string; fields: ProposedField[]; status: ProposalStatus; error?: string }
  | { kind: "new_blog_post"; title: string; applyLabel: string; fields: ProposedField[]; status: ProposalStatus; error?: string }
  | { kind: "new_appointment"; clientId: string; title: string; applyLabel: string; fields: ProposedField[]; status: ProposalStatus; error?: string; proposalId?: string; expiresAt?: string }
  | { kind: "new_task"; clientId: string; title: string; applyLabel: string; fields: ProposedField[]; status: ProposalStatus; error?: string };

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  proposal?: ChatProposal;
  attachmentName?: string;
};

type PendingAttachment = { name: string; mediaType: AllowedAttachmentMediaType; base64: string };

function buildProposal(update: Record<string, unknown>): ChatProposal | null {
  if (update.kind === "nutrition_record") {
    const fields = update.fields as Record<string, string>;
    return {
      kind: "nutrition_record",
      clientId: update.clientId as string,
      title: "Proposta para o prontuário",
      applyLabel: "Aplicar no prontuário",
      status: "pending",
      fields: Object.entries(fields).map(([key, value]) => ({
        key,
        label: NUTRITION_TEXT_FIELD_LABELS[key as NutritionRecordTextFieldKey] ?? key,
        value,
        included: true,
      })),
    };
  }
  if (update.kind === "pre_analysis") {
    const fields = update.fields as Record<string, string>;
    return {
      kind: "pre_analysis",
      submissionId: update.submissionId as string,
      title: "Proposta de pré-análise",
      applyLabel: "Aplicar na pré-análise",
      status: "pending",
      fields: Object.entries(fields).map(([key, value]) => ({
        key,
        label: PRE_ANALYSIS_FIELD_LABELS[key as PreAnalysisFieldKey] ?? key,
        value,
        included: true,
      })),
    };
  }
  if (update.kind === "client_protocol") {
    return {
      kind: "client_protocol",
      clientId: update.clientId as string,
      clientProtocolId: update.clientProtocolId as string,
      title: "Proposta para o protocolo do cliente",
      applyLabel: "Aplicar no protocolo",
      status: "pending",
      fields: [{
        key: "professionalNotes",
        label: "Notas profissionais do protocolo",
        value: update.professionalNotes as string,
        included: true,
      }],
    };
  }
  if (update.kind === "new_client") {
    const fields = update.fields as Record<string, string>;
    return {
      kind: "new_client",
      title: "Proposta de novo cadastro",
      applyLabel: "Cadastrar cliente",
      status: "pending",
      fields: Object.entries(fields).map(([key, value]) => ({
        key,
        label: NEW_CLIENT_FIELD_LABELS[key as NewClientFieldKey] ?? key,
        value,
        included: true,
      })),
    };
  }
  if (update.kind === "new_recipe") {
    return {
      kind: "new_recipe",
      title: "Proposta de nova receita",
      applyLabel: "Salvar receita na biblioteca",
      status: "pending",
      ingredients: update.ingredients as ProposedRecipeIngredient[],
      fields: [
        { key: "recipe_title", label: "Título", value: update.title as string, included: true },
        { key: "meal_group", label: "Grupo da refeição", value: update.meal_group as string, included: true },
        { key: "servings", label: "Porções", value: String(update.servings), included: true },
        { key: "preparation_steps", label: "Modo de preparo", value: (update.preparation_steps as string) || "", included: true },
      ],
    };
  }
  if (update.kind === "new_protocol") {
    const fields = update.fields as Record<string, string>;
    return {
      kind: "new_protocol",
      clientId: update.clientId as string,
      title: "Proposta de novo protocolo",
      applyLabel: "Criar protocolo",
      status: "pending",
      fields: Object.entries(fields).map(([key, value]) => ({
        key,
        label: NEW_PROTOCOL_FIELD_LABELS[key] ?? key,
        value,
        included: true,
      })),
    };
  }
  if (update.kind === "new_blog_post") {
    const fields = update.fields as Record<string, string>;
    return {
      kind: "new_blog_post",
      title: "Proposta de rascunho de post",
      applyLabel: "Salvar rascunho no blog",
      status: "pending",
      fields: Object.entries(fields).filter(([, value]) => value).map(([key, value]) => ({
        key,
        label: NEW_BLOG_POST_FIELD_LABELS[key] ?? key,
        value,
        included: true,
      })),
    };
  }
  if (update.kind === "new_appointment") {
    const fields = update.fields as Record<string, string>;
    return {
      kind: "new_appointment",
      clientId: update.clientId as string,
      title: "Proposta de nova consulta",
      applyLabel: "Agendar consulta",
      status: "pending",
      proposalId: update.proposalId as string | undefined,
      expiresAt: update.expiresAt as string | undefined,
      fields: Object.entries(fields).filter(([, value]) => value).map(([key, value]) => ({
        key,
        label: NEW_APPOINTMENT_FIELD_LABELS[key] ?? key,
        value,
        included: true,
      })),
    };
  }
  if (update.kind === "new_task") {
    const fields = update.fields as Record<string, string>;
    return {
      kind: "new_task",
      clientId: update.clientId as string,
      title: "Proposta de nova tarefa",
      applyLabel: "Criar tarefa",
      status: "pending",
      fields: Object.entries(fields).filter(([, value]) => value).map(([key, value]) => ({
        key,
        label: NEW_TASK_FIELD_LABELS[key] ?? key,
        value,
        included: true,
      })),
    };
  }
  return null;
}

export function AiChatWidget({ context }: { context?: { clientId?: string; submissionId?: string } } = {}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [clientName, setClientName] = useState("");
  const [pendingAttachment, setPendingAttachment] = useState<PendingAttachment | null>(null);
  const [attachmentError, setAttachmentError] = useState("");
  const panelRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const dailyKey = `${DAILY_BRIEFING_SHOWN_KEY_PREFIX}${todaySaoPauloKey()}`;
    if (window.localStorage.getItem(dailyKey)) {
      if (!window.localStorage.getItem(INTRO_SHOWN_KEY)) {
        window.localStorage.setItem(INTRO_SHOWN_KEY, "1");
        setOpen(true);
      }
      return;
    }
    window.localStorage.setItem(dailyKey, "1");
    window.localStorage.setItem(INTRO_SHOWN_KEY, "1");
    fetch("/api/admin/dashboard-metrics", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { hoje?: DailyBriefing } | null) => {
        if (!data?.hoje) return;
        setMessages([{ role: "assistant", content: buildDailyBriefingMarkdown(data.hoje) }]);
        setOpen(true);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    setClientName("");
    if (!context?.clientId) return;
    fetch(`/api/admin/clients/${context.clientId}`, { cache: "no-store" })
      .then((response) => response.ok ? response.json() : null)
      .then((data: { name?: string } | null) => setClientName(data?.name ?? ""))
      .catch(() => setClientName(""));
  }, [context?.clientId]);

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

  function selectAttachment(file: File | undefined) {
    setAttachmentError("");
    if (!file) return;
    if (!ALLOWED_ATTACHMENT_MEDIA_TYPES.includes(file.type as AllowedAttachmentMediaType)) {
      setAttachmentError("Formato não suportado. Envie PDF, PNG, JPEG ou WEBP.");
      return;
    }
    if (file.size > MAX_ATTACHMENT_RAW_BYTES) {
      setAttachmentError("Arquivo muito grande. O limite é 9 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result ?? "");
      const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
      setPendingAttachment({ name: file.name, mediaType: file.type as AllowedAttachmentMediaType, base64 });
    };
    reader.onerror = () => setAttachmentError("Não foi possível ler o arquivo.");
    reader.readAsDataURL(file);
  }

  async function sendMessage(text: string) {
    const content = text.trim();
    if (!content || sending) return;
    setError("");
    const attachment = pendingAttachment;
    const nextMessages: ChatMessage[] = [...messages, { role: "user", content, attachmentName: attachment?.name }];
    setMessages(nextMessages);
    setInput("");
    setPendingAttachment(null);
    setSending(true);
    try {
      const response = await fetch("/api/admin/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: nextMessages.slice(-MAX_HISTORY_MESSAGES_SENT).map(({ role, content: messageContent }) => ({ role, content: messageContent })),
          attachment: attachment ? { name: attachment.name, mediaType: attachment.mediaType, data: attachment.base64 } : undefined,
          context,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? "Não foi possível responder agora.");
      const proposal = data.proposedUpdate ? buildProposal(data.proposedUpdate) : null;
      const assistantMessage: ChatMessage = { role: "assistant", content: data.reply, proposal: proposal ?? undefined };
      setMessages([...nextMessages, assistantMessage]);
      const navigateAction = data.navigateAction as { path: string; clientName?: string } | undefined;
      if (navigateAction?.path) router.push(navigateAction.path);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível responder agora.");
    } finally {
      setSending(false);
    }
  }

  function updateProposal(messageIndex: number, updater: (proposal: ChatProposal) => ChatProposal) {
    setMessages((current) => current.map((message, index) => {
      if (index !== messageIndex || !message.proposal) return message;
      return { ...message, proposal: updater(message.proposal) };
    }));
  }

  function toggleProposalField(messageIndex: number, fieldKey: string) {
    updateProposal(messageIndex, (proposal) => ({
      ...proposal,
      fields: proposal.fields.map((field) => field.key === fieldKey ? { ...field, included: !field.included } : field),
    }));
  }

  function editProposalField(messageIndex: number, fieldKey: string, value: string) {
    updateProposal(messageIndex, (proposal) => ({
      ...proposal,
      fields: proposal.fields.map((field) => field.key === fieldKey ? { ...field, value } : field),
    }));
  }

  function discardProposal(messageIndex: number) {
    updateProposal(messageIndex, (proposal) => ({ ...proposal, status: "discarded" }));
  }

  async function applyProposal(messageIndex: number, proposal: ChatProposal) {
    updateProposal(messageIndex, (current) => ({ ...current, status: "applying", error: undefined }));
    const includedEntries = proposal.fields.filter((field) => field.included);
    if (!includedEntries.length) {
      updateProposal(messageIndex, (current) => ({ ...current, status: "error", error: "Selecione ao menos um campo para aplicar." }));
      return;
    }

    try {
      if (proposal.kind === "nutrition_record") {
        const payload = Object.fromEntries(includedEntries.map((field) => [field.key, field.value]));
        const response = await fetch(`/api/admin/clients/${proposal.clientId}/nutrition-record`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.message ?? "Não foi possível salvar no prontuário.");
        if (context?.clientId === proposal.clientId) router.refresh();
      }

      if (proposal.kind === "pre_analysis") {
        const currentResponse = await fetch(`/api/admin/submissions/${proposal.submissionId}/pre-analysis`, { cache: "no-store" });
        const currentData = currentResponse.ok ? await currentResponse.json() : null;
        const merged = {
          summary: currentData?.summary ?? null,
          attention_points: currentData?.attention_points ?? null,
          main_goal: currentData?.main_goal ?? null,
          restrictions: currentData?.restrictions ?? null,
          professional_notes: currentData?.professional_notes ?? null,
          priority: currentData?.priority ?? "normal",
        };
        for (const field of includedEntries) (merged as Record<string, string>)[field.key] = field.value;
        const response = await fetch(`/api/admin/submissions/${proposal.submissionId}/pre-analysis`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(merged),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.message ?? "Não foi possível salvar a pré-análise.");
        if (context?.submissionId === proposal.submissionId) router.refresh();
      }

      if (proposal.kind === "client_protocol") {
        const notes = includedEntries.find((field) => field.key === "professionalNotes")?.value;
        const response = await fetch(`/api/admin/clients/${proposal.clientId}/protocols/${proposal.clientProtocolId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ professionalNotes: notes }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.message ?? "Não foi possível salvar o protocolo.");
        if (context?.clientId === proposal.clientId) router.refresh();
      }

      if (proposal.kind === "new_client") {
        const name = includedEntries.find((field) => field.key === "name")?.value;
        if (!name?.trim()) throw new Error("O nome é obrigatório para cadastrar o cliente.");
        const payload = Object.fromEntries(includedEntries.map((field) => [field.key, field.value]));
        const response = await fetch("/api/admin/clients", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.message ?? "Não foi possível cadastrar o cliente.");
        if (data.id) router.push(`/dashboard/clients/${data.id}`);
      }

      if (proposal.kind === "new_recipe") {
        const byKey = (key: string) => includedEntries.find((field) => field.key === key)?.value;
        const title = byKey("recipe_title");
        const mealGroup = byKey("meal_group");
        if (!title?.trim() || !mealGroup?.trim()) throw new Error("Título e grupo da refeição são obrigatórios para salvar a receita.");
        const response = await fetch("/api/admin/recipes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title,
            meal_group: mealGroup,
            servings: Math.max(1, Number(byKey("servings")) || 1),
            preparation_steps: byKey("preparation_steps") || null,
            ingredients: proposal.ingredients.map((ingredient) => ({
              taco_number: ingredient.taco_number,
              food_name: ingredient.food_name,
              grams: ingredient.grams,
            })),
            source_note: "Receita criada com apoio de IA a partir de um pedido no chat. Revisar antes de prescrever.",
          }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.message ?? "Não foi possível salvar a receita.");
        router.push("/dashboard/templates/receitas");
      }

      if (proposal.kind === "new_protocol") {
        const byKey = (key: string) => includedEntries.find((field) => field.key === key)?.value;
        const title = byKey("title");
        if (!title?.trim()) throw new Error("O título é obrigatório para criar o protocolo.");
        const response = await fetch(`/api/admin/clients/${proposal.clientId}/protocols`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode: "create_personalized",
            title,
            category: byKey("category") || null,
            description: byKey("description") || null,
            professionalNotes: byKey("professional_notes") || null,
            createTasks: false,
          }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.message ?? "Não foi possível criar o protocolo.");
        if (context?.clientId === proposal.clientId) router.refresh();
        else router.push(`/dashboard/clients/${proposal.clientId}`);
      }

      if (proposal.kind === "new_blog_post") {
        const byKey = (key: string) => includedEntries.find((field) => field.key === key)?.value;
        const title = byKey("title");
        const excerpt = byKey("excerpt");
        const contentMarkdown = byKey("content_markdown");
        if (!title?.trim() || !excerpt?.trim() || !contentMarkdown?.trim()) {
          throw new Error("Título, resumo e conteúdo são obrigatórios para salvar o rascunho.");
        }
        const tags = (byKey("tags") || "").split(",").map((tag) => tag.trim()).filter(Boolean);
        const response = await fetch("/api/admin/blog-posts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title,
            excerpt,
            content_markdown: contentMarkdown,
            category: byKey("category") || null,
            tags,
            seo_title: byKey("seo_title") || title,
            seo_description: byKey("seo_description") || excerpt,
            status: "draft",
            ai_generated: true,
          }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.message ?? "Não foi possível salvar o rascunho.");
        router.push("/dashboard/blog");
      }

      if (proposal.kind === "new_appointment") {
        if (proposal.proposalId) {
          // Proposta persistida server-side: o corpo da confirmacao vai
          // vazio de proposito — o servidor usa exclusivamente os
          // parametros gravados no momento da proposta (nunca o que esta
          // editavel na tela), revalida o horario contra conflitos reais e
          // so entao cria a consulta. Isso impede replay (a proposta so
          // pode ser confirmada uma vez) e impede que o horario proposto
          // seja trocado depois de gerado.
          const response = await fetch(`/api/admin/ai/proposals/${proposal.proposalId}/confirm`, {
            method: "POST",
          });
          const data = await response.json();
          if (!response.ok) throw new Error(data.message ?? "Não foi possível agendar a consulta.");
          if (context?.clientId === proposal.clientId) router.refresh();
        } else {
          // Compatibilidade: proposta sem id persistido (formato legado).
          const byKey = (key: string) => includedEntries.find((field) => field.key === key)?.value;
          const title = byKey("title");
          const startsAtDisplay = byKey("starts_at_display");
          if (!title?.trim() || !startsAtDisplay?.trim()) throw new Error("Título e data/hora são obrigatórios para agendar a consulta.");
          const startsAtIso = parseBrDateTimeToIso(startsAtDisplay);
          if (!startsAtIso) throw new Error("Data e hora inválidas. Use o formato DD/MM/AAAA HH:mm.");
          const response = await fetch("/api/admin/appointments", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              client_id: proposal.clientId,
              title,
              appointment_type: byKey("appointment_type") || "consulta",
              starts_at: startsAtIso,
              location: byKey("location") || null,
              notes: byKey("notes") || null,
              status: "agendado",
            }),
          });
          const data = await response.json();
          if (!response.ok) throw new Error(data.message ?? "Não foi possível agendar a consulta.");
          if (context?.clientId === proposal.clientId) router.refresh();
        }
      }

      if (proposal.kind === "new_task") {
        const byKey = (key: string) => includedEntries.find((field) => field.key === key)?.value;
        const title = byKey("title");
        if (!title?.trim()) throw new Error("O título é obrigatório para criar a tarefa.");
        const dueDateDisplay = byKey("due_date_display");
        const dueDate = dueDateDisplay ? parseBrDateToIsoDate(dueDateDisplay) : null;
        if (dueDateDisplay && !dueDate) throw new Error("Prazo inválido. Use o formato DD/MM/AAAA.");
        const response = await fetch("/api/admin/client-tasks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            client_id: proposal.clientId,
            title,
            description: byKey("description") || null,
            due_date: dueDate,
            status: "pendente",
          }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.message ?? "Não foi possível criar a tarefa.");
        if (context?.clientId === proposal.clientId) router.refresh();
      }

      updateProposal(messageIndex, (current) => ({ ...current, status: "applied" }));
    } catch (cause) {
      updateProposal(messageIndex, (current) => ({
        ...current,
        status: "error",
        error: cause instanceof Error ? cause.message : "Não foi possível salvar.",
      }));
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
                <p className="text-[11px] text-[#8A7B70]">
                  {context?.clientId
                    ? `Vendo a ficha de ${clientName || "este cliente"}`
                    : context?.submissionId
                      ? "Vendo este formulário de pré-consulta"
                      : "Ajuda a usar o dashboard"}
                </p>
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
                  {context?.clientId
                    ? `Olá! Posso te ajudar a usar o sistema, organizar o prontuário, revisar o plano alimentar, criar um protocolo novo, marcar consultas, criar tarefas e atualizar notas de protocolo de ${clientName || "este cliente"}. Descreva o caso, anexe um exame em PDF ou imagem se ajudar, e eu monto uma proposta — você revisa e confirma antes de qualquer coisa ser salva.`
                    : context?.submissionId
                      ? "Olá! Posso te ajudar a usar o sistema e também a montar a pré-análise deste formulário a partir das respostas do paciente. Peça um resumo do caso e eu monto uma proposta — você revisa e confirma antes de salvar."
                      : "Olá! Posso explicar como usar o sistema, te levar direto para onde você precisa (inclusive já numa aba específica da ficha), cadastrar um paciente novo, criar uma receita na biblioteca e até escrever um rascunho de post pro blog — diga algo como \"abre a antropometria do Beltrano\", \"cria uma receita baixa caloria para emagrecimento\" ou \"escreve um post sobre alimentação saudável\". Não dou orientação clínica."}
                </p>
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#8C6E52]">Perguntas rápidas</p>
                <div className="flex flex-wrap gap-2">
                  {(context?.clientId
                    ? ["Preencher o prontuário com base no que vou descrever agora", "Marcar uma consulta para esse cliente", "Criar um protocolo novo para esse cliente", "Atualizar as notas do protocolo atual", ...SUGGESTED_CHAT_PROMPTS]
                    : context?.submissionId
                      ? ["Montar um resumo de pré-análise com base nas respostas", ...SUGGESTED_CHAT_PROMPTS]
                      : ["Abrir a ficha de um cliente pelo nome", "Cadastrar um novo paciente", "Criar uma receita baixa caloria para emagrecimento", "Escrever um rascunho de post pro blog", ...SUGGESTED_CHAT_PROMPTS]
                  ).map((prompt) => (
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
              <div key={index} className="space-y-2">
                <div
                  className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-6 ${
                    message.role === "user"
                      ? "ml-auto whitespace-pre-wrap bg-[#7F9A74] text-white"
                      : "bg-[#F4F8F1] text-[#3A3028]"
                  }`}
                >
                  {message.role === "assistant" ? (
                    <ReactMarkdown components={markdownComponents}>{message.content}</ReactMarkdown>
                  ) : (
                    <>
                      {message.attachmentName && (
                        <span className="mb-1 inline-flex items-center gap-1 rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-semibold">
                          <Paperclip className="h-3 w-3" /> {message.attachmentName}
                        </span>
                      )}
                      <div>{message.content}</div>
                    </>
                  )}
                </div>
                {message.proposal && (
                  <ProposalCard
                    proposal={message.proposal}
                    onToggleField={(fieldKey) => toggleProposalField(index, fieldKey)}
                    onEditField={(fieldKey, value) => editProposalField(index, fieldKey, value)}
                    onDiscard={() => discardProposal(index)}
                    onApply={() => void applyProposal(index, message.proposal!)}
                  />
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
            className="border-t border-[#EDE1D6] bg-[#FBF7F1] p-3"
          >
            {attachmentError && <p className="mb-2 text-xs text-[#8C5F50]">{attachmentError}</p>}
            {pendingAttachment && (
              <div className="mb-2 flex items-center gap-2 rounded-full border border-[#D9C4B2] bg-white px-3 py-1.5 text-xs text-[#3A3028]">
                <Paperclip className="h-3.5 w-3.5 shrink-0 text-[#8C6E52]" />
                <span className="min-w-0 flex-1 truncate">{pendingAttachment.name}</span>
                <button type="button" onClick={() => setPendingAttachment(null)} aria-label="Remover anexo" className="shrink-0 text-[#8C6E52] hover:text-[#3A3028]">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
            <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept={ALLOWED_ATTACHMENT_MEDIA_TYPES.join(",")}
              onChange={(event) => {
                selectAttachment(event.target.files?.[0]);
                event.target.value = "";
              }}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={sending}
              aria-label="Anexar arquivo (PDF ou imagem)"
              title="Anexar PDF ou imagem"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#EDE1D6] bg-white text-[#8C6E52] transition hover:bg-[#FBF7F1] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Paperclip className="h-4 w-4" />
            </button>
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
            </div>
          </form>
        </div>
      )}
    </>
  );
}

function ProposalCard({ proposal, onToggleField, onEditField, onDiscard, onApply }: {
  proposal: ChatProposal;
  onToggleField: (fieldKey: string) => void;
  onEditField: (fieldKey: string, value: string) => void;
  onDiscard: () => void;
  onApply: () => void;
}) {
  if (!proposal.fields.length) return null;

  if (proposal.status === "discarded") {
    return <p className="rounded-xl border border-[#EDE1D6] bg-[#FBF7F1] px-3 py-2 text-xs text-[#8A7B70]">Proposta descartada.</p>;
  }
  if (proposal.status === "applied") {
    return (
      <p className="flex items-center gap-1.5 rounded-xl border border-[#D9E4D3] bg-[#F4F8F1] px-3 py-2 text-xs font-semibold text-[#4F6847]">
        <Check className="h-3.5 w-3.5" />
        {APPLIED_MESSAGES[proposal.kind] ?? "Alterações salvas com os campos selecionados."}
      </p>
    );
  }

  const applying = proposal.status === "applying";
  // Propostas persistidas server-side (hoje, so new_appointment) sao
  // confirmadas usando apenas os parametros gravados no momento da
  // proposta — editar o texto aqui nao mudaria o que e de fato criado, entao
  // os campos ficam somente para revisao, nao para edicao.
  const isServerLockedProposal = proposal.kind === "new_appointment" && Boolean(proposal.proposalId);

  return (
    <div className="max-w-[92%] space-y-3 rounded-2xl border border-[#EAD8C2] bg-[#FFFDFC] p-3">
      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#8C5F50]">{proposal.title} — revise antes de aplicar</p>
      {isServerLockedProposal && (
        <p className="rounded-lg bg-[#FBF7F1] px-2.5 py-1.5 text-[11px] leading-4 text-[#8A7B70]">
          Estes dados foram validados pelo servidor e não podem ser editados aqui. Se algo estiver errado, descarte e peça de novo.
        </p>
      )}
      <div className="space-y-3">
        {proposal.fields.map((field) => (
          <label key={field.key} className="block">
            <span className="mb-1 flex items-center gap-2 text-xs font-semibold text-[#3A3028]">
              <input type="checkbox" checked={field.included} onChange={() => onToggleField(field.key)} disabled={isServerLockedProposal} className="h-3.5 w-3.5 accent-[#7F9A74]" />
              {field.label}
            </span>
            <textarea
              value={field.value}
              onChange={(event) => onEditField(field.key, event.target.value)}
              disabled={!field.included || applying || isServerLockedProposal}
              className={`w-full resize-y rounded-lg border border-[#EDE1D6] bg-white px-2 py-1.5 text-xs leading-5 text-[#3A3028] outline-none focus:border-[#7F9A74] disabled:opacity-50 ${field.key === "content_markdown" ? "min-h-56" : "min-h-16"}`}
            />
          </label>
        ))}
      </div>
      {proposal.kind === "new_recipe" && (
        <div className="rounded-lg border border-[#EDE1D6] bg-[#FBF7F1] p-2.5">
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#8C5F50]">Ingredientes (buscados na TACO)</p>
          <ul className="space-y-1 text-xs leading-5 text-[#3A3028]">
            {proposal.ingredients.map((ingredient, index) => (
              <li key={index}>
                {ingredient.food_name} — {ingredient.grams}g
                {!ingredient.taco_number && <span className="text-[#A9978A]"> (não vinculado à TACO)</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
      {proposal.status === "error" && proposal.error && (
        <p className="rounded-lg border border-[#F0D4C7] bg-[#FFF7F3] px-2.5 py-1.5 text-xs text-[#8C5F50]">{proposal.error}</p>
      )}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onDiscard} disabled={applying} className="rounded-full border border-[#EDE1D6] px-3 py-1.5 text-xs font-semibold text-[#75675E] transition hover:bg-[#FBF7F1] disabled:opacity-50">
          Descartar
        </button>
        <button type="button" onClick={onApply} disabled={applying} className="rounded-full bg-[#7F9A74] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[#607A56] disabled:cursor-not-allowed disabled:opacity-60">
          {applying ? "Aplicando..." : proposal.applyLabel}
        </button>
      </div>
    </div>
  );
}
