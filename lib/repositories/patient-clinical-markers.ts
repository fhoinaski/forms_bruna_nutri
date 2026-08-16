import { d1Batch, d1Execute, d1Query, type D1Statement } from "@/lib/d1/client";
import { encryptJsonValue, decryptJsonValue, encryptNullableText, decryptNullableText } from "@/lib/security/encrypted-fields";
import type {
  ClinicalMarkerSeverity,
  ClinicalMarkerSource,
  ClinicalMarkerStatus,
  ClinicalMarkerType,
} from "@/lib/clinical/structured-markers";

export interface PatientClinicalMarker {
  id: string;
  client_id: string;
  type: ClinicalMarkerType;
  normalized_code: string;
  label: string | null;
  severity: ClinicalMarkerSeverity;
  status: ClinicalMarkerStatus;
  source: ClinicalMarkerSource;
  evidence_text: string | null;
  created_by_admin_id: string | null;
  updated_by_admin_id: string | null;
  resolved_by_admin_id: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
}

interface PatientClinicalMarkerRow extends Omit<PatientClinicalMarker, "label" | "evidence_text"> {
  label_encrypted: string | null;
  evidence_text_encrypted: string | null;
}

export interface CreatePatientClinicalMarkerInput {
  clientId: string;
  type: ClinicalMarkerType;
  normalizedCode: string;
  label?: string | null;
  severity?: ClinicalMarkerSeverity;
  status?: Exclude<ClinicalMarkerStatus, "RESOLVED">;
  source?: ClinicalMarkerSource;
  evidenceText?: string | null;
  adminId?: string | null;
}

export interface UpdatePatientClinicalMarkerInput {
  type?: ClinicalMarkerType;
  normalizedCode?: string;
  label?: string | null;
  severity?: ClinicalMarkerSeverity;
  status?: ClinicalMarkerStatus;
  source?: ClinicalMarkerSource;
  evidenceText?: string | null;
  adminId?: string | null;
}

function decryptMarker(row: PatientClinicalMarkerRow | undefined): PatientClinicalMarker | null {
  if (!row) return null;
  const { label_encrypted, evidence_text_encrypted, ...rest } = row;
  return {
    ...rest,
    label: decryptNullableText(label_encrypted),
    evidence_text: decryptNullableText(evidence_text_encrypted),
  };
}

function snapshot(marker: PatientClinicalMarker | null): Record<string, unknown> | null {
  if (!marker) return null;
  return {
    id: marker.id,
    client_id: marker.client_id,
    type: marker.type,
    normalized_code: marker.normalized_code,
    label: marker.label,
    severity: marker.severity,
    status: marker.status,
    source: marker.source,
    evidence_text: marker.evidence_text,
    resolved_at: marker.resolved_at,
    created_at: marker.created_at,
    updated_at: marker.updated_at,
  };
}

function eventStatement(input: {
  markerId: string | null;
  clientId: string;
  action: "created" | "updated" | "resolved" | "ai_suggestion_confirmed" | "ai_suggestion_rejected";
  previous: PatientClinicalMarker | null;
  next: PatientClinicalMarker | null;
  adminId?: string | null;
  source?: string;
  now: string;
}): D1Statement {
  return {
    sql: `INSERT INTO patient_clinical_marker_events
      (id, marker_id, client_id, action, previous_snapshot_encrypted, next_snapshot_encrypted, admin_id, source, created_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)`,
    params: [
      crypto.randomUUID(),
      input.markerId,
      input.clientId,
      input.action,
      input.previous ? encryptJsonValue(snapshot(input.previous)) : null,
      input.next ? encryptJsonValue(snapshot(input.next)) : null,
      input.adminId ?? null,
      input.source ?? "manual",
      input.now,
    ],
  };
}

export async function listPatientClinicalMarkers(clientId: string, options: { includeResolved?: boolean } = {}): Promise<PatientClinicalMarker[]> {
  const rows = await d1Query<PatientClinicalMarkerRow>(
    options.includeResolved
      ? "SELECT * FROM patient_clinical_markers WHERE client_id = ?1 ORDER BY status ASC, type ASC, normalized_code ASC"
      : "SELECT * FROM patient_clinical_markers WHERE client_id = ?1 AND status <> 'RESOLVED' ORDER BY type ASC, normalized_code ASC",
    [clientId]
  );
  return rows.map((row) => decryptMarker(row)).filter((row): row is PatientClinicalMarker => Boolean(row));
}

export async function getPatientClinicalMarker(clientId: string, markerId: string): Promise<PatientClinicalMarker | null> {
  const rows = await d1Query<PatientClinicalMarkerRow>(
    "SELECT * FROM patient_clinical_markers WHERE client_id = ?1 AND id = ?2 LIMIT 1",
    [clientId, markerId]
  );
  return decryptMarker(rows[0]);
}

export async function createPatientClinicalMarker(input: CreatePatientClinicalMarkerInput): Promise<PatientClinicalMarker> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const marker: PatientClinicalMarker = {
    id,
    client_id: input.clientId,
    type: input.type,
    normalized_code: input.normalizedCode,
    label: input.label ?? null,
    severity: input.severity ?? "unknown",
    status: input.status ?? "ACTIVE",
    source: input.source ?? "manual",
    evidence_text: input.evidenceText ?? null,
    created_by_admin_id: input.adminId ?? null,
    updated_by_admin_id: input.adminId ?? null,
    resolved_by_admin_id: null,
    resolved_at: null,
    created_at: now,
    updated_at: now,
  };

  await d1Batch([
    {
      sql: `INSERT INTO patient_clinical_markers
        (id, client_id, type, normalized_code, label_encrypted, severity, status, source,
         evidence_text_encrypted, created_by_admin_id, updated_by_admin_id, resolved_by_admin_id,
         resolved_at, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, NULL, NULL, ?12, ?13)`,
      params: [
        id,
        input.clientId,
        input.type,
        input.normalizedCode,
        encryptNullableText(input.label ?? null),
        marker.severity,
        marker.status,
        marker.source,
        encryptNullableText(input.evidenceText ?? null),
        input.adminId ?? null,
        input.adminId ?? null,
        now,
        now,
      ],
    },
    eventStatement({
      markerId: id,
      clientId: input.clientId,
      action: input.source === "ai_suggestion_confirmed" ? "ai_suggestion_confirmed" : "created",
      previous: null,
      next: marker,
      adminId: input.adminId,
      source: marker.source,
      now,
    }),
  ]);
  return marker;
}

export async function updatePatientClinicalMarker(
  clientId: string,
  markerId: string,
  input: UpdatePatientClinicalMarkerInput
): Promise<PatientClinicalMarker | null> {
  const existing = await getPatientClinicalMarker(clientId, markerId);
  if (!existing) return null;
  const now = new Date().toISOString();
  const next: PatientClinicalMarker = {
    ...existing,
    type: input.type ?? existing.type,
    normalized_code: input.normalizedCode ?? existing.normalized_code,
    label: input.label === undefined ? existing.label : input.label,
    severity: input.severity ?? existing.severity,
    status: input.status ?? existing.status,
    source: input.source ?? existing.source,
    evidence_text: input.evidenceText === undefined ? existing.evidence_text : input.evidenceText,
    updated_by_admin_id: input.adminId ?? existing.updated_by_admin_id,
    resolved_by_admin_id: input.status === "RESOLVED" ? input.adminId ?? existing.resolved_by_admin_id : existing.resolved_by_admin_id,
    resolved_at: input.status === "RESOLVED" ? now : existing.resolved_at,
    updated_at: now,
  };
  const action = next.status === "RESOLVED" && existing.status !== "RESOLVED" ? "resolved" : "updated";

  await d1Batch([
    {
      sql: `UPDATE patient_clinical_markers SET
        type = ?1, normalized_code = ?2, label_encrypted = ?3, severity = ?4, status = ?5, source = ?6,
        evidence_text_encrypted = ?7, updated_by_admin_id = ?8, resolved_by_admin_id = ?9, resolved_at = ?10, updated_at = ?11
       WHERE client_id = ?12 AND id = ?13`,
      params: [
        next.type,
        next.normalized_code,
        encryptNullableText(next.label),
        next.severity,
        next.status,
        next.source,
        encryptNullableText(next.evidence_text),
        next.updated_by_admin_id,
        next.resolved_by_admin_id,
        next.resolved_at,
        now,
        clientId,
        markerId,
      ],
    },
    eventStatement({
      markerId,
      clientId,
      action,
      previous: existing,
      next,
      adminId: input.adminId,
      source: input.source ?? existing.source,
      now,
    }),
  ]);
  return next;
}

export async function recordRejectedClinicalMarkerSuggestion(input: {
  clientId: string;
  suggestion: Record<string, unknown>;
  adminId?: string | null;
}): Promise<void> {
  const now = new Date().toISOString();
  await d1Execute(
    `INSERT INTO patient_clinical_marker_events
      (id, marker_id, client_id, action, previous_snapshot_encrypted, next_snapshot_encrypted, admin_id, source, created_at)
     VALUES (?1, NULL, ?2, 'ai_suggestion_rejected', NULL, ?3, ?4, 'ai_suggestion', ?5)`,
    [crypto.randomUUID(), input.clientId, encryptJsonValue(input.suggestion), input.adminId ?? null, now]
  );
}

export function decryptClinicalMarkerEventSnapshot(value: string | null): Record<string, unknown> | null {
  return value ? decryptJsonValue<Record<string, unknown>>(value, {}) : null;
}
