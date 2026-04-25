import { d1Query, d1Execute } from "@/lib/d1/client";

export interface AiProtocolDraft {
  id: string;
  submission_id: string | null;
  client_id: string | null;
  pre_analysis_id: string | null;
  title: string;
  status: string;
  ai_model: string | null;
  prompt_version: string | null;
  input_snapshot_json: string;
  output_json: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateAiProtocolDraftInput {
  submission_id?: string | null;
  client_id?: string | null;
  pre_analysis_id?: string | null;
  title: string;
  ai_model?: string | null;
  prompt_version?: string | null;
  input_snapshot_json: string;
  output_json: string;
}

export async function createAiProtocolDraft(
  input: CreateAiProtocolDraftInput
): Promise<string> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await d1Execute(
    `INSERT INTO ai_protocol_drafts
       (id, submission_id, client_id, pre_analysis_id, title, status,
        ai_model, prompt_version, input_snapshot_json, output_json,
        reviewed_by, reviewed_at, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, 'draft', ?6, ?7, ?8, ?9, NULL, NULL, ?10, ?11)`,
    [
      id,
      input.submission_id ?? null,
      input.client_id ?? null,
      input.pre_analysis_id ?? null,
      input.title,
      input.ai_model ?? null,
      input.prompt_version ?? null,
      input.input_snapshot_json,
      input.output_json,
      now,
      now,
    ]
  );
  return id;
}

export async function getAiProtocolDraftById(
  id: string
): Promise<AiProtocolDraft | null> {
  const rows = await d1Query<AiProtocolDraft>(
    `SELECT * FROM ai_protocol_drafts WHERE id = ?1 LIMIT 1`,
    [id]
  );
  return rows[0] ?? null;
}

export async function getAiProtocolDraftsBySubmissionId(
  submissionId: string
): Promise<AiProtocolDraft[]> {
  return d1Query<AiProtocolDraft>(
    `SELECT * FROM ai_protocol_drafts WHERE submission_id = ?1 ORDER BY created_at DESC`,
    [submissionId]
  );
}

export async function updateAiProtocolDraftStatus(
  id: string,
  status: string
): Promise<void> {
  await d1Execute(
    `UPDATE ai_protocol_drafts SET status = ?1, updated_at = ?2 WHERE id = ?3`,
    [status, new Date().toISOString(), id]
  );
}

export async function updateAiProtocolDraftOutput(
  id: string,
  title: string,
  outputJson: string
): Promise<void> {
  await d1Execute(
    `UPDATE ai_protocol_drafts SET title = ?1, output_json = ?2, updated_at = ?3 WHERE id = ?4`,
    [title, outputJson, new Date().toISOString(), id]
  );
}

export async function markAiProtocolDraftReviewed(
  id: string,
  adminId: string,
  status: "reviewed" | "approved" | "rejected"
): Promise<void> {
  const now = new Date().toISOString();
  await d1Execute(
    `UPDATE ai_protocol_drafts
     SET status = ?1, reviewed_by = ?2, reviewed_at = ?3, updated_at = ?3
     WHERE id = ?4`,
    [status, adminId, now, id]
  );
}
