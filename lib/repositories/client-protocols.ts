import { d1Query, d1Execute } from "@/lib/d1/client";

export interface ClientProtocol {
  id: string;
  client_id: string;
  protocol_id: string;
  source_draft_id: string | null;
  status: string;
  started_at: string;
  review_date: string | null;
  professional_notes: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  // joined
  protocol_title?: string;
  protocol_category?: string | null;
  protocol_kind?: string;
  protocol_description?: string | null;
  phase_count?: number;
  task_count?: number;
  completed_task_count?: number;
}

export async function applyProtocolToClient(
  clientId: string,
  protocolId: string,
  options: {
    sourceDraftId?: string | null;
    startedAt?: string;
    reviewDate?: string | null;
    professionalNotes?: string | null;
  } = {}
): Promise<string> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const startedAt = options.startedAt ?? now.slice(0, 10);

  await d1Execute(
    `INSERT INTO client_protocols
       (id, client_id, protocol_id, source_draft_id, status, started_at, review_date, professional_notes, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, 'ativo', ?5, ?6, ?7, ?8, ?9)`,
    [
      id,
      clientId,
      protocolId,
      options.sourceDraftId ?? null,
      startedAt,
      options.reviewDate ?? null,
      options.professionalNotes ?? null,
      now,
      now,
    ]
  );

  return id;
}

export async function getClientProtocols(clientId: string): Promise<ClientProtocol[]> {
  return d1Query<ClientProtocol>(
    `SELECT cp.*,
            p.title as protocol_title,
            p.category as protocol_category,
            p.kind as protocol_kind,
            p.description as protocol_description,
            (SELECT COUNT(*) FROM protocol_phases pp WHERE pp.protocol_id = cp.protocol_id) as phase_count,
            (SELECT COUNT(*) FROM client_tasks ct WHERE ct.client_protocol_id = cp.id) as task_count,
            (SELECT COUNT(*) FROM client_tasks ct WHERE ct.client_protocol_id = cp.id AND ct.status = 'concluida') as completed_task_count
     FROM client_protocols cp
     LEFT JOIN protocols p ON p.id = cp.protocol_id
     WHERE cp.client_id = ?1
     ORDER BY cp.created_at DESC`,
    [clientId]
  );
}

export async function getClientProtocolById(id: string): Promise<ClientProtocol | null> {
  const rows = await d1Query<ClientProtocol>(
    `SELECT cp.*, p.title as protocol_title, p.category as protocol_category
     FROM client_protocols cp
     LEFT JOIN protocols p ON p.id = cp.protocol_id
     WHERE cp.id = ?1 LIMIT 1`,
    [id]
  );
  return rows[0] ?? null;
}

export async function updateClientProtocolStatus(
  id: string,
  status: string
): Promise<void> {
  const now = new Date().toISOString();
  const completedAt = status === "concluido" ? now : null;

  await d1Execute(
    `UPDATE client_protocols SET status = ?1, completed_at = ?2, updated_at = ?3 WHERE id = ?4`,
    [status, completedAt, now, id]
  );
}

export async function updateClientProtocol(input: {
  id: string;
  status?: "ativo" | "pausado" | "concluido" | "cancelado";
  reviewDate?: string | null;
  professionalNotes?: string | null;
}): Promise<void> {
  const current = await getClientProtocolById(input.id);
  if (!current) return;

  const status = input.status ?? current.status;
  const completedAt = status === "concluido" ? (current.completed_at ?? new Date().toISOString()) : null;
  await d1Execute(
    `UPDATE client_protocols
     SET status = ?1, review_date = ?2, professional_notes = ?3, completed_at = ?4, updated_at = ?5
     WHERE id = ?6`,
    [
      status,
      input.reviewDate === undefined ? current.review_date : input.reviewDate,
      input.professionalNotes === undefined ? current.professional_notes : input.professionalNotes,
      completedAt,
      new Date().toISOString(),
      input.id,
    ]
  );
}

export async function hasActiveProtocol(clientId: string, protocolId: string): Promise<boolean> {
  const rows = await d1Query<{ count: number }>(
    `SELECT COUNT(*) as count FROM client_protocols
     WHERE client_id = ?1 AND protocol_id = ?2 AND status IN ('ativo', 'pausado')`,
    [clientId, protocolId]
  );
  return (rows[0]?.count ?? 0) > 0;
}

export async function getActiveProtocolsCount(): Promise<number> {
  const rows = await d1Query<{ c: number }>(
    "SELECT COUNT(*) as c FROM client_protocols WHERE status = 'ativo'",
    []
  );
  return rows[0]?.c ?? 0;
}
