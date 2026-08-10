import { d1Execute, d1Query } from "@/lib/d1/client";

export type AiActionProposalStatus = "pending" | "executing" | "completed" | "cancelled" | "expired" | "failed";

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
  executing_at: string | null;
  completed_at: string | null;
  failed_reason: string | null;
}

export interface AiProposalExecution {
  proposal_id: string;
  kind: string;
  result_json: string;
  created_at: string;
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
    executing_at: null,
    completed_at: null,
    failed_reason: null,
  };
}

/**
 * Sempre filtra por admin_id junto com o id — isso e o que impede um admin
 * de confirmar/inspecionar a proposta de outro admin so por adivinhar/
 * enumerar o id (IDOR). Uso principal: diagnostico de erro depois que
 * `claimAiActionProposal` nao consegue reivindicar a proposta.
 */
export async function getAiActionProposal(id: string, adminId: string): Promise<AiActionProposal | null> {
  const rows = await d1Query<AiActionProposal>(
    `SELECT * FROM ai_action_proposals WHERE id = ?1 AND admin_id = ?2 LIMIT 1`,
    [id, adminId]
  );
  return rows[0] ?? null;
}

/**
 * Transicao atomica pending -> executing usando UPDATE...WHERE...RETURNING —
 * uma unica instrucao SQL, sem SELECT previo. D1/SQLite serializa escritas
 * na mesma linha, entao se duas requisicoes chamarem isto ao mesmo tempo
 * para o mesmo id, no maximo UMA vai casar `status = 'pending'` e receber a
 * linha de volta; a outra recebe um array vazio. Isso e o que impede
 * double-click, replay e confirmacoes concorrentes de executarem duas vezes
 * — nao depende de lock em memoria do processo (que nao funcionaria em
 * serverless com multiplas instancias).
 */
export async function claimAiActionProposal(id: string, adminId: string): Promise<AiActionProposal | null> {
  const now = new Date().toISOString();
  const rows = await d1Query<AiActionProposal>(
    `UPDATE ai_action_proposals
     SET status = 'executing', executing_at = ?4
     WHERE id = ?1 AND admin_id = ?2 AND status = 'pending' AND expires_at > ?3
     RETURNING *`,
    [id, adminId, now, now]
  );
  return rows[0] ?? null;
}

/**
 * Chave de idempotencia por proposalId: se o handler ja gravou o side
 * effect com sucesso numa tentativa anterior (mesmo que o processo tenha
 * morrido antes de finalize(completed) rodar), este registro existe e a
 * proposta NUNCA deve ser executada de novo — so finalizada com o mesmo
 * resultado. `INSERT OR IGNORE` com proposal_id como chave primaria torna a
 * propria gravacao idempotente (chamar duas vezes nao duplica nem falha).
 */
export async function getProposalExecution(proposalId: string): Promise<AiProposalExecution | null> {
  const rows = await d1Query<AiProposalExecution>(
    `SELECT * FROM ai_proposal_executions WHERE proposal_id = ?1 LIMIT 1`,
    [proposalId]
  );
  return rows[0] ?? null;
}

export async function recordProposalExecution(
  proposalId: string,
  kind: string,
  result: Record<string, unknown>
): Promise<void> {
  await d1Execute(
    `INSERT OR IGNORE INTO ai_proposal_executions (proposal_id, kind, result_json, created_at)
     VALUES (?1, ?2, ?3, ?4)`,
    [proposalId, kind, JSON.stringify(result), new Date().toISOString()]
  );
}

/**
 * So finaliza uma proposta que estava 'executing' — nunca marca completed/
 * failed a partir de outro estado (isso preveniria, por exemplo, finalizar
 * uma proposta que outra requisicao ja tinha cancelado no meio do caminho).
 */
export async function finalizeAiActionProposal(
  id: string,
  status: "completed" | "failed",
  failedReason?: string | null
): Promise<void> {
  await d1Execute(
    `UPDATE ai_action_proposals
     SET status = ?1,
         completed_at = CASE WHEN ?1 = 'completed' THEN CURRENT_TIMESTAMP ELSE completed_at END,
         failed_reason = ?2
     WHERE id = ?3 AND status = 'executing'`,
    [status, failedReason ?? null, id]
  );
}

/** So cancela a partir de 'pending' — completed/executing/ja finalizadas nao podem ser canceladas. */
export async function cancelAiActionProposal(id: string, adminId: string): Promise<boolean> {
  const rows = await d1Query<AiActionProposal>(
    `UPDATE ai_action_proposals
     SET status = 'cancelled'
     WHERE id = ?1 AND admin_id = ?2 AND status = 'pending'
     RETURNING *`,
    [id, adminId]
  );
  return rows.length > 0;
}

export async function markAiActionProposalExpired(id: string): Promise<void> {
  await d1Execute(
    `UPDATE ai_action_proposals SET status = 'expired' WHERE id = ?1 AND status IN ('pending', 'executing')`,
    [id]
  );
}

export function isAiActionProposalExpired(proposal: AiActionProposal): boolean {
  return new Date(proposal.expires_at).getTime() < Date.now();
}
