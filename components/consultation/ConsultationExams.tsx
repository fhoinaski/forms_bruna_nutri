"use client";

/**
 * Exames (secao 14) — hoje o prontuario so tem um campo de texto livre
 * ("exams"). Sem migracao destrutiva: mostra o campo existente tal como
 * esta. Estruturar dados de laboratorio fica para uma fase futura (FASE 4
 * do pedido master), fora do escopo desta rodada — confirmado por
 * auditoria: nao existe hoje nenhuma tabela/estrutura de exames.
 */
export function ConsultationExams({ examsText, onAskCopilotToSummarize }: { examsText: string | null; onAskCopilotToSummarize: () => void }) {
  return (
    <div className="rounded-2xl border border-[#EDE1D6] bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-serif text-lg font-semibold text-[#3A3028]">Exames</h2>
        {examsText?.trim() && (
          <button type="button" onClick={onAskCopilotToSummarize} className="text-xs font-semibold text-[#75675E] hover:text-[#3A3028]">
            Resumir com IA
          </button>
        )}
      </div>
      {examsText?.trim() ? (
        <p className="mt-2 whitespace-pre-wrap text-sm text-[#3A3028]">{examsText}</p>
      ) : (
        <p className="mt-2 text-sm text-[#75675E]">Nenhum exame registrado no prontuário.</p>
      )}
    </div>
  );
}
