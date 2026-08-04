import { d1Execute, d1Query } from "@/lib/d1/client";
import {
  PROTOCOL_TEMPLATE_TARGET_GROUPS,
  PROTOCOL_TEMPLATE_TYPES,
  type ProtocolTemplateTargetGroup,
  type ProtocolTemplateType,
} from "@/lib/protocol-templates/constants";

export type { ProtocolTemplateTargetGroup, ProtocolTemplateType };

export interface ProtocolTemplate {
  id: string;
  type: ProtocolTemplateType;
  target_group: ProtocolTemplateTargetGroup;
  title: string;
  content: string;
  is_active: number;
  created_at: string;
  updated_at: string;
}

export interface ProtocolTemplateInput {
  type: ProtocolTemplateType;
  target_group: ProtocolTemplateTargetGroup;
  title: string;
  content: string;
  is_active?: boolean;
}

export function isProtocolTemplateType(value: string): value is ProtocolTemplateType {
  return (PROTOCOL_TEMPLATE_TYPES as readonly string[]).includes(value);
}

export function isProtocolTemplateTargetGroup(value: string): value is ProtocolTemplateTargetGroup {
  return (PROTOCOL_TEMPLATE_TARGET_GROUPS as readonly string[]).includes(value);
}

export async function getAllTemplates(filters: {
  includeInactive?: boolean;
  type?: ProtocolTemplateType;
  targetGroup?: ProtocolTemplateTargetGroup;
} = {}): Promise<ProtocolTemplate[]> {
  const conditions: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (!filters.includeInactive) conditions.push("is_active = 1");
  if (filters.type) {
    conditions.push(`type = ?${idx++}`);
    params.push(filters.type);
  }
  if (filters.targetGroup) {
    conditions.push(`target_group = ?${idx++}`);
    params.push(filters.targetGroup);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  return d1Query<ProtocolTemplate>(
    `SELECT * FROM protocol_templates ${where} ORDER BY target_group ASC, type ASC, title ASC`,
    params
  );
}

export async function getTemplatesByGroup(
  group: ProtocolTemplateTargetGroup,
  options: { includeInactive?: boolean } = {}
): Promise<ProtocolTemplate[]> {
  return getAllTemplates({ targetGroup: group, includeInactive: options.includeInactive });
}

export async function getTemplateById(id: string): Promise<ProtocolTemplate | null> {
  const rows = await d1Query<ProtocolTemplate>(
    "SELECT * FROM protocol_templates WHERE id = ?1 LIMIT 1",
    [id]
  );
  return rows[0] ?? null;
}

export async function createTemplate(input: ProtocolTemplateInput): Promise<string> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await d1Execute(
    `INSERT INTO protocol_templates
      (id, type, target_group, title, content, is_active, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`,
    [id, input.type, input.target_group, input.title, input.content, input.is_active === false ? 0 : 1, now, now]
  );
  return id;
}

export async function updateTemplate(
  id: string,
  input: Partial<ProtocolTemplateInput>
): Promise<void> {
  const updates: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (input.type !== undefined) {
    updates.push(`type = ?${idx++}`);
    params.push(input.type);
  }
  if (input.target_group !== undefined) {
    updates.push(`target_group = ?${idx++}`);
    params.push(input.target_group);
  }
  if (input.title !== undefined) {
    updates.push(`title = ?${idx++}`);
    params.push(input.title);
  }
  if (input.content !== undefined) {
    updates.push(`content = ?${idx++}`);
    params.push(input.content);
  }
  if (input.is_active !== undefined) {
    updates.push(`is_active = ?${idx++}`);
    params.push(input.is_active ? 1 : 0);
  }

  if (!updates.length) return;
  updates.push(`updated_at = ?${idx++}`);
  params.push(new Date().toISOString(), id);

  await d1Execute(`UPDATE protocol_templates SET ${updates.join(", ")} WHERE id = ?${idx}`, params);
}

export async function deleteTemplate(id: string): Promise<void> {
  await d1Execute("DELETE FROM protocol_templates WHERE id = ?1", [id]);
}
