"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, BookOpen, CheckCircle2 } from "lucide-react";
import {
  emptyProtocolPhase,
  ProtocolBuilder,
  type ProtocolFormValue,
} from "@/components/protocols/ProtocolBuilder";

const initialValue: ProtocolFormValue = {
  title: "",
  description: "",
  category: "",
  targetGroup: "",
  phases: [emptyProtocolPhase()],
};

export default function NewProtocolPage() {
  const router = useRouter();
  const [value, setValue] = useState(initialValue);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const save = async () => {
    setSaving(true);
    setError("");

    try {
      const response = await fetch("/api/admin/protocols", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: value.title,
          kind: "standard",
          description: value.description || null,
          category: value.category || null,
          phases: value.phases.map((phase) => ({
            ...phase,
            days: phase.days || null,
            objective: phase.objective || null,
            notes: phase.notes || null,
            actions: phase.actions.map((action) => action.trim()).filter(Boolean),
          })),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Não foi possível criar o protocolo.");
      router.push(`/dashboard/protocols/${data.id}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível criar o protocolo.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-16 animate-fade-up">
      <Link href="/dashboard/protocols" className="inline-flex items-center gap-2 text-sm font-medium text-[#607A56] hover:text-[#B47F6A]">
        <ArrowLeft className="h-4 w-4" />
        Voltar à biblioteca
      </Link>

      <header className="overflow-hidden rounded-[1.35rem] border border-[#EDE1D6] bg-[#FFFDFC] shadow-[0_18px_45px_rgba(58,48,40,0.055)]">
        <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="flex min-w-0 flex-col gap-4 p-5 sm:flex-row sm:items-start sm:p-6">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-[#EAF0E4] text-[#607A56]">
              <BookOpen className="h-6 w-6" />
            </div>
            <div className="min-w-0">
              <p className="brand-kicker mb-1">Novo modelo reutilizável</p>
              <h1 className="font-serif text-2xl font-semibold text-[#3A3028] sm:text-3xl">Criar protocolo padrão</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-[#75675E]">
                Monte uma base clínica aplicável a diferentes atendimentos. Depois, use como ponto de partida e personalize para cada cliente.
              </p>
            </div>
          </div>

          <aside className="border-t border-[#EDE1D6] bg-[#FBF7F1] p-5 lg:border-l lg:border-t-0">
            <p className="brand-kicker mb-3">Fluxo sugerido</p>
            <div className="space-y-2 text-sm text-[#75675E]">
              <p className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#607A56]" />Importe um modelo quando fizer sentido.</p>
              <p className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#607A56]" />Ajuste linguagem, fases e ações antes de salvar.</p>
              <p className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#607A56]" />Use a cópia personalizada dentro do prontuário do cliente.</p>
            </div>
          </aside>
        </div>
      </header>

      <ProtocolBuilder value={value} onChange={setValue} onSubmit={save} saving={saving} error={error} />
    </div>
  );
}
