import { d1Query, d1Execute } from "@/lib/d1/client";

export interface ClientProtocol {
  id: string;
  client_id: string;
  protocol_id: string;
  source_draft_id: string | null;
  status: string;
  started_at: string;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  // joined
  protocol_title?: string;
  protocol_category?: string | null;
}

export async function applyProtocolToClient(
  clientId: string,
  protocolId: string,
  sourceDraftId?: string | null
): Promise<string> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await d1Execute(
    `INSERT INTO client_protocols (id, client_id, protocol_id, source_draft_id, status, started_at, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, 'ativo', ?5, ?6, ?7)`,
    [id, clientId, protocolId, sourceDraftId ?? null, now, now, now]
  );

  return id;
}

export async function getClientProtocols(clientId: string): Promise<ClientProtocol[]> {
  return d1Query<ClientProtocol>(
    `SELECT cp.*, p.title as protocol_title, p.category as protocol_category
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

export async function getActiveProtocolsCount(): Promise<number> {
  const rows = await d1Query<{ c: number }>(
    "SELECT COUNT(*) as c FROM client_protocols WHERE status = 'ativo'",
    []
  );
  return rows[0]?.c ?? 0;
}
