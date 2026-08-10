import { d1Execute, d1Query } from "@/lib/d1/client";

export type AiActionProposalStatus = "pending" | "completed" | "cancelled" | "expired";

export interface AiActionProposal {
  id: string;
  admin_id: string;
  tool_name: string;
  kind: string;
  risk: string;
  client_id: string | null;
  submission_id: string | null;
  params_json: string;
  status: AiActionProposalStatus;
  created_at: string;
  expires_at: string;
  completed_at: string | null;
}

export interface CreateAiActionProposalInput {
  adminId: string;
  toolName: string;
  kind: string;
  risk: string;
  clientId?: string | null;
  submissionId?: string | null;
  params: unknown;
  ttlMs: number;
}

export async function createAiActionProposal(input: CreateAiActionProposalInput): Promise<AiActionProposal> {
  const id = crypto.randomUUID();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + input.ttlMs).toISOString();
  const createdAt = now.toISOString();
  const paramsJson = JSON.stringify(input.params);

  await d1Execute(
    `INSERT INTO ai_action_proposals
      (id, admin_id, tool_name, kind, risk, client_id, submission_id, params_json, status, created_at, expires_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 'pending', ?9, ?10)`,
    [id, input.adminId, input.toolName, input.kind, input.risk, input.clientId ?? null, input.submissionId ?? null, paramsJson, createdAt, expiresAt]
  );

  return {
    id,
    admin_id: input.adminId,
    tool_name: input.toolName,
    kind: input.kind,
    risk: input.risk,
    client_id: input.clientId ?? null,
    submission_id: input.submissionId ?? null,
    params_json: paramsJson,
    status: "pending",
    created_at: createdAt,
    expires_at: expiresAt,
    completed_at: null,
  };
}

/**
 * Sempre filtra por admin_id junto com o id — isso e o que impede um admin
 * de confirmar/inspecionar a proposta de outro admin so por adivinhar/
 * enumerar o id.
 */
export async function getAiActionProposal(id: string, adminId: string): Promise<AiActionProposal | null> {
  const rows = await d1Query<AiActionProposal>(
    `SELECT * FROM ai_action_proposals WHERE id = ?1 AND admin_id = ?2 LIMIT 1`,
    [id, adminId]
  );
  return rows[0] ?? null;
}

export async function markAiActionProposalStatus(id: string, status: AiActionProposalStatus): Promise<void> {
  await d1Execute(
    `UPDATE ai_action_proposals
     SET status = ?1, completed_at = CASE WHEN ?1 = 'completed' THEN CURRENT_TIMESTAMP ELSE completed_at END
     WHERE id = ?2`,
    [status, id]
  );
}

export function isAiActionProposalExpired(proposal: AiActionProposal): boolean {
  return new Date(proposal.expires_at).getTime() < Date.now();
}
