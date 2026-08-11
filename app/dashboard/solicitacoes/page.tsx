"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Clock, MessageSquareText, XCircle } from "lucide-react";

type PatientRequestStatus = "pending_review" | "reviewed" | "resolved" | "dismissed";
type PatientRequestType =
  | "food_substitution"
  | "meal_plan_difficulty"
  | "symptom_or_complaint"
  | "appointment_request"
  | "task_difficulty"
  | "general_question"
  | "other";

interface PatientRequestItem {
  id: string;
  clientId: string;
  clientName: string | null;
  requestType: PatientRequestType;
  patientText: string;
  aiSummary: string | null;
  mealPlanId: string | null;
  mealId: string | null;
  itemId: string | null;
  appointmentId: string | null;
  clientTaskId: string | null;
  status: PatientRequestStatus;
  adminNotes: string | null;
  reviewedAt: string | null;
  createdAt: string;
}

const REQUEST_TYPE_LABELS: Record<PatientRequestType, string> = {
  food_substitution: "Substituição alimentar",
  meal_plan_difficulty: "Dificuldade com o plano",
  symptom_or_complaint: "Sintoma ou queixa",
  appointment_request: "Pedido sobre consulta",
  task_difficulty: "Dificuldade com tarefa",
  general_question: "Dúvida geral",
  other: "Outro assunto",
};

const STATUS_LABELS: Record<PatientRequestStatus, string> = {
  pending_review: "Aguardando revisão",
  reviewed: "Revisado",
  resolved: "Resolvido",
  dismissed: "Descartado",
};

const STATUS_TABS: { id: PatientRequestStatus | "all"; label: string }[] = [
  { id: "pending_review", label: "Aguardando revisão" },
  { id: "reviewed", label: "Revisados" },
  { id: "resolved", label: "Resolvidos" },
  { id: "dismissed", label: "Descartados" },
  { id: "all", label: "Todos" },
];

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }).format(date);
}

function contextLabel(item: PatientRequestItem): string | null {
  if (item.itemId) return "Refere-se a um item específico do plano alimentar.";
  if (item.mealId) return "Refere-se a uma refeição do plano alimentar.";
  if (item.mealPlanId) return "Refere-se ao plano alimentar ativo.";
  if (item.appointmentId) return "Refere-se a uma consulta agendada.";
  if (item.clientTaskId) return "Refere-se a uma tarefa.";
  return null;
}

export default function PatientRequestsPage() {
  const [items, setItems] = useState<PatientRequestItem[]>([]);
  const [statusFilter, setStatusFilter] = useState<PatientRequestStatus | "all">("pending_review");
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [notesDraft, setNotesDraft] = useState<Record<string, string>>({});

  async function load() {
    setLoading(true);
    const params = statusFilter === "all" ? "" : `?status=${statusFilter}`;
    const response = await fetch(`/api/admin/patient-requests${params}`, { cache: "no-store" });
    if (response.ok) {
      const data = await response.json() as { items: PatientRequestItem[] };
      setItems(data.items);
    }
    setLoading(false);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  async function updateStatus(id: string, status: PatientRequestStatus) {
    setSavingId(id);
    const response = await fetch(`/api/admin/patient-requests/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, adminNotes: notesDraft[id] }),
    });
    if (response.ok) await load();
    setSavingId(null);
  }

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6">
        <h1 className="font-serif text-2xl font-semibold text-[#3A3028]">Solicitações dos pacientes</h1>
        <p className="mt-1 text-sm text-[#75675E]">
          Pedidos enviados pelas pacientes pelo assistente do portal — nunca uma alteração automática. Revise e decida o próximo passo.
        </p>
      </div>

      <div className="mb-5 flex flex-wrap gap-2">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setStatusFilter(tab.id)}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
              statusFilter === tab.id
                ? "border-[#7F9A74] bg-[#7F9A74] text-white"
                : "border-[#EDE1D6] bg-white text-[#75675E] hover:bg-[#FBF7F1]"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-[#75675E]">Carregando...</p>
      ) : items.length === 0 ? (
        <p className="rounded-2xl border border-[#EDE1D6] bg-white px-4 py-6 text-center text-sm text-[#75675E]">
          Nenhuma solicitação nessa categoria.
        </p>
      ) : (
        <div className="space-y-3">
          {items.map((item) => {
            const expanded = expandedId === item.id;
            const saving = savingId === item.id;
            return (
              <div key={item.id} className="rounded-2xl border border-[#EDE1D6] bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-[#3A3028]">{item.clientName ?? "Paciente"}</p>
                      <span className="rounded-full bg-[#EAF0E4] px-2.5 py-0.5 text-[11px] font-semibold text-[#607A56]">
                        {REQUEST_TYPE_LABELS[item.requestType]}
                      </span>
                      <span className="rounded-full bg-[#F3E6DE] px-2.5 py-0.5 text-[11px] font-semibold text-[#8C5F50]">
                        {STATUS_LABELS[item.status]}
                      </span>
                    </div>
                    <p className="mt-1.5 line-clamp-2 text-sm text-[#4F453D]">{item.patientText}</p>
                    <p className="mt-1 text-[11px] text-[#A9978A]">{formatDateTime(item.createdAt)}</p>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <Link
                      href={`/dashboard/clients/${item.clientId}`}
                      className="rounded-full border border-[#EDE1D6] px-3 py-1.5 text-xs font-semibold text-[#75675E] hover:bg-[#FBF7F1]"
                    >
                      Abrir paciente
                    </Link>
                    <button
                      type="button"
                      onClick={() => setExpandedId(expanded ? null : item.id)}
                      className="rounded-full border border-[#EDE1D6] px-3 py-1.5 text-xs font-semibold text-[#75675E] hover:bg-[#FBF7F1]"
                    >
                      {expanded ? "Fechar" : "Ver"}
                    </button>
                  </div>
                </div>

                {expanded && (
                  <div className="mt-4 space-y-3 border-t border-[#EDE1D6] pt-4">
                    <div>
                      <p className="mb-1 text-xs font-semibold uppercase tracking-[0.08em] text-[#8C5F50]">Relato da paciente</p>
                      <p className="whitespace-pre-wrap rounded-lg border border-[#EDE1D6] bg-[#FBF7F1] px-3 py-2 text-sm text-[#3A3028]">{item.patientText}</p>
                    </div>
                    {item.aiSummary && (
                      <div>
                        <p className="mb-1 text-xs font-semibold uppercase tracking-[0.08em] text-[#8C5F50]">Resumo (IA)</p>
                        <p className="text-sm text-[#75675E]">{item.aiSummary}</p>
                      </div>
                    )}
                    {contextLabel(item) && (
                      <p className="flex items-center gap-1.5 text-xs text-[#9A6F5E]">
                        <MessageSquareText className="h-3.5 w-3.5" />
                        {contextLabel(item)}
                      </p>
                    )}
                    <div>
                      <p className="mb-1 text-xs font-semibold uppercase tracking-[0.08em] text-[#8C5F50]">Notas internas</p>
                      <textarea
                        value={notesDraft[item.id] ?? item.adminNotes ?? ""}
                        onChange={(event) => setNotesDraft((current) => ({ ...current, [item.id]: event.target.value }))}
                        rows={2}
                        placeholder="Anotação interna (não visível à paciente)..."
                        className="w-full rounded-lg border border-[#EDE1D6] bg-white px-3 py-2 text-sm text-[#3A3028] outline-none focus:border-[#7F9A74]"
                      />
                    </div>
                    <div className="flex flex-wrap justify-end gap-2">
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => void updateStatus(item.id, "reviewed")}
                        className="inline-flex items-center gap-1.5 rounded-full border border-[#EDE1D6] px-3 py-1.5 text-xs font-semibold text-[#75675E] hover:bg-[#FBF7F1] disabled:opacity-50"
                      >
                        <Clock className="h-3.5 w-3.5" /> Marcar como revisado
                      </button>
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => void updateStatus(item.id, "resolved")}
                        className="inline-flex items-center gap-1.5 rounded-full bg-[#7F9A74] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#607A56] disabled:opacity-50"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" /> Resolver
                      </button>
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => void updateStatus(item.id, "dismissed")}
                        className="inline-flex items-center gap-1.5 rounded-full border border-[#EDE1D6] px-3 py-1.5 text-xs font-semibold text-[#75675E] hover:bg-[#FBF7F1] disabled:opacity-50"
                      >
                        <XCircle className="h-3.5 w-3.5" /> Descartar
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
