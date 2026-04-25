import { d1Query, d1Execute } from "@/lib/d1/client";

export interface ClientEvolution {
  id: string;
  client_id: string;
  client_protocol_id: string | null;
  weight: number | null;
  height: number | null;
  bmi: number | null;
  symptoms: string | null;
  adherence_notes: string | null;
  progress_notes: string | null;
  conduct_notes: string | null;
  next_steps: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateEvolutionInput {
  client_id: string;
  client_protocol_id?: string | null;
  weight?: number | null;
  height?: number | null;
  symptoms?: string | null;
  adherence_notes?: string | null;
  progress_notes?: string | null;
  conduct_notes?: string | null;
  next_steps?: string | null;
}

function calcBmi(weight: number | null | undefined, height: number | null | undefined): number | null {
  if (!weight || !height || height <= 0) return null;
  const heightM = height > 10 ? height / 100 : height;
  return Math.round((weight / (heightM * heightM)) * 10) / 10;
}

export async function createClientEvolution(input: CreateEvolutionInput): Promise<string> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const bmi = calcBmi(input.weight, input.height);

  await d1Execute(
    `INSERT INTO client_evolutions
       (id, client_id, client_protocol_id, weight, height, bmi, symptoms, adherence_notes, progress_notes, conduct_notes, next_steps, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)`,
    [
      id,
      input.client_id,
      input.client_protocol_id ?? null,
      input.weight ?? null,
      input.height ?? null,
      bmi,
      input.symptoms ?? null,
      input.adherence_notes ?? null,
      input.progress_notes ?? null,
      input.conduct_notes ?? null,
      input.next_steps ?? null,
      now,
      now,
    ]
  );

  return id;
}

export async function getClientEvolutions(clientId: string): Promise<ClientEvolution[]> {
  return d1Query<ClientEvolution>(
    `SELECT * FROM client_evolutions WHERE client_id = ?1 ORDER BY created_at DESC`,
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

  if (data.weight !== undefined) { updates.push(`weight = ?${idx++}`); params.push(data.weight ?? null); }
  if (data.height !== undefined) { updates.push(`height = ?${idx++}`); params.push(data.height ?? null); }
  if (data.weight !== undefined || data.height !== undefined) {
    // Recalculate bmi if either changed
    const rows = await d1Query<ClientEvolution>(`SELECT weight, height FROM client_evolutions WHERE id = ?1`, [id]);
    const existing = rows[0];
    const w = data.weight !== undefined ? data.weight : existing?.weight;
    const h = data.height !== undefined ? data.height : existing?.height;
    const bmi = calcBmi(w, h);
    updates.push(`bmi = ?${idx++}`); params.push(bmi);
  }
  if (data.symptoms !== undefined) { updates.push(`symptoms = ?${idx++}`); params.push(data.symptoms ?? null); }
  if (data.adherence_notes !== undefined) { updates.push(`adherence_notes = ?${idx++}`); params.push(data.adherence_notes ?? null); }
  if (data.progress_notes !== undefined) { updates.push(`progress_notes = ?${idx++}`); params.push(data.progress_notes ?? null); }
  if (data.conduct_notes !== undefined) { updates.push(`conduct_notes = ?${idx++}`); params.push(data.conduct_notes ?? null); }
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
