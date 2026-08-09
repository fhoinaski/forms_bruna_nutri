import { d1Query, d1Execute } from "@/lib/d1/client";
import { calculateBmiValue } from "@/lib/clinical/anthropometry";
import { decryptJsonValue, encryptJsonValue } from "@/lib/security/encrypted-fields";

export interface ClientEvolution {
  id: string;
  client_id: string;
  client_protocol_id: string | null;
  measured_at: string | null;
  weight: number | null;
  height: number | null;
  bmi: number | null;
  waist_cm: number | null;
  hip_cm: number | null;
  arm_cm: number | null;
  body_fat_percentage: number | null;
  blood_pressure: string | null;
  energy_level: number | null;
  appetite: string | null;
  bowel_pattern: string | null;
  sleep_quality: string | null;
  symptoms: string | null;
  adherence_notes: string | null;
  adherence_score: number | null;
  progress_notes: string | null;
  conduct_notes: string | null;
  clinical_impression: string | null;
  next_steps: string | null;
  encrypted_payload?: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateEvolutionInput {
  client_id: string;
  client_protocol_id?: string | null;
  measured_at?: string | null;
  weight?: number | null;
  height?: number | null;
  waist_cm?: number | null;
  hip_cm?: number | null;
  arm_cm?: number | null;
  body_fat_percentage?: number | null;
  blood_pressure?: string | null;
  energy_level?: number | null;
  appetite?: string | null;
  bowel_pattern?: string | null;
  sleep_quality?: string | null;
  symptoms?: string | null;
  adherence_notes?: string | null;
  adherence_score?: number | null;
  progress_notes?: string | null;
  conduct_notes?: string | null;
  clinical_impression?: string | null;
  next_steps?: string | null;
}

type EvolutionPayload = Omit<ClientEvolution, "id" | "client_id" | "client_protocol_id" | "measured_at" | "created_at" | "updated_at" | "encrypted_payload">;

const emptyPayload: EvolutionPayload = {
  weight: null,
  height: null,
  bmi: null,
  waist_cm: null,
  hip_cm: null,
  arm_cm: null,
  body_fat_percentage: null,
  blood_pressure: null,
  energy_level: null,
  appetite: null,
  bowel_pattern: null,
  sleep_quality: null,
  symptoms: null,
  adherence_notes: null,
  adherence_score: null,
  progress_notes: null,
  conduct_notes: null,
  clinical_impression: null,
  next_steps: null,
};

function payloadFromInput(input: CreateEvolutionInput, bmi: number | null): EvolutionPayload {
  return {
    weight: input.weight ?? null,
    height: input.height ?? null,
    bmi,
    waist_cm: input.waist_cm ?? null,
    hip_cm: input.hip_cm ?? null,
    arm_cm: input.arm_cm ?? null,
    body_fat_percentage: input.body_fat_percentage ?? null,
    blood_pressure: input.blood_pressure ?? null,
    energy_level: input.energy_level ?? null,
    appetite: input.appetite ?? null,
    bowel_pattern: input.bowel_pattern ?? null,
    sleep_quality: input.sleep_quality ?? null,
    symptoms: input.symptoms ?? null,
    adherence_notes: input.adherence_notes ?? null,
    adherence_score: input.adherence_score ?? null,
    progress_notes: input.progress_notes ?? null,
    conduct_notes: input.conduct_notes ?? null,
    clinical_impression: input.clinical_impression ?? null,
    next_steps: input.next_steps ?? null,
  };
}

function payloadFromLegacyRow(row: ClientEvolution): EvolutionPayload {
  return {
    weight: row.weight,
    height: row.height,
    bmi: row.bmi,
    waist_cm: row.waist_cm,
    hip_cm: row.hip_cm,
    arm_cm: row.arm_cm,
    body_fat_percentage: row.body_fat_percentage,
    blood_pressure: row.blood_pressure,
    energy_level: row.energy_level,
    appetite: row.appetite,
    bowel_pattern: row.bowel_pattern,
    sleep_quality: row.sleep_quality,
    symptoms: row.symptoms,
    adherence_notes: row.adherence_notes,
    adherence_score: row.adherence_score,
    progress_notes: row.progress_notes,
    conduct_notes: row.conduct_notes,
    clinical_impression: row.clinical_impression,
    next_steps: row.next_steps,
  };
}

function decryptEvolution(row: ClientEvolution): ClientEvolution {
  const payload = row.encrypted_payload
    ? decryptJsonValue<EvolutionPayload>(row.encrypted_payload, emptyPayload)
    : payloadFromLegacyRow(row);
  return { ...row, ...payload };
}

function encryptedNullColumns() {
  return [
    null, null, null, null, null, null, null, null, null, null,
    null, null, null, null, null, null, null, null, null,
  ];
}

export async function createClientEvolution(input: CreateEvolutionInput): Promise<string> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const measuredAt = input.measured_at ?? now;
  const bmi = calculateBmiValue(input.weight, input.height);
  const encryptedPayload = encryptJsonValue(payloadFromInput(input, bmi));

  await d1Execute(
    `INSERT INTO client_evolutions
       (id, client_id, client_protocol_id, measured_at, weight, height, bmi,
        waist_cm, hip_cm, arm_cm, body_fat_percentage, blood_pressure,
        energy_level, appetite, bowel_pattern, sleep_quality, symptoms,
        adherence_notes, adherence_score, progress_notes, conduct_notes,
        clinical_impression, next_steps, created_at, updated_at, encrypted_payload)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22, ?23, ?24, ?25, ?26)`,
    [
      id,
      input.client_id,
      input.client_protocol_id ?? null,
      measuredAt,
      ...encryptedNullColumns(),
      now,
      now,
      encryptedPayload,
    ]
  );

  return id;
}

export async function getClientEvolutions(clientId: string): Promise<ClientEvolution[]> {
  const rows = await d1Query<ClientEvolution>(
    `SELECT * FROM client_evolutions WHERE client_id = ?1 ORDER BY COALESCE(measured_at, created_at) DESC`,
    [clientId]
  );
  return rows.map(decryptEvolution);
}

export async function updateClientEvolution(
  id: string,
  data: Partial<Omit<CreateEvolutionInput, "client_id" | "client_protocol_id">>
): Promise<void> {
  const existing = await getClientEvolutionById(id);
  if (!existing) return;

  const measuredAt = data.measured_at !== undefined ? data.measured_at : existing.measured_at;
  const nextPayload: EvolutionPayload = {
    weight: data.weight !== undefined ? data.weight : existing.weight,
    height: data.height !== undefined ? data.height : existing.height,
    bmi: null,
    waist_cm: data.waist_cm !== undefined ? data.waist_cm : existing.waist_cm,
    hip_cm: data.hip_cm !== undefined ? data.hip_cm : existing.hip_cm,
    arm_cm: data.arm_cm !== undefined ? data.arm_cm : existing.arm_cm,
    body_fat_percentage: data.body_fat_percentage !== undefined ? data.body_fat_percentage : existing.body_fat_percentage,
    blood_pressure: data.blood_pressure !== undefined ? data.blood_pressure : existing.blood_pressure,
    energy_level: data.energy_level !== undefined ? data.energy_level : existing.energy_level,
    appetite: data.appetite !== undefined ? data.appetite : existing.appetite,
    bowel_pattern: data.bowel_pattern !== undefined ? data.bowel_pattern : existing.bowel_pattern,
    sleep_quality: data.sleep_quality !== undefined ? data.sleep_quality : existing.sleep_quality,
    symptoms: data.symptoms !== undefined ? data.symptoms : existing.symptoms,
    adherence_notes: data.adherence_notes !== undefined ? data.adherence_notes : existing.adherence_notes,
    adherence_score: data.adherence_score !== undefined ? data.adherence_score : existing.adherence_score,
    progress_notes: data.progress_notes !== undefined ? data.progress_notes : existing.progress_notes,
    conduct_notes: data.conduct_notes !== undefined ? data.conduct_notes : existing.conduct_notes,
    clinical_impression: data.clinical_impression !== undefined ? data.clinical_impression : existing.clinical_impression,
    next_steps: data.next_steps !== undefined ? data.next_steps : existing.next_steps,
  };
  nextPayload.bmi = calculateBmiValue(nextPayload.weight, nextPayload.height);

  await d1Execute(
    `UPDATE client_evolutions
     SET measured_at = ?1, weight = NULL, height = NULL, bmi = NULL, waist_cm = NULL,
         hip_cm = NULL, arm_cm = NULL, body_fat_percentage = NULL, blood_pressure = NULL,
         energy_level = NULL, appetite = NULL, bowel_pattern = NULL, sleep_quality = NULL,
         symptoms = NULL, adherence_notes = NULL, adherence_score = NULL,
         progress_notes = NULL, conduct_notes = NULL, clinical_impression = NULL,
         next_steps = NULL, encrypted_payload = ?2, updated_at = ?3
     WHERE id = ?4`,
    [measuredAt ?? null, encryptJsonValue(nextPayload), new Date().toISOString(), id]
  );
}

export async function deleteClientEvolution(id: string): Promise<void> {
  await d1Execute(`DELETE FROM client_evolutions WHERE id = ?1`, [id]);
}

export async function getClientEvolutionById(id: string): Promise<ClientEvolution | null> {
  const rows = await d1Query<ClientEvolution>(
    `SELECT * FROM client_evolutions WHERE id = ?1 LIMIT 1`,
    [id]
  );
  return rows[0] ? decryptEvolution(rows[0]) : null;
}
