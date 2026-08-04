import { d1Query, d1Execute } from "@/lib/d1/client";
import type { ProtocolDraftOutput } from "@/lib/validators/ai-protocol";
import { parseProtocolActions } from "@/lib/protocols/helpers";

export interface Protocol {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  kind: "standard" | "personalized";
  client_id: string | null;
  copied_from_protocol_id: string | null;
  source_draft_id: string | null;
  created_by: string | null;
  is_active: number;
  created_at: string;
  updated_at: string;
}

export interface ProtocolPhase {
  id: string;
  protocol_id: string;
  title: string;
  days: string | null;
  objective: string | null;
  actions_json: string;
  notes: string | null;
  phase_order: number;
  created_at: string;
  updated_at: string;
}

export interface ProtocolWithPhases extends Protocol {
  phases: ProtocolPhase[];
}

export interface ProtocolFilters {
  search?: string;
  category?: string;
  isActive?: boolean;
  kind?: "standard" | "personalized";
  clientId?: string;
  page?: number;
  pageSize?: number;
}

export interface ProtocolListResult {
  items: Protocol[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export async function createProtocolFromDraft(
  draftId: string,
  adminId: string,
  output: ProtocolDraftOutput,
  draftTitle: string
): Promise<string> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await d1Execute(
    `INSERT INTO protocols (id, title, description, category, source_draft_id, created_by, is_active, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, 1, ?7, ?8)`,
    [
      id,
      draftTitle,
      output.caseSummary ?? null,
      "nutricional",
      draftId,
      adminId,
      now,
      now,
    ]
  );

  const phases = output.suggestedProtocol?.phases ?? [];
  for (let i = 0; i < phases.length; i++) {
    const phase = phases[i];
    await d1Execute(
      `INSERT INTO protocol_phases (id, protocol_id, title, days, objective, actions_json, notes, phase_order, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)`,
      [
        crypto.randomUUID(),
        id,
        phase.title,
        phase.days ?? null,
        phase.objective ?? null,
        JSON.stringify(phase.actions ?? []),
        phase.notes ?? null,
        i,
        now,
        now,
      ]
    );
  }

  return id;
}

export async function getProtocols(
  filters: ProtocolFilters = {}
): Promise<ProtocolListResult> {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, filters.pageSize ?? 20));
  const offset = (page - 1) * pageSize;

  const conditions: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (filters.isActive !== undefined) {
    conditions.push(`is_active = ?${idx++}`);
    params.push(filters.isActive ? 1 : 0);
  }
  if (filters.category) {
    conditions.push(`category = ?${idx++}`);
    params.push(filters.category);
  }
  if (filters.kind) {
    conditions.push(`kind = ?${idx++}`);
    params.push(filters.kind);
  }
  if (filters.clientId) {
    conditions.push(`client_id = ?${idx++}`);
    params.push(filters.clientId);
  }
  if (filters.search) {
    conditions.push(`(title LIKE ?${idx} OR description LIKE ?${idx} OR category LIKE ?${idx})`);
    params.push(`%${filters.search}%`);
    idx++;
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const countRows = await d1Query<{ total: number }>(
    `SELECT COUNT(*) as total FROM protocols ${where}`,
    params
  );
  const total = countRows[0]?.total ?? 0;

  const rows = await d1Query<Protocol>(
    `SELECT * FROM protocols ${where} ORDER BY created_at DESC LIMIT ?${idx} OFFSET ?${idx + 1}`,
    [...params, pageSize, offset]
  );

  return { items: rows, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
}

export async function getProtocolById(id: string): Promise<ProtocolWithPhases | null> {
  const rows = await d1Query<Protocol>(
    `SELECT * FROM protocols WHERE id = ?1 LIMIT 1`,
    [id]
  );
  const protocol = rows[0];
  if (!protocol) return null;

  const phases = await d1Query<ProtocolPhase>(
    `SELECT * FROM protocol_phases WHERE protocol_id = ?1 ORDER BY phase_order ASC`,
    [id]
  );

  return { ...protocol, phases };
}

export async function updateProtocol(
  id: string,
  data: Partial<Pick<Protocol, "title" | "description" | "category">>
): Promise<void> {
  const updates: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (data.title !== undefined) { updates.push(`title = ?${idx++}`); params.push(data.title); }
  if (data.description !== undefined) { updates.push(`description = ?${idx++}`); params.push(data.description); }
  if (data.category !== undefined) { updates.push(`category = ?${idx++}`); params.push(data.category); }

  if (!updates.length) return;
  updates.push(`updated_at = ?${idx++}`);
  params.push(new Date().toISOString());
  params.push(id);

  await d1Execute(
    `UPDATE protocols SET ${updates.join(", ")} WHERE id = ?${idx}`,
    params
  );
}

export async function archiveProtocol(id: string): Promise<void> {
  await d1Execute(
    `UPDATE protocols SET is_active = 0, updated_at = ?1 WHERE id = ?2`,
    [new Date().toISOString(), id]
  );
}

export interface CreateProtocolInput {
  title: string;
  description?: string | null;
  category?: string | null;
  created_by?: string | null;
  kind?: "standard" | "personalized";
  client_id?: string | null;
  copied_from_protocol_id?: string | null;
  phases?: Array<{
    title: string;
    days?: string | null;
    objective?: string | null;
    actions: string[];
    notes?: string | null;
  }>;
}

export async function createProtocol(input: CreateProtocolInput): Promise<string> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await d1Execute(
    `INSERT INTO protocols
       (id, title, description, category, kind, client_id, copied_from_protocol_id, source_draft_id, created_by, is_active, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, NULL, ?8, 1, ?9, ?10)`,
    [
      id,
      input.title,
      input.description ?? null,
      input.category ?? null,
      input.kind ?? "standard",
      input.client_id ?? null,
      input.copied_from_protocol_id ?? null,
      input.created_by ?? null,
      now,
      now,
    ]
  );

  const phases = input.phases ?? [];
  for (let i = 0; i < phases.length; i++) {
    const phase = phases[i];
    await d1Execute(
      `INSERT INTO protocol_phases (id, protocol_id, title, days, objective, actions_json, notes, phase_order, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)`,
      [
        crypto.randomUUID(), id,
        phase.title, phase.days ?? null, phase.objective ?? null,
        JSON.stringify(phase.actions ?? []), phase.notes ?? null,
        i, now, now,
      ]
    );
  }

  return id;
}

export async function replaceProtocolPhases(
  protocolId: string,
  phases: Array<{
    title: string;
    days?: string | null;
    objective?: string | null;
    actions: string[];
    notes?: string | null;
  }>
): Promise<void> {
  const now = new Date().toISOString();
  await d1Execute(`DELETE FROM protocol_phases WHERE protocol_id = ?1`, [protocolId]);
  for (let i = 0; i < phases.length; i++) {
    const phase = phases[i];
    await d1Execute(
      `INSERT INTO protocol_phases (id, protocol_id, title, days, objective, actions_json, notes, phase_order, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)`,
      [
        crypto.randomUUID(), protocolId,
        phase.title, phase.days ?? null, phase.objective ?? null,
        JSON.stringify(phase.actions ?? []), phase.notes ?? null,
        i, now, now,
      ]
    );
  }
  await d1Execute(`UPDATE protocols SET updated_at = ?1 WHERE id = ?2`, [now, protocolId]);
}

export async function cloneProtocolForClient(input: {
  sourceProtocolId: string;
  clientId: string;
  createdBy: string;
  title?: string;
  description?: string | null;
  category?: string | null;
}): Promise<string> {
  const source = await getProtocolById(input.sourceProtocolId);
  if (!source) throw new Error("Protocolo de origem não encontrado.");

  return createProtocol({
    title: input.title?.trim() || `${source.title} - personalizado`,
    description: input.description === undefined ? source.description : input.description,
    category: input.category === undefined ? source.category : input.category,
    created_by: input.createdBy,
    kind: "personalized",
    client_id: input.clientId,
    copied_from_protocol_id: source.id,
    phases: source.phases.map((phase) => ({
      title: phase.title,
      days: phase.days,
      objective: phase.objective,
      actions: parseProtocolActions(phase.actions_json),
      notes: phase.notes,
    })),
  });
}


export async function getProtocolMetrics(): Promise<{ total: number; ativos: number }> {
  const [total, ativos] = await Promise.all([
    d1Query<{ c: number }>("SELECT COUNT(*) as c FROM protocols", []),
    d1Query<{ c: number }>("SELECT COUNT(*) as c FROM protocols WHERE is_active = 1", []),
  ]);
  return { total: total[0]?.c ?? 0, ativos: ativos[0]?.c ?? 0 };
}
