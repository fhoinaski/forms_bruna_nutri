import { d1Execute, d1Query } from "@/lib/d1/client";

export const PATIENT_EDUCATION_CARD_CATEGORIES = ["geral", "patologia"] as const;
export type PatientEducationCardCategory = typeof PATIENT_EDUCATION_CARD_CATEGORIES[number];

export type PatientEducationSections = Record<string, unknown>;

export interface PatientEducationCard {
  id: string;
  slug: string;
  title: string;
  category: PatientEducationCardCategory;
  summary: string;
  sections_json: string;
  is_active: number;
  created_at: string;
  updated_at: string;
}

export interface PatientEducationCardPayload extends Omit<PatientEducationCard, "sections_json"> {
  sections: PatientEducationSections;
}

export interface PatientEducationCardInput {
  slug: string;
  title: string;
  category: PatientEducationCardCategory;
  summary: string;
  sections: PatientEducationSections;
  is_active?: boolean;
}

function parseSections(value: string): PatientEducationSections {
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as PatientEducationSections : {};
  } catch {
    return {};
  }
}

function hydrate(row: PatientEducationCard): PatientEducationCardPayload {
  return {
    ...row,
    sections: parseSections(row.sections_json),
  };
}

export function slugifyEducationCard(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

export async function getPatientEducationCards(filters: {
  includeInactive?: boolean;
  category?: PatientEducationCardCategory;
  q?: string;
} = {}): Promise<PatientEducationCardPayload[]> {
  const conditions: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (!filters.includeInactive) conditions.push("is_active = 1");
  if (filters.category) {
    conditions.push(`category = ?${idx++}`);
    params.push(filters.category);
  }
  if (filters.q?.trim()) {
    conditions.push(`(title LIKE ?${idx} OR summary LIKE ?${idx} OR slug LIKE ?${idx})`);
    params.push(`%${filters.q.trim()}%`);
    idx++;
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const rows = await d1Query<PatientEducationCard>(
    `SELECT * FROM patient_education_cards ${where} ORDER BY category ASC, title ASC`,
    params
  );
  return rows.map(hydrate);
}

export async function getPatientEducationCardById(id: string): Promise<PatientEducationCardPayload | null> {
  const rows = await d1Query<PatientEducationCard>(
    "SELECT * FROM patient_education_cards WHERE id = ?1 LIMIT 1",
    [id]
  );
  return rows[0] ? hydrate(rows[0]) : null;
}

export async function upsertPatientEducationCard(id: string, input: PatientEducationCardInput): Promise<void> {
  const now = new Date().toISOString();
  await d1Execute(
    `INSERT INTO patient_education_cards
      (id, slug, title, category, summary, sections_json, is_active, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, COALESCE((SELECT created_at FROM patient_education_cards WHERE id = ?1), ?8), ?9)
     ON CONFLICT(id) DO UPDATE SET
       slug = excluded.slug,
       title = excluded.title,
       category = excluded.category,
       summary = excluded.summary,
       sections_json = excluded.sections_json,
       is_active = excluded.is_active,
       updated_at = excluded.updated_at`,
    [
      id,
      input.slug,
      input.title,
      input.category,
      input.summary,
      JSON.stringify(input.sections),
      input.is_active === false ? 0 : 1,
      now,
      now,
    ]
  );
}

export async function createPatientEducationCard(input: PatientEducationCardInput): Promise<string> {
  const id = crypto.randomUUID();
  await upsertPatientEducationCard(id, input);
  return id;
}

export async function updatePatientEducationCard(id: string, input: PatientEducationCardInput): Promise<void> {
  await upsertPatientEducationCard(id, input);
}

export async function archivePatientEducationCard(id: string): Promise<void> {
  await d1Execute(
    "UPDATE patient_education_cards SET is_active = 0, updated_at = ?1 WHERE id = ?2",
    [new Date().toISOString(), id]
  );
}
