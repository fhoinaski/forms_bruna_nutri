"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Sparkles } from "lucide-react";

/**
 * Modal pequeno para coletar um pedido opcional em texto livre antes de
 * chamar uma sugestao de IA. Substitui o uso de window.prompt() (que
 * aparece como um alerta feio do navegador) por um dialogo no estilo do
 * restante do sistema.
 */
export function AiInstructionsModal({
  open,
  description,
  onCancel,
  onSubmit,
}: {
  open: boolean;
  description?: string;
  onCancel: () => void;
  onSubmit: (instructions: string) => void;
}) {
  const [instructions, setInstructions] = useState("");
  const [portalReady, setPortalReady] = useState(false);

  useEffect(() => {
    setPortalReady(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    setInstructions("");
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  if (!open || !portalReady) return null;

  return createPortal(
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-black/30 px-3 py-3 backdrop-blur-sm sm:px-4 sm:py-6">
      <section className="flex w-full max-w-md flex-col overflow-hidden rounded-[1.25rem] border border-[#EDE1D6] bg-[#FFFDFC] shadow-[0_28px_90px_rgba(58,48,40,0.24)]">
        <div className="shrink-0 border-b border-[#EDE1D6] px-5 py-4">
          <p className="brand-kicker">Sugerir com IA</p>
          <h2 className="font-serif text-xl font-semibold text-[#3A3028]">Pedido opcional para a IA</h2>
          <p className="mt-1 text-xs leading-5 text-[#75675E]">
            {description ?? "Deixe em branco para uma sugestão livre, ou descreva um pedido específico."}
          </p>
        </div>
        <div className="p-5">
          <input
            autoFocus
            value={instructions}
            onChange={(event) => setInstructions(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") onSubmit(instructions);
            }}
            className="brand-input"
            placeholder="Ex: menos carboidrato, sem laticínio"
          />
        </div>
        <div className="grid shrink-0 gap-3 border-t border-[#EDE1D6] px-5 py-3 sm:flex sm:justify-end">
          <button type="button" onClick={onCancel} className="brand-btn-secondary w-full sm:w-auto">Cancelar</button>
          <button type="button" onClick={() => onSubmit(instructions)} className="brand-btn-primary w-full sm:w-auto">
            <Sparkles className="h-4 w-4" />
            Sugerir
          </button>
        </div>
      </section>
    </div>,
    document.body
  );
}
