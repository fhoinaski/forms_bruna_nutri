import { d1Execute, d1Query } from "@/lib/d1/client";
import { ensureSecuritySchema } from "@/lib/security/schema";

export type AuditLog = {
  id: string;
  action: string;
  admin_id: string | null;
  entity_type: string | null;
  entity_id: string | null;
  ip_hash: string | null;
  outcome: string;
  metadata_json: string | null;
  created_at: string;
};

export async function writeAuditLog(input: {
  action: string;
  adminId?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  ipHash?: string | null;
  outcome?: "success" | "failure";
  metadata?: Record<string, unknown>;
}) {
  await ensureSecuritySchema();
  await d1Execute(
    `INSERT INTO admin_audit_logs
      (id, action, metadata_json, created_at, admin_id, entity_type, entity_id, ip_hash, outcome)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)`,
    [crypto.randomUUID(), input.action, input.metadata ? JSON.stringify(input.metadata) : null,
      new Date().toISOString(), input.adminId ?? null, input.entityType ?? null,
      input.entityId ?? null, input.ipHash ?? null, input.outcome ?? "success"]
  );
}

export async function listAuditLogs(limit = 100) {
  await ensureSecuritySchema();
  return d1Query<AuditLog>(
    `SELECT id, action, admin_id, entity_type, entity_id, ip_hash, outcome, metadata_json, created_at
     FROM admin_audit_logs ORDER BY created_at DESC LIMIT ?1`,
    [Math.min(250, Math.max(1, limit))]
  );
}
