import { d1Execute, d1Query } from "@/lib/d1/client";

/**
 * FASE 6 (item 8/9) — feedback da nutricionista sobre o piloto de busca
 * canônica. So ESCRITA + LEITURA simples — nenhuma função aqui altera
 * alias/ranking/policy (item 9: "não auto-aprender"). Servirá de insumo
 * pra revisão HUMANA futura, nunca um pipeline automático.
 */
export type CanonicalFeedbackOutcome = "CORRECT" | "WRONG" | "CHANGED_SELECTION";

export interface CanonicalFeedbackInput {
  queryHash: string;
  suggestedCanonicalFoodId: string | null;
  suggestedMatchClass: string | null;
  chosenSource: string | null;
  chosenSourceId: string | null;
  outcome: CanonicalFeedbackOutcome;
  adminId: string | null;
}

export interface CanonicalFeedbackRow extends CanonicalFeedbackInput {
  id: string;
  createdAt: string;
}

export async function recordCanonicalResolutionFeedback(input: CanonicalFeedbackInput): Promise<void> {
  const id = crypto.randomUUID();
  await d1Execute(
    `INSERT INTO canonical_resolution_feedback
      (id, query_hash, suggested_canonical_food_id, suggested_match_class, chosen_source, chosen_source_id, outcome, admin_id, created_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)`,
    [id, input.queryHash, input.suggestedCanonicalFoodId, input.suggestedMatchClass, input.chosenSource, input.chosenSourceId, input.outcome, input.adminId, new Date().toISOString()]
  );
}

/** So pra revisão manual/relatórios — nunca chamada por nenhum job automático. */
export async function listCanonicalResolutionFeedback(limit = 200): Promise<CanonicalFeedbackRow[]> {
  const rows = await d1Query<Record<string, unknown>>(
    `SELECT id, query_hash, suggested_canonical_food_id, suggested_match_class, chosen_source, chosen_source_id, outcome, admin_id, created_at
       FROM canonical_resolution_feedback ORDER BY created_at DESC LIMIT ?1`,
    [Math.max(1, Math.min(1000, limit))]
  );
  return rows.map((row) => ({
    id: String(row.id),
    queryHash: String(row.query_hash),
    suggestedCanonicalFoodId: (row.suggested_canonical_food_id as string | null) ?? null,
    suggestedMatchClass: (row.suggested_match_class as string | null) ?? null,
    chosenSource: (row.chosen_source as string | null) ?? null,
    chosenSourceId: (row.chosen_source_id as string | null) ?? null,
    outcome: row.outcome as CanonicalFeedbackOutcome,
    adminId: (row.admin_id as string | null) ?? null,
    createdAt: String(row.created_at),
  }));
}
