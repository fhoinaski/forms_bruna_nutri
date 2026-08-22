import type { NutrientValueStatus } from "@/lib/nutrition-import/types";

/**
 * Normalizacao de status por fonte (FASE 7/8/9 + regra critica de trace).
 * As tres fontes ja usam os mesmos rotulos de status no formato comum
 * (nutritional_schema.json), entao isso e principalmente uma validacao —
 * mas centralizada aqui para que a regra "trace nunca vira zero" tenha um
 * unico lugar para ser auditada/testada.
 */
const KNOWN_STATUSES: readonly NutrientValueStatus[] = [
  "reported",
  "trace",
  "missing",
  "not_applicable",
  "unparsed",
];

export function normalizeStatus(rawStatus: string | null | undefined): NutrientValueStatus {
  if (!rawStatus) return "missing";
  const trimmed = rawStatus.trim() as NutrientValueStatus;
  if (KNOWN_STATUSES.includes(trimmed)) return trimmed;
  return "unparsed";
}

/**
 * Regra critica (confirmada contra o dado real da TBCA: e comum a fonte
 * trazer `"value": 0, "status": "trace"` junto, ex.: sodio de um alimento
 * onde so ha traco detectavel). "trace com value=0 continua TRACE" — o
 * importador NUNCA reescreve o status para 'reported' so porque value e um
 * numero (incluindo zero), e nunca reescreve value para null so porque o
 * status e trace. Os dois campos sao preservados exatamente como a fonte
 * mandou, lado a lado; quem decide o que fazer com "value numerico + status
 * trace" e o consumidor a jusante (Nutrition Engine, fora desta fase), nunca
 * o importador.
 *
 * Esta funcao documenta/valida a invariante golden-path: dado um par
 * (rawStatus, rawValue) da fonte, o status normalizado nunca pode "perder"
 * um trace/not_applicable/missing explicito da fonte substituindo por
 * 'reported' so por causa do value estar presente.
 */
export function assertStatusPreservesSourceSemantics(rawStatus: string | null | undefined, normalizedStatus: NutrientValueStatus): void {
  const trimmed = rawStatus?.trim();
  if (!trimmed) return;
  if (KNOWN_STATUSES.includes(trimmed as NutrientValueStatus) && trimmed !== normalizedStatus) {
    throw new Error(
      `Violacao da regra critica: status da fonte ('${trimmed}') foi alterado para '${normalizedStatus}'. ` +
        "Status conhecidos (reported/trace/missing/not_applicable/unparsed) devem ser preservados verbatim."
    );
  }
}
