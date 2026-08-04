"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, BookOpen } from "lucide-react";
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
    <div className="mx-auto max-w-4xl space-y-6 pb-16 animate-fade-up">
      <Link href="/dashboard/protocols" className="inline-flex items-center gap-2 text-sm font-medium text-[#607A56] hover:text-[#B47F6A]">
        <ArrowLeft className="h-4 w-4" />
        Voltar à biblioteca
      </Link>
      <header className="flex items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-[#EAF0E4] text-[#607A56]">
          <BookOpen className="h-6 w-6" />
        </div>
        <div>
          <p className="brand-kicker mb-1">Novo modelo reutilizável</p>
          <h1 className="font-serif text-3xl font-semibold">Criar protocolo padrão</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#75675E]">Crie uma base clínica que poderá ser aplicada diretamente ou copiada e personalizada para cada cliente.</p>
        </div>
      </header>
      <ProtocolBuilder value={value} onChange={setValue} onSubmit={save} saving={saving} error={error} />
    </div>
  );
}
