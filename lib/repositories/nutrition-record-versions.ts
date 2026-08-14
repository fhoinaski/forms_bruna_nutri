import { d1Query, d1Execute } from "@/lib/d1/client";
import { decryptJsonValue, encryptJsonValue } from "@/lib/security/encrypted-fields";

/**
 * Origem de uma alteração no prontuário. Controlada SEMPRE pelo servidor —
 * nunca aceita valor arbitrário vindo do frontend.
 */
export type NutritionRecordSource =
  | "manual"
  | "consultation"
  | "ai_proposal"
  | "pre_consultation"
  | "import"
  | "system";

export interface NutritionRecordVersionMeta {
  id: string;
  nutrition_record_id: string;
  client_id: string;
  version: number;
  changed_by_admin_id: string | null;
  changed_by_name: string | null;
  source: NutritionRecordSource;
  consultation_session_id: string | null;
  reason: string | null;
  created_at: string;
}

interface NutritionRecordVersionRow extends NutritionRecordVersionMeta {
  encrypted_snapshot: string;
}

const META_COLUMNS =
  "id, nutrition_record_id, client_id, version, changed_by_admin_id, source, consultation_session_id, reason, created_at, (SELECT name FROM admin_users a WHERE a.id = changed_by_admin_id) AS changed_by_name";

export interface InsertNutritionRecordVersionInput {
  nutritionRecordId: string;
  clientId: string;
  version: number;
  snapshot: Record<string, unknown>;
  changedByAdminId?: string | null;
  source: NutritionRecordSource;
  consultationSessionId?: string | null;
  reason?: string | null;
  createdAt?: string;
}

/**
 * Insere um snapshot histórico imutável. O snapshot é cifrado (finalidade
 * "clinical") antes de persistir — nunca plaintext no D1.
 */
export async function insertNutritionRecordVersion(input: InsertNutritionRecordVersionInput): Promise<string> {
  const id = crypto.randomUUID();
  await d1Execute(
    `INSERT OR IGNORE INTO nutrition_record_versions
       (id, nutrition_record_id, client_id, version, encrypted_snapshot, changed_by_admin_id, source, consultation_session_id, reason, created_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)`,
    [
      id,
      input.nutritionRecordId,
      input.clientId,
      input.version,
      encryptJsonValue(input.snapshot),
      input.changedByAdminId ?? null,
      input.source,
      input.consultationSessionId ?? null,
      input.reason ?? null,
      input.createdAt ?? new Date().toISOString(),
    ]
  );
  return id;
}

/**
 * Lista metadados de versões (SEM snapshot — lazy/paginado por `version`).
 * Ordenado da mais recente para a mais antiga. `beforeVersion` exclui as
 * versões >= ele (cursor).
 */
export async function listNutritionRecordVersions(
  clientId: string,
  limit = 20,
  beforeVersion?: number
): Promise<NutritionRecordVersionMeta[]> {
  const capped = Math.min(100, Math.max(1, limit));
  if (beforeVersion !== undefined) {
    return d1Query<NutritionRecordVersionMeta>(
      `SELECT ${META_COLUMNS} FROM nutrition_record_versions
       WHERE client_id = ?1 AND version < ?2
       ORDER BY version DESC LIMIT ?3`,
      [clientId, beforeVersion, capped]
    );
  }
  return d1Query<NutritionRecordVersionMeta>(
    `SELECT ${META_COLUMNS} FROM nutrition_record_versions
     WHERE client_id = ?1 ORDER BY version DESC LIMIT ?2`,
    [clientId, capped]
  );
}

/** Carrega uma versão específica (snapshot decifrado) — somente leitura. */
export async function getNutritionRecordVersion(clientId: string, version: number) {
  const rows = await d1Query<NutritionRecordVersionRow>(
    `SELECT ${META_COLUMNS}, encrypted_snapshot FROM nutrition_record_versions
     WHERE client_id = ?1 AND version = ?2 LIMIT 1`,
    [clientId, version]
  );
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    nutrition_record_id: row.nutrition_record_id,
    client_id: row.client_id,
    version: row.version,
    changed_by_admin_id: row.changed_by_admin_id,
    changed_by_name: row.changed_by_name,
    source: row.source,
    consultation_session_id: row.consultation_session_id,
    reason: row.reason,
    created_at: row.created_at,
    snapshot: decryptJsonValue<Record<string, unknown>>(row.encrypted_snapshot, {}),
  };
}

/** Todas as versões (com snapshot decifrado) — usado no export LGPD. */
export async function getAllNutritionRecordVersions(clientId: string) {
  const rows = await d1Query<NutritionRecordVersionRow>(
    `SELECT ${META_COLUMNS}, encrypted_snapshot FROM nutrition_record_versions
     WHERE client_id = ?1 ORDER BY version ASC`,
    [clientId]
  );
  return rows.map((row) => ({
    id: row.id,
    nutrition_record_id: row.nutrition_record_id,
    client_id: row.client_id,
    version: row.version,
    changed_by_admin_id: row.changed_by_admin_id,
    changed_by_name: row.changed_by_name,
    source: row.source,
    consultation_session_id: row.consultation_session_id,
    reason: row.reason,
    created_at: row.created_at,
    snapshot: decryptJsonValue<Record<string, unknown>>(row.encrypted_snapshot, {}),
  }));
}
