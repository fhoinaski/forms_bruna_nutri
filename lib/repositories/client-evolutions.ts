import { d1Query, d1Execute } from "@/lib/d1/client";
import { calculateBmiValue } from "@/lib/clinical/anthropometry";

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

export async function createClientEvolution(input: CreateEvolutionInput): Promise<string> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const measuredAt = input.measured_at ?? now;
  const bmi = calculateBmiValue(input.weight, input.height);

  await d1Execute(
    `INSERT INTO client_evolutions
       (id, client_id, client_protocol_id, measured_at, weight, height, bmi,
        waist_cm, hip_cm, arm_cm, body_fat_percentage, blood_pressure,
        energy_level, appetite, bowel_pattern, sleep_quality, symptoms,
        adherence_notes, adherence_score, progress_notes, conduct_notes,
        clinical_impression, next_steps, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22, ?23, ?24, ?25)`,
    [
      id,
      input.client_id,
      input.client_protocol_id ?? null,
      measuredAt,
      input.weight ?? null,
      input.height ?? null,
      bmi,
      input.waist_cm ?? null,
      input.hip_cm ?? null,
      input.arm_cm ?? null,
      input.body_fat_percentage ?? null,
      input.blood_pressure ?? null,
      input.energy_level ?? null,
      input.appetite ?? null,
      input.bowel_pattern ?? null,
      input.sleep_quality ?? null,
      input.symptoms ?? null,
      input.adherence_notes ?? null,
      input.adherence_score ?? null,
      input.progress_notes ?? null,
      input.conduct_notes ?? null,
      input.clinical_impression ?? null,
      input.next_steps ?? null,
      now,
      now,
    ]
  );

  return id;
}

export async function getClientEvolutions(clientId: string): Promise<ClientEvolution[]> {
  return d1Query<ClientEvolution>(
    `SELECT * FROM client_evolutions WHERE client_id = ?1 ORDER BY COALESCE(measured_at, created_at) DESC`,
    [clientId]
  );
}

export async function updateClientEvolution(
  id: string,
  data: Partial<Omit<CreateEvolutionInput, "client_id" | "client_protocol_id">>
): Promise<void> {
  const updates: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (data.measured_at !== undefined) { updates.push(`measured_at = ?${idx++}`); params.push(data.measured_at ?? null); }
  if (data.weight !== undefined) { updates.push(`weight = ?${idx++}`); params.push(data.weight ?? null); }
  if (data.height !== undefined) { updates.push(`height = ?${idx++}`); params.push(data.height ?? null); }
  if (data.weight !== undefined || data.height !== undefined) {
    // Recalculate bmi if either changed
    const rows = await d1Query<ClientEvolution>(`SELECT weight, height FROM client_evolutions WHERE id = ?1`, [id]);
    const existing = rows[0];
    const w = data.weight !== undefined ? data.weight : existing?.weight;
    const h = data.height !== undefined ? data.height : existing?.height;
    const bmi = calculateBmiValue(w, h);
    updates.push(`bmi = ?${idx++}`); params.push(bmi);
  }
  if (data.waist_cm !== undefined) { updates.push(`waist_cm = ?${idx++}`); params.push(data.waist_cm ?? null); }
  if (data.hip_cm !== undefined) { updates.push(`hip_cm = ?${idx++}`); params.push(data.hip_cm ?? null); }
  if (data.arm_cm !== undefined) { updates.push(`arm_cm = ?${idx++}`); params.push(data.arm_cm ?? null); }
  if (data.body_fat_percentage !== undefined) { updates.push(`body_fat_percentage = ?${idx++}`); params.push(data.body_fat_percentage ?? null); }
  if (data.blood_pressure !== undefined) { updates.push(`blood_pressure = ?${idx++}`); params.push(data.blood_pressure ?? null); }
  if (data.energy_level !== undefined) { updates.push(`energy_level = ?${idx++}`); params.push(data.energy_level ?? null); }
  if (data.appetite !== undefined) { updates.push(`appetite = ?${idx++}`); params.push(data.appetite ?? null); }
  if (data.bowel_pattern !== undefined) { updates.push(`bowel_pattern = ?${idx++}`); params.push(data.bowel_pattern ?? null); }
  if (data.sleep_quality !== undefined) { updates.push(`sleep_quality = ?${idx++}`); params.push(data.sleep_quality ?? null); }
  if (data.symptoms !== undefined) { updates.push(`symptoms = ?${idx++}`); params.push(data.symptoms ?? null); }
  if (data.adherence_notes !== undefined) { updates.push(`adherence_notes = ?${idx++}`); params.push(data.adherence_notes ?? null); }
  if (data.adherence_score !== undefined) { updates.push(`adherence_score = ?${idx++}`); params.push(data.adherence_score ?? null); }
  if (data.progress_notes !== undefined) { updates.push(`progress_notes = ?${idx++}`); params.push(data.progress_notes ?? null); }
  if (data.conduct_notes !== undefined) { updates.push(`conduct_notes = ?${idx++}`); params.push(data.conduct_notes ?? null); }
  if (data.clinical_impression !== undefined) { updates.push(`clinical_impression = ?${idx++}`); params.push(data.clinical_impression ?? null); }
  if (data.next_steps !== undefined) { updates.push(`next_steps = ?${idx++}`); params.push(data.next_steps ?? null); }

  if (!updates.length) return;
  updates.push(`updated_at = ?${idx++}`);
  params.push(new Date().toISOString());
  params.push(id);

  await d1Execute(
    `UPDATE client_evolutions SET ${updates.join(", ")} WHERE id = ?${idx}`,
    params
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
  return rows[0] ?? null;
}
