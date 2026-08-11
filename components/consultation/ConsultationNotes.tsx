"use client";

import { useEffect, useRef, useState } from "react";
import { Sparkles } from "lucide-react";

/**
 * Anotacoes rapidas da consulta (secao 8). Salva automaticamente (debounce)
 * via PATCH — texto livre, cifrado em repouso pelo repository. "Organizar
 * com IA" envia o texto atual como mensagem para o Copiloto (Area C), que
 * usa a MESMA proposta de prontuario ja existente (nunca uma tool nova) —
 * a IA NUNCA salva sozinha, so o clique em "Confirmar" no card de proposta
 * aplica ao prontuario.
 */
export function ConsultationNotes({
  consultationSessionId,
  initialNotes,
  onOrganizeWithAI,
}: {
  consultationSessionId: string;
  initialNotes: string;
  onOrganizeWithAI: (notes: string) => void;
}) {
  const [notes, setNotes] = useState(initialNotes);
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  function handleChange(value: string) {
    setNotes(value);
    setStatus("saving");
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        await fetch(`/api/admin/consultation-sessions/${consultationSessionId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ notes: value }),
        });
        setStatus("saved");
      } catch {
        setStatus("idle");
      }
    }, 800);
  }

  return (
    <div className="space-y-2 rounded-2xl border border-[#EDE1D6] bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-serif text-lg font-semibold text-[#3A3028]">Anotações da consulta</h2>
        <span className="text-[11px] text-[#9A978A]">
          {status === "saving" ? "Salvando..." : status === "saved" ? "Salvo" : ""}
        </span>
      </div>
      <textarea
        value={notes}
        onChange={(event) => handleChange(event.target.value)}
        rows={6}
        placeholder="Escreva livremente durante o atendimento: sintomas, alimentação, adesão, atividade física, o que combinar..."
        className="brand-input w-full resize-y"
      />
      <button
        type="button"
        disabled={!notes.trim()}
        onClick={() => onOrganizeWithAI(notes)}
        className="inline-flex items-center gap-1.5 rounded-full border border-[#D9E4D3] bg-[#EEF3EA] px-3 py-1.5 text-xs font-semibold text-[#4F6847] hover:bg-[#E1EBDB] disabled:opacity-50"
      >
        <Sparkles className="h-3.5 w-3.5" /> Organizar notas com IA
      </button>
      <p className="text-[11px] text-[#9A978A]">A IA nunca salva sozinha — ela prepara uma proposta de atualização do prontuário para você revisar e confirmar.</p>
    </div>
  );
}
