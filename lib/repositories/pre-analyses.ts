import { d1Query, d1Execute } from "@/lib/d1/client";

export interface PreAnalysis {
  id: string;
  submission_id: string;
  admin_id: string | null;
  summary: string | null;
  attention_points: string | null;
  main_goal: string | null;
  restrictions: string | null;
  professional_notes: string | null;
  priority: string;
  created_at: string;
  updated_at: string;
}

export interface UpsertPreAnalysisInput {
  submission_id: string;
  admin_id?: string | null;
  summary?: string | null;
  attention_points?: string | null;
  main_goal?: string | null;
  restrictions?: string | null;
  professional_notes?: string | null;
  priority?: string;
}

export async function getPreAnalysisBySubmissionId(
  submissionId: string
): Promise<PreAnalysis | null> {
  const rows = await d1Query<PreAnalysis>(
    `SELECT * FROM submission_pre_analyses WHERE submission_id = ?1 LIMIT 1`,
    [submissionId]
  );
  return rows[0] ?? null;
}

export async function upsertPreAnalysis(
  input: UpsertPreAnalysisInput
): Promise<string> {
  const existing = await getPreAnalysisBySubmissionId(input.submission_id);
  const now = new Date().toISOString();

  if (existing) {
    await d1Execute(
      `UPDATE submission_pre_analyses SET
         admin_id = ?1,
         summary = ?2,
         attention_points = ?3,
         main_goal = ?4,
         restrictions = ?5,
         professional_notes = ?6,
         priority = ?7,
         updated_at = ?8
       WHERE id = ?9`,
      [
        input.admin_id ?? existing.admin_id,
        input.summary ?? null,
        input.attention_points ?? null,
        input.main_goal ?? null,
        input.restrictions ?? null,
        input.professional_notes ?? null,
        input.priority ?? existing.priority,
        now,
        existing.id,
      ]
    );
    return existing.id;
  }

  const id = crypto.randomUUID();
  await d1Execute(
    `INSERT INTO submission_pre_analyses
       (id, submission_id, admin_id, summary, attention_points, main_goal,
        restrictions, professional_notes, priority, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)`,
    [
      id,
      input.submission_id,
      input.admin_id ?? null,
      input.summary ?? null,
      input.attention_points ?? null,
      input.main_goal ?? null,
      input.restrictions ?? null,
      input.professional_notes ?? null,
      input.priority ?? "normal",
      now,
      now,
    ]
  );
  return id;
}

export async function deletePreAnalysis(id: string): Promise<void> {
  await d1Execute(
    `DELETE FROM submission_pre_analyses WHERE id = ?1`,
    [id]
  );
}
