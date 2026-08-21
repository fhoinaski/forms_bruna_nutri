"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Calculator, X } from "lucide-react";
import { calculateBmiValue, classifyAdultBmi } from "@/lib/clinical/anthropometry";

const CLASSIFICATION_TONE: Record<string, string> = {
  "Baixo peso": "text-[#B5762F]",
  Eutrofia: "text-[#4F7D45]",
  Sobrepeso: "text-[#B5762F]",
  "Obesidade grau I": "text-[#C0533F]",
  "Obesidade grau II": "text-[#C0533F]",
  "Obesidade grau III": "text-[#C0533F]",
};

/**
 * Calculadora rápida de IMC — reutiliza exatamente calculateBmiValue/
 * classifyAdultBmi de lib/clinical/anthropometry.ts (a MESMA função usada no
 * prontuário/evolução clínica). Nenhuma fórmula/classificação nova aqui.
 * Serve adultos em geral (não é a curva pediátrica por percentil nem a
 * classificação de IMC pré-gestacional, que têm suas próprias telas).
 */
export function BmiQuickCalculator() {
  const [open, setOpen] = useState(false);
  const [weight, setWeight] = useState("");
  const [height, setHeight] = useState("");
  // Precisa de portal para document.body: o header do dashboard tem
  // backdrop-blur-xl, e backdrop-filter cria um containing block para
  // descendentes `position: fixed` — sem o portal, o modal ficava preso aos
  // limites do header em vez de cobrir a viewport inteira.
  const [portalReady, setPortalReady] = useState(false);
  useEffect(() => setPortalReady(true), []);

  const bmi = useMemo(() => calculateBmiValue(weight, height), [weight, height]);
  const classification = useMemo(() => classifyAdultBmi(bmi), [bmi]);
  const hasInput = weight.trim().length > 0 || height.trim().length > 0;
  const isInvalid = hasInput && bmi === null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Calculadora rápida de IMC"
        title="Calculadora rápida de IMC"
        className="relative inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-[#EDE1D6] bg-[#FFFDFC] text-[#75675E] transition-colors hover:bg-[#FBF7F1] hover:text-[#3A3028]"
      >
        <Calculator className="h-4 w-4" />
      </button>

      {portalReady && open && createPortal(
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="bmi-calculator-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 px-4 py-6 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <section
            className="w-full max-w-sm rounded-xl border border-[#E8E8E3] bg-white p-5 shadow-[0_28px_90px_rgba(16,24,32,0.18)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.06em] text-[#6B6B65]">Ferramenta rápida</p>
                <h2 id="bmi-calculator-title" className="mt-1 text-lg font-bold text-[#1F1F1C]">
                  Calculadora de IMC
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Fechar"
                className="rounded-lg p-1.5 text-[#8A8A85] transition hover:bg-[#FAFAF8] hover:text-[#1F1F1C]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-[#6B6B65]">Peso (kg)</span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={weight}
                  onChange={(event) => setWeight(event.target.value)}
                  placeholder="Ex: 68,5"
                  className="w-full rounded-lg border border-[#E8E8E3] px-3 py-2 text-sm text-[#1F1F1C] outline-none focus:border-[#4F7D45] focus:ring-2 focus:ring-[#4F7D45]/15"
                  autoFocus
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-[#6B6B65]">Altura (cm)</span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={height}
                  onChange={(event) => setHeight(event.target.value)}
                  placeholder="Ex: 165"
                  className="w-full rounded-lg border border-[#E8E8E3] px-3 py-2 text-sm text-[#1F1F1C] outline-none focus:border-[#4F7D45] focus:ring-2 focus:ring-[#4F7D45]/15"
                />
              </label>
            </div>

            <div className="mt-4 rounded-lg bg-[#FAFAF8] p-4 text-center">
              {bmi !== null ? (
                <>
                  <p className="text-2xl font-bold text-[#1F1F1C]">{bmi.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</p>
                  <p className={`mt-1 text-sm font-semibold ${classification ? CLASSIFICATION_TONE[classification] ?? "text-[#6B6B65]" : "text-[#6B6B65]"}`}>
                    {classification}
                  </p>
                </>
              ) : (
                <p className="text-sm text-[#8A8A85]">
                  {isInvalid ? "Informe peso e altura válidos (maiores que zero)." : "Informe peso e altura para calcular."}
                </p>
              )}
            </div>

            <p className="mt-3 text-[11px] leading-4 text-[#B0B0AA]">
              Classificação de IMC adulto (OMS). Para gestantes ou crianças, use as avaliações específicas no prontuário do paciente.
            </p>
          </section>
        </div>,
        document.body
      )}
    </>
  );
}
