"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, RefreshCcw, XCircle } from "lucide-react";

interface RecoveryItem {
  id: string;
  kind: string;
  kindLabel: string;
  status: "executing" | "requires_review";
  clientName: string | null;
  detail: string | null;
  createdAt: string;
}

const STATUS_LABELS: Record<RecoveryItem["status"], string> = {
  executing: "Precisa de verificação",
  requires_review: "Aguardando sua confirmação",
};

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }).format(date);
}

export default function AiRecoveryPage() {
  const [items, setItems] = useState<RecoveryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Record<string, string>>({});

  async function load() {
    setLoading(true);
    const response = await fetch("/api/admin/ai/proposals/recovery", { cache: "no-store" });
    if (response.ok) {
      const data = (await response.json()) as { items: RecoveryItem[] };
      setItems(data.items);
    }
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  async function verify(id: string) {
    setBusyId(id);
    const response = await fetch(`/api/admin/ai/proposals/${id}/recover`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const body = await response.json().catch(() => ({}));
    setFeedback((current) => ({
      ...current,
      [id]: response.ok
        ? body.status === "requires_review"
          ? "Não foi possível confirmar sozinho — verifique manualmente e diga o que aconteceu abaixo."
          : "Verificado e concluído com sucesso."
        : (body.message ?? "Não foi possível verificar agora."),
    }));
    await load();
    setBusyId(null);
  }

  async function resolve(id: string, resolution: "already_applied" | "not_applied") {
    setBusyId(id);
    await fetch(`/api/admin/ai/proposals/${id}/recover`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resolution }),
    });
    await load();
    setBusyId(null);
  }

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6">
        <h1 className="font-serif text-2xl font-semibold text-[#3A3028]">Verificações da IA</h1>
        <p className="mt-1 text-sm text-[#75675E]">
          Ações do assistente que não puderam ser confirmadas automaticamente — o sistema nunca tenta de novo sozinho quando não tem certeza do resultado.
        </p>
      </div>

      {loading ? (
        <p className="text-sm text-[#75675E]">Carregando...</p>
      ) : items.length === 0 ? (
        <p className="rounded-2xl border border-[#EDE1D6] bg-white px-4 py-6 text-center text-sm text-[#75675E]">
          Nenhuma ação pendente de verificação no momento.
        </p>
      ) : (
        <div className="space-y-3">
          {items.map((item) => {
            const busy = busyId === item.id;
            return (
              <div key={item.id} className="rounded-2xl border border-[#EDE1D6] bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-[#B5793F]" />
                      <p className="font-semibold text-[#3A3028]">{item.kindLabel}</p>
                      <span className="rounded-full bg-[#F3E6DE] px-2.5 py-0.5 text-[11px] font-semibold text-[#8C5F50]">
                        {STATUS_LABELS[item.status]}
                      </span>
                    </div>
                    <p className="mt-1.5 text-sm text-[#4F453D]">
                      {item.clientName ? `Paciente: ${item.clientName}` : "Sem paciente vinculado"}
                      {item.detail ? ` — ${item.detail}` : ""}
                    </p>
                    <p className="mt-1 text-[11px] text-[#A9978A]">{formatDateTime(item.createdAt)}</p>
                    {feedback[item.id] && (
                      <p className="mt-2 text-xs font-medium text-[#607A56]">{feedback[item.id]}</p>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    {item.status === "executing" && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void verify(item.id)}
                        className="inline-flex items-center gap-1.5 rounded-full bg-[#7F9A74] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#607A56] disabled:opacity-50"
                      >
                        <RefreshCcw className="h-3.5 w-3.5" /> {busy ? "Verificando..." : "Verificar"}
                      </button>
                    )}
                    {item.status === "requires_review" && (
                      <>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void resolve(item.id, "already_applied")}
                          className="inline-flex items-center gap-1.5 rounded-full bg-[#7F9A74] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#607A56] disabled:opacity-50"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" /> Já aconteceu
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void resolve(item.id, "not_applied")}
                          className="inline-flex items-center gap-1.5 rounded-full border border-[#EDE1D6] px-3 py-1.5 text-xs font-semibold text-[#75675E] hover:bg-[#FBF7F1] disabled:opacity-50"
                        >
                          <XCircle className="h-3.5 w-3.5" /> Não aconteceu
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
