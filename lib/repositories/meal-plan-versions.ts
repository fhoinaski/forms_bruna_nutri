import { d1Execute, d1Query } from "@/lib/d1/client";
import { decryptJsonValue, encryptJsonValue } from "@/lib/security/encrypted-fields";

/**
 * Versionamento imutavel do plano alimentar (FASE 21 do pedido) — espelha o
 * P0 do prontuario (nutrition_record_versions): snapshot cifrado por versao,
 * listagem paginada por version, snapshot completo so ao abrir. Nunca DELETE.
 */

export type MealPlanVersionSource = "manual" | "ai_proposal" | "consultation" | "system";

export interface MealPlanVersionMeta {
  id: string;
  meal_plan_id: string;
  client_id: string;
  version: number;
  changed_by_admin_id: string | null;
  changed_by_name: string | null;
  source: MealPlanVersionSource;
  reason: string | null;
  created_at: string;
}

interface MealPlanVersionRow extends MealPlanVersionMeta {
  encrypted_snapshot: string;
}

const META_COLUMNS =
  "id, meal_plan_id, client_id, version, changed_by_admin_id, source, reason, created_at, (SELECT name FROM admin_users a WHERE a.id = changed_by_admin_id) AS changed_by_name";

export interface InsertMealPlanVersionInput {
  mealPlanId: string;
  clientId: string;
  version: number;
  snapshot: Record<string, unknown>;
  changedByAdminId?: string | null;
  source: MealPlanVersionSource;
  reason?: string | null;
  createdAt?: string;
}

/** Insere um snapshot historico imutavel (cifrado, finalidade clinical). */
export async function insertMealPlanVersion(input: InsertMealPlanVersionInput): Promise<string> {
  const id = crypto.randomUUID();
  await d1Execute(
    `INSERT OR IGNORE INTO meal_plan_versions
       (id, meal_plan_id, client_id, version, encrypted_snapshot, changed_by_admin_id, source, reason, created_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)`,
    [
      id,
      input.mealPlanId,
      input.clientId,
      input.version,
      encryptJsonValue(input.snapshot),
      input.changedByAdminId ?? null,
      input.source,
      input.reason ?? null,
      input.createdAt ?? new Date().toISOString(),
    ]
  );
  return id;
}

/** Lista metadados de versoes (SEM snapshot) — paginado por version (keyset). */
export async function listMealPlanVersions(
  mealPlanId: string,
  limit = 20,
  beforeVersion?: number
): Promise<MealPlanVersionMeta[]> {
  const capped = Math.min(100, Math.max(1, limit));
  if (beforeVersion !== undefined) {
    return d1Query<MealPlanVersionMeta>(
      `SELECT ${META_COLUMNS} FROM meal_plan_versions
       WHERE meal_plan_id = ?1 AND version < ?2
       ORDER BY version DESC LIMIT ?3`,
      [mealPlanId, beforeVersion, capped]
    );
  }
  return d1Query<MealPlanVersionMeta>(
    `SELECT ${META_COLUMNS} FROM meal_plan_versions
     WHERE meal_plan_id = ?1 ORDER BY version DESC LIMIT ?2`,
    [mealPlanId, capped]
  );
}

/** Carrega uma versao especifica (snapshot decifrado) — somente leitura. */
export async function getMealPlanVersion(mealPlanId: string, version: number) {
  const rows = await d1Query<MealPlanVersionRow>(
    `SELECT ${META_COLUMNS}, encrypted_snapshot FROM meal_plan_versions
     WHERE meal_plan_id = ?1 AND version = ?2 LIMIT 1`,
    [mealPlanId, version]
  );
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    meal_plan_id: row.meal_plan_id,
    client_id: row.client_id,
    version: row.version,
    changed_by_admin_id: row.changed_by_admin_id,
    changed_by_name: row.changed_by_name,
    source: row.source,
    reason: row.reason,
    created_at: row.created_at,
    snapshot: decryptJsonValue<Record<string, unknown>>(row.encrypted_snapshot, {}),
  };
}