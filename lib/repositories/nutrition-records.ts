import { d1Batch, d1Execute, d1Query } from "@/lib/d1/client";
import { calculateBmiValue, formatClinicalNumber } from "@/lib/clinical/anthropometry";
import { getClientById } from "@/lib/repositories/clients";
import { getSubmissionById } from "@/lib/repositories/submissions";
import { decryptNullableText, encryptJsonValue, encryptNullableText } from "@/lib/security/encrypted-fields";
import { insertNutritionRecordVersion, type NutritionRecordSource } from "@/lib/repositories/nutrition-record-versions";

export interface NutritionRecord {
  id: string;
  client_id: string;
  chief_complaint: string | null;
  life_stage: string | null;
  biological_sex: string | null;
  target_group: string | null;
  gestational_weeks: string | null;
  breastfeeding_context: string | null;
  clinical_history: string | null;
  diagnoses: string | null;
  medications: string | null;
  supplements: string | null;
  allergies: string | null;
  restrictions: string | null;
  food_preferences: string | null;
  food_aversions: string | null;
  eating_routine: string | null;
  intestinal_health: string | null;
  sleep_routine: string | null;
  stress_context: string | null;
  physical_activity: string | null;
  hydration: string | null;
  current_weight_kg: string | null;
  height_cm: string | null;
  bmi: string | null;
  pre_pregnancy_weight_kg: string | null;
  waist_cm: string | null;
  pre_surgery_weight_kg: string | null;
  bariatric_surgery_date: string | null;
  anthropometry_notes: string | null;
  pediatric_growth_notes: string | null;
  target_weight_kg: string | null;
  target_notes: string | null;
  exams: string | null;
  assessment: string | null;
  goals: string | null;
  care_plan: string | null;
  risk_flags: string | null;
  family_context: string | null;
  private_notes: string | null;
  version: number;
  created_at: string;
  updated_at: string;
}

export type NutritionRecordInput = Omit<
  NutritionRecord,
  "id" | "client_id" | "version" | "created_at" | "updated_at"
>;

export const FIELDS: (keyof NutritionRecordInput)[] = [
  "chief_complaint",
  "life_stage",
  "biological_sex",
  "target_group",
  "gestational_weeks",
  "breastfeeding_context",
  "clinical_history",
  "diagnoses",
  "medications",
  "supplements",
  "allergies",
  "restrictions",
  "food_preferences",
  "food_aversions",
  "eating_routine",
  "intestinal_health",
  "sleep_routine",
  "stress_context",
  "physical_activity",
  "hydration",
  "current_weight_kg",
  "height_cm",
  "bmi",
  "pre_pregnancy_weight_kg",
  "waist_cm",
  "pre_surgery_weight_kg",
  "bariatric_surgery_date",
  "anthropometry_notes",
  "pediatric_growth_notes",
  "target_weight_kg",
  "target_notes",
  "exams",
  "assessment",
  "goals",
  "care_plan",
  "risk_flags",
  "family_context",
  "private_notes",
];

function decryptNutritionRecord(row: NutritionRecord | undefined): NutritionRecord | null {
  if (!row) return null;
  const decrypted = { ...row };
  for (const field of FIELDS) {
    decrypted[field] = decryptNullableText(row[field]) as never;
  }
  return decrypted;
}

function encryptNutritionField(value: string | null | undefined): string | null {
  return encryptNullableText(value);
}

/** Snapshot clínico (somente os campos do prontuário) — nunca metadados internos. */
function snapshotOfRecord(record: NutritionRecord): Record<string, unknown> {
  const snapshot: Record<string, unknown> = {};
  for (const field of FIELDS) snapshot[field] = record[field];
  return snapshot;
}

function answer(answers: Record<string, unknown>, keys: string[]): string | null {
  const values = keys
    .map((key) => answers[key])
    .filter((value) => typeof value === "string" && value.trim().length > 0)
    .map((value) => String(value).trim());
  return values.length > 0 ? values.join("\n") : null;
}

async function buildInitialRecord(clientId: string): Promise<NutritionRecordInput> {
  const client = await getClientById(clientId);
  const submission = client?.source_submission_id
    ? await getSubmissionById(client.source_submission_id)
    : null;
  const answers = submission?.answers ?? {};

  return {
    chief_complaint: answer(answers, ["motivacao", "queixa", "principalQueixa"]),
    life_stage: answer(answers, ["tipoAtendimento"]),
    biological_sex: answer(answers, ["sexo", "sexoBiologico"]),
    target_group: null,
    gestational_weeks: answer(answers, ["gestante", "semanasGestacao", "idadeGestacional"]),
    breastfeeding_context: answer(answers, ["amamentacao", "aleitamento", "posParto"]),
    clinical_history: answer(answers, ["historico", "historicoClinico", "gestacao", "posParto"]),
    diagnoses: answer(answers, ["diagnostico", "diagnosticos", "doencas"]),
    medications: answer(answers, ["medicacao", "medicamentos"]),
    supplements: answer(answers, ["suplementos", "suplementacao"]),
    allergies: answer(answers, ["alergias", "alergia"]),
    restrictions: answer(answers, ["restricoes", "restricao", "naoPodeComer"]),
    food_preferences: answer(answers, ["preferencias", "gosta", "alimentosPreferidos"]),
    food_aversions: answer(answers, ["naoGosta", "aversoes", "dificuldadesAlimentares"]),
    eating_routine: answer(answers, ["rotinaAlimentar", "diaAlimentar", "rotina", "alimentacaoAtual"]),
    intestinal_health: answer(answers, ["intestino", "intestinoFreq", "desconforto", "sintomasGastrointestinais"]),
    sleep_routine: answer(answers, ["sono", "sonoHoras", "descansada"]),
    stress_context: answer(answers, ["estresse", "ansiedade", "emocional"]),
    physical_activity: answer(answers, ["atividadeFisica", "exercicio"]),
    hydration: answer(answers, ["agua", "hidratacao", "consumoAgua"]),
    current_weight_kg: answer(answers, ["peso", "pesoAtual"]),
    height_cm: answer(answers, ["altura"]),
    bmi: null,
    pre_pregnancy_weight_kg: answer(answers, ["pesoPreGestacional", "pesoAntesGestacao"]),
    waist_cm: answer(answers, ["cintura", "circunferenciaCintura"]),
    pre_surgery_weight_kg: null,
    bariatric_surgery_date: null,
    anthropometry_notes: null,
    pediatric_growth_notes: answer(answers, ["crescimento", "curvaCrescimento", "pediatra"]),
    target_weight_kg: null,
    target_notes: null,
    exams: answer(answers, ["exames", "examesRecentes", "laboratorio"]),
    assessment: null,
    goals: answer(answers, ["objetivo", "objetivos", "expectativas"]),
    care_plan: null,
    risk_flags: null,
    family_context: answer(answers, ["tipoAtendimento", "redeApoio", "familia", "filhos"]),
    private_notes: null,
  };
}

export async function getNutritionRecord(clientId: string): Promise<NutritionRecord | null> {
  const existing = await getExistingNutritionRecord(clientId);
  if (existing) return existing;

  const client = await getClientById(clientId);
  if (!client) return null;

  const initial = await buildInitialRecord(clientId);
  return createNutritionRecord(clientId, initial);
}

export async function getExistingNutritionRecord(clientId: string): Promise<NutritionRecord | null> {
  const rows = await d1Query<NutritionRecord>(
    "SELECT * FROM nutrition_records WHERE client_id = ?1 LIMIT 1",
    [clientId]
  );
  return decryptNutritionRecord(rows[0]);
}

export async function createNutritionRecord(
  clientId: string,
  input: NutritionRecordInput
): Promise<NutritionRecord> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await d1Execute(
    `INSERT OR IGNORE INTO nutrition_records
      (id, client_id, version, ${FIELDS.join(", ")}, created_at, updated_at)
     VALUES (?1, ?2, 1, ${FIELDS.map((_, index) => `?${index + 3}`).join(", ")}, ?${FIELDS.length + 3}, ?${FIELDS.length + 4})`,
    [id, clientId, ...FIELDS.map((field) => encryptNutritionField(input[field])), now, now]
  );
  const record = await d1Query<NutritionRecord>(
    "SELECT * FROM nutrition_records WHERE client_id = ?1 LIMIT 1",
    [clientId]
  );
  const decrypted = decryptNutritionRecord(record[0]);
  if (!decrypted) throw new Error("Nao foi possivel criar o prontuario nutricional.");

  // Snapshot inicial (versão 1) — idempotente por (nutrition_record_id, version).
  await insertNutritionRecordVersion({
    nutritionRecordId: decrypted.id,
    clientId,
    version: 1,
    snapshot: snapshotOfRecord(decrypted),
    source: "system",
    createdAt: now,
  });

  return decrypted;
}

export class NutritionRecordVersionConflictError extends Error {
  constructor() {
    super("O prontuário foi atualizado em outra sessão. Recarregue antes de salvar.");
    this.name = "NutritionRecordVersionConflictError";
  }
}

export interface UpdateNutritionRecordOptions {
  /** Versão esperada (optimistic concurrency). Se omitida, usa a versão atual lida. */
  expectedVersion?: number;
  source?: NutritionRecordSource;
  changedByAdminId?: string | null;
  consultationSessionId?: string | null;
  reason?: string | null;
}

function isVersionConflictError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  // Conflito concorrente: outra escrita já criou a versão nextVersion, e o
  // UNIQUE (nutrition_record_id, version) fez o batch (transação) dar rollback.
  return /UNIQUE constraint failed: nutrition_record_versions/i.test(error.message);
}

/**
 * Escrita CANÔNICA do prontuário (versionada e auditável).
 *
 * - valida/no-op: salvar os mesmos dados não cria versão;
 * - optimistic concurrency: checagem antecipada (`expectedVersion` vs versão
 *   atual) + `WHERE version = expected` → 409 em conflito;
 * - atomicidade: snapshot + UPDATE num único `d1Batch` (transação D1); o
 *   UNIQUE (nutrition_record_id, version) força ROLLBACK em corrida concorrente;
 * - autoria/source SEMPRE do servidor (nunca do frontend);
 * - snapshot histórico cifrado (finalidade clinical), nunca plaintext.
 */
export async function updateNutritionRecord(
  clientId: string,
  input: Partial<NutritionRecordInput>,
  options: UpdateNutritionRecordOptions = {}
): Promise<NutritionRecord> {
  const source = options.source ?? "manual";
  const existing = await getExistingNutritionRecord(clientId);
  if (!existing) throw new Error("Cliente nao encontrado.");

  const normalized = { ...input } as Partial<NutritionRecordInput>;
  if (normalized.bmi === undefined && (normalized.current_weight_kg !== undefined || normalized.height_cm !== undefined)) {
    const weight = normalized.current_weight_kg ?? existing.current_weight_kg;
    const height = normalized.height_cm ?? existing.height_cm;
    normalized.bmi = formatClinicalNumber(calculateBmiValue(weight, height));
  }

  // No-op: nenhuma mudança semântica → retorna o estado atual sem criar versão.
  const hasChanges = FIELDS.some(
    (field) => normalized[field] !== undefined && normalized[field] !== existing[field]
  );
  if (!hasChanges) return existing;

  const nextVersion = existing.version + 1;
  const expected = options.expectedVersion ?? existing.version;

  // Conflito detectado ANTES de qualquer escrita: o cliente informou uma versão
  // esperada diferente da versão atual lida do servidor. Evita snapshot fantasma
  // sem depender de RAISE() (que o SQLite só aceita dentro de trigger). A
  // proteção contra corrida concorrente fica por conta do UNIQUE
  // (nutrition_record_id, version): se outra escrita já criou a versão
  // nextVersion, o INSERT falha e o batch (transação) faz rollback.
  if (options.expectedVersion !== undefined && options.expectedVersion !== existing.version) {
    throw new NutritionRecordVersionConflictError();
  }

  const now = new Date().toISOString();
  const versionId = crypto.randomUUID();
  const nextState = { ...existing, ...normalized } as NutritionRecord;

  const updates: string[] = [];
  const params: unknown[] = [];
  let index = 1;
  for (const field of FIELDS) {
    if (normalized[field] !== undefined) {
      updates.push(`${field} = ?${index++}`);
      params.push(encryptNutritionField(normalized[field]));
    }
  }
  updates.push(`version = ?${index++}`);
  params.push(nextVersion);
  updates.push(`updated_at = ?${index++}`);
  params.push(now);

  const whereClientIdParam = index;
  const whereVersionParam = index + 1;
  params.push(clientId); // WHERE client_id
  params.push(expected); // WHERE version

  try {
    await d1Batch([
      {
        sql: `INSERT INTO nutrition_record_versions
          (id, nutrition_record_id, client_id, version, encrypted_snapshot, changed_by_admin_id, source, consultation_session_id, reason, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)`,
        params: [
          versionId,
          existing.id,
          clientId,
          nextVersion,
          encryptJsonValue(snapshotOfRecord(nextState)),
          options.changedByAdminId ?? null,
          source,
          options.consultationSessionId ?? null,
          options.reason ?? null,
          now,
        ],
      },
      {
        sql: `UPDATE nutrition_records SET ${updates.join(", ")} WHERE client_id = ?${whereClientIdParam} AND version = ?${whereVersionParam}`,
        params,
      },
    ]);
  } catch (error) {
    if (isVersionConflictError(error)) throw new NutritionRecordVersionConflictError();
    throw error;
  }

  const rows = await d1Query<NutritionRecord>(
    "SELECT * FROM nutrition_records WHERE client_id = ?1 LIMIT 1",
    [clientId]
  );
  const decrypted = decryptNutritionRecord(rows[0]);
  if (!decrypted) throw new Error("Nao foi possivel carregar o prontuario nutricional.");
  return decrypted;
}
