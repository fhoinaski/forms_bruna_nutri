import { d1Execute, d1Query } from "@/lib/d1/client";
import { getClientById } from "@/lib/repositories/clients";
import { getSubmissionById } from "@/lib/repositories/submissions";

export interface NutritionRecord {
  id: string;
  client_id: string;
  chief_complaint: string | null;
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
  waist_cm: string | null;
  anthropometry_notes: string | null;
  exams: string | null;
  assessment: string | null;
  goals: string | null;
  care_plan: string | null;
  risk_flags: string | null;
  family_context: string | null;
  private_notes: string | null;
  created_at: string;
  updated_at: string;
}

export type NutritionRecordInput = Omit<
  NutritionRecord,
  "id" | "client_id" | "created_at" | "updated_at"
>;

const FIELDS: (keyof NutritionRecordInput)[] = [
  "chief_complaint",
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
  "waist_cm",
  "anthropometry_notes",
  "exams",
  "assessment",
  "goals",
  "care_plan",
  "risk_flags",
  "family_context",
  "private_notes",
];

export async function ensureNutritionRecordsTable() {
  await d1Execute(
    `CREATE TABLE IF NOT EXISTS nutrition_records (
      id TEXT PRIMARY KEY,
      client_id TEXT NOT NULL UNIQUE,
      chief_complaint TEXT,
      clinical_history TEXT,
      diagnoses TEXT,
      medications TEXT,
      supplements TEXT,
      allergies TEXT,
      restrictions TEXT,
      food_preferences TEXT,
      food_aversions TEXT,
      eating_routine TEXT,
      intestinal_health TEXT,
      sleep_routine TEXT,
      stress_context TEXT,
      physical_activity TEXT,
      hydration TEXT,
      current_weight_kg TEXT,
      height_cm TEXT,
      bmi TEXT,
      waist_cm TEXT,
      anthropometry_notes TEXT,
      exams TEXT,
      assessment TEXT,
      goals TEXT,
      care_plan TEXT,
      risk_flags TEXT,
      family_context TEXT,
      private_notes TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (client_id) REFERENCES clients(id)
    )`,
    []
  );
  await d1Execute(
    "CREATE INDEX IF NOT EXISTS idx_nutrition_records_client_id ON nutrition_records(client_id)",
    []
  );
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
    waist_cm: answer(answers, ["cintura", "circunferenciaCintura"]),
    anthropometry_notes: null,
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
  await ensureNutritionRecordsTable();
  const existing = await getExistingNutritionRecord(clientId);
  if (existing) return existing;

  const client = await getClientById(clientId);
  if (!client) return null;

  const initial = await buildInitialRecord(clientId);
  return createNutritionRecord(clientId, initial);
}

export async function getExistingNutritionRecord(clientId: string): Promise<NutritionRecord | null> {
  await ensureNutritionRecordsTable();
  const rows = await d1Query<NutritionRecord>(
    "SELECT * FROM nutrition_records WHERE client_id = ?1 LIMIT 1",
    [clientId]
  );
  return rows[0] ?? null;
}

export async function createNutritionRecord(
  clientId: string,
  input: NutritionRecordInput
): Promise<NutritionRecord> {
  await ensureNutritionRecordsTable();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await d1Execute(
    `INSERT OR IGNORE INTO nutrition_records
      (id, client_id, ${FIELDS.join(", ")}, created_at, updated_at)
     VALUES (?1, ?2, ${FIELDS.map((_, index) => `?${index + 3}`).join(", ")}, ?${FIELDS.length + 3}, ?${FIELDS.length + 4})`,
    [id, clientId, ...FIELDS.map((field) => input[field] ?? null), now, now]
  );
  const record = await d1Query<NutritionRecord>(
    "SELECT * FROM nutrition_records WHERE client_id = ?1 LIMIT 1",
    [clientId]
  );
  if (!record[0]) throw new Error("Nao foi possivel criar o prontuario nutricional.");
  return record[0];
}

export async function updateNutritionRecord(
  clientId: string,
  input: Partial<NutritionRecordInput>
): Promise<NutritionRecord> {
  await ensureNutritionRecordsTable();
  const existing = await getNutritionRecord(clientId);
  if (!existing) throw new Error("Cliente nao encontrado.");

  const updates: string[] = [];
  const params: unknown[] = [];
  let index = 1;
  for (const field of FIELDS) {
    if (input[field] !== undefined) {
      updates.push(`${field} = ?${index++}`);
      params.push(input[field] ?? null);
    }
  }
  updates.push(`updated_at = ?${index++}`);
  params.push(new Date().toISOString());
  params.push(clientId);

  await d1Execute(
    `UPDATE nutrition_records SET ${updates.join(", ")} WHERE client_id = ?${index}`,
    params
  );
  const rows = await d1Query<NutritionRecord>(
    "SELECT * FROM nutrition_records WHERE client_id = ?1 LIMIT 1",
    [clientId]
  );
  return rows[0];
}
