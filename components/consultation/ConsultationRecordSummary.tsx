"use client";

import Link from "next/link";
import { NUTRITION_TEXT_FIELD_LABELS, type NutritionRecordTextFieldKey } from "@/lib/clinical/nutrition-record-fields";

// Campos que a proposta "Organizar notas com IA" (nutrition_record) mais
// costuma preencher durante uma consulta — mesmo mapeamento descrito em
// CONSULTATION_ASSISTANT_INSTRUCTIONS (consultation-agent.ts): sintomas/
// queixas -> intestinal_health/risk_flags, alimentacao/rotina ->
// eating_routine, adesao/avaliacao -> assessment, conduta -> care_plan,
// metas -> target_notes.
const SUMMARY_FIELDS: NutritionRecordTextFieldKey[] = [
  "intestinal_health",
  "risk_flags",
  "eating_routine",
  "assessment",
  "care_plan",
  "target_notes",
];

export type ConsultationRecordFields = Partial<Record<NutritionRecordTextFieldKey, string | null>>;

/**
 * Mostra o que ja esta gravado no prontuario para os campos que a proposta
 * de "organizar notas" costuma preencher. Existe porque confirmar essa
 * proposta grava direto em nutrition_records — sem isto, a unica pista de
 * que algo aconteceu era o card da proposta sumir do Copiloto, o que parecia
 * "nao fazer nada" (o texto some, mas nao aparece em lugar nenhum da tela).
 */
export function ConsultationRecordSummary({ clientId, record }: { clientId: string; record: ConsultationRecordFields | null }) {
  const filled = SUMMARY_FIELDS
    .map((key) => ({ key, label: NUTRITION_TEXT_FIELD_LABELS[key], value: record?.[key]?.trim() || null }))
    .filter((entry) => entry.value);

  return (
    <div className="space-y-2 rounded-2xl border border-[#EDE1D6] bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-serif text-lg font-semibold text-[#3A3028]">Prontuário desta consulta</h2>
        <Link
          href={`/dashboard/clients/${clientId}?tab=anamnese`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs font-semibold text-[#75675E] hover:text-[#3A3028]"
        >
          Ver prontuário completo (nova aba)
        </Link>
      </div>
      {filled.length === 0 ? (
        <p className="text-sm text-[#75675E]">
          Nenhum campo do prontuário preenchido ainda nesta consulta. Use &quot;Organizar notas com IA&quot; e confirme a proposta para preencher.
        </p>
      ) : (
        <dl className="space-y-2.5">
          {filled.map((entry) => (
            <div key={entry.key}>
              <dt className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#9A6F5E]">{entry.label}</dt>
              <dd className="mt-0.5 whitespace-pre-wrap text-sm text-[#3A3028]">{entry.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
