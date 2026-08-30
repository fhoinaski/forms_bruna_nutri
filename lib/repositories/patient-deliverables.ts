import { d1Execute, d1Query } from "@/lib/d1/client";
import type { PatientEducationCardPayload } from "@/lib/repositories/patient-education-cards";

export type PatientEducationPublicationStatus = "DRAFT" | "PUBLISHED" | "REVOKED";
export type PatientFileStatus = "PRIVATE" | "PUBLISHED" | "REVOKED";

export interface PatientEducationPublication {
  id: string; patient_id: string; education_card_id: string; status: PatientEducationPublicationStatus;
  snapshot_title: string; snapshot_category: string; snapshot_summary: string; snapshot_sections_json: string;
  published_at: string | null; published_by_admin_id: string | null; revoked_at: string | null; revoked_by_admin_id: string | null;
  created_at: string; updated_at: string;
}
export interface PatientFile {
  id: string; patient_id: string; object_key: string; original_filename: string; mime_type: string; byte_size: number;
  status: PatientFileStatus; published_at: string | null; published_by_admin_id: string | null;
  revoked_at: string | null; revoked_by_admin_id: string | null; created_at: string; updated_at: string;
}

export async function listPatientPortalOrientations(patientId: string): Promise<PatientEducationPublication[]> {
  return d1Query<PatientEducationPublication>("SELECT * FROM patient_education_publications WHERE patient_id = ?1 AND status = 'PUBLISHED' ORDER BY published_at DESC, created_at DESC", [patientId]);
}
export async function listPatientEducationPublications(patientId: string): Promise<PatientEducationPublication[]> {
  return d1Query<PatientEducationPublication>("SELECT * FROM patient_education_publications WHERE patient_id = ?1 ORDER BY created_at DESC", [patientId]);
}
export async function listPatientPortalFiles(patientId: string): Promise<PatientFile[]> {
  return d1Query<PatientFile>("SELECT * FROM patient_files WHERE patient_id = ?1 AND status = 'PUBLISHED' ORDER BY published_at DESC, created_at DESC", [patientId]);
}
export async function listPatientFiles(patientId: string): Promise<PatientFile[]> {
  return d1Query<PatientFile>("SELECT * FROM patient_files WHERE patient_id = ?1 ORDER BY created_at DESC", [patientId]);
}
export async function getPatientPortalFile(patientId: string, fileId: string): Promise<PatientFile | null> {
  const rows = await d1Query<PatientFile>("SELECT * FROM patient_files WHERE id = ?1 AND patient_id = ?2 AND status = 'PUBLISHED' LIMIT 1", [fileId, patientId]);
  return rows[0] ?? null;
}
export async function createEducationPublication(patientId: string, card: PatientEducationCardPayload, adminId: string): Promise<string> {
  const id = crypto.randomUUID(); const now = new Date().toISOString();
  await d1Execute(`INSERT INTO patient_education_publications (id, patient_id, education_card_id, status, snapshot_title, snapshot_category, snapshot_summary, snapshot_sections_json, created_at, updated_at)
    VALUES (?1, ?2, ?3, 'DRAFT', ?4, ?5, ?6, ?7, ?8, ?8)`, [id, patientId, card.id, card.title, card.category, card.summary, JSON.stringify(card.sections), now]);
  return id;
}
export async function setEducationPublicationStatus(patientId: string, id: string, status: PatientEducationPublicationStatus, adminId: string): Promise<boolean> {
  const now = new Date().toISOString();
  const rows = await d1Query<{ id: string }>(`UPDATE patient_education_publications SET status = ?1, published_at = CASE WHEN ?1 = 'PUBLISHED' THEN ?2 ELSE published_at END, published_by_admin_id = CASE WHEN ?1 = 'PUBLISHED' THEN ?3 ELSE published_by_admin_id END, revoked_at = CASE WHEN ?1 = 'REVOKED' THEN ?2 ELSE NULL END, revoked_by_admin_id = CASE WHEN ?1 = 'REVOKED' THEN ?3 ELSE NULL END, updated_at = ?2 WHERE id = ?4 AND patient_id = ?5 RETURNING id`, [status, now, adminId, id, patientId]);
  return Boolean(rows[0]);
}
export async function createPatientFile(input: Omit<PatientFile, "status" | "published_at" | "published_by_admin_id" | "revoked_at" | "revoked_by_admin_id" | "created_at" | "updated_at">): Promise<void> {
  const now = new Date().toISOString();
  await d1Execute(`INSERT INTO patient_files (id, patient_id, object_key, original_filename, mime_type, byte_size, status, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'PRIVATE', ?7, ?7)`, [input.id, input.patient_id, input.object_key, input.original_filename, input.mime_type, input.byte_size, now]);
}
export async function setPatientFileStatus(patientId: string, id: string, status: PatientFileStatus, adminId: string): Promise<boolean> {
  const now = new Date().toISOString();
  const rows = await d1Query<{ id: string }>(`UPDATE patient_files SET status = ?1, published_at = CASE WHEN ?1 = 'PUBLISHED' THEN ?2 ELSE published_at END, published_by_admin_id = CASE WHEN ?1 = 'PUBLISHED' THEN ?3 ELSE published_by_admin_id END, revoked_at = CASE WHEN ?1 = 'REVOKED' THEN ?2 ELSE NULL END, revoked_by_admin_id = CASE WHEN ?1 = 'REVOKED' THEN ?3 ELSE NULL END, updated_at = ?2 WHERE id = ?4 AND patient_id = ?5 RETURNING id`, [status, now, adminId, id, patientId]);
  return Boolean(rows[0]);
}
