import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminFromRequest } from "@/lib/auth/session";
import { getClientById } from "@/lib/repositories/clients";
import { writeAuditLog } from "@/lib/security/audit";
import { getRequestFingerprint } from "@/lib/security/request";
import {
  getPatientClinicalMarker,
  updatePatientClinicalMarker,
} from "@/lib/repositories/patient-clinical-markers";
import {
  CLINICAL_MARKER_SEVERITIES,
  CLINICAL_MARKER_STATUSES,
  CLINICAL_MARKER_SOURCES,
  CLINICAL_MARKER_TYPES,
  normalizeClinicalMarkerCode,
} from "@/lib/clinical/structured-markers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UpdateSchema = z.object({
  type: z.enum(CLINICAL_MARKER_TYPES).optional(),
  normalizedCode: z.string().min(1).max(80).optional(),
  label: z.string().max(200).nullable().optional(),
  severity: z.enum(CLINICAL_MARKER_SEVERITIES).optional(),
  status: z.enum(CLINICAL_MARKER_STATUSES).optional(),
  source: z.enum(CLINICAL_MARKER_SOURCES).optional(),
  evidenceText: z.string().max(1000).nullable().optional(),
}).strict();

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; restrictionId: string }> }
) {
  const admin = await getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ message: "Nao autorizado." }, { status: 401 });

  const { id, restrictionId } = await params;
  const client = await getClientById(id);
  if (!client) return NextResponse.json({ message: "Cliente nao encontrado." }, { status: 404 });

  const existing = await getPatientClinicalMarker(id, restrictionId);
  if (!existing) return NextResponse.json({ message: "Marcador clinico nao encontrado." }, { status: 404 });

  const parsed = UpdateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: "Dados invalidos." }, { status: 400 });

  const normalizedCode = parsed.data.normalizedCode === undefined
    ? undefined
    : normalizeClinicalMarkerCode(parsed.data.normalizedCode);
  if (parsed.data.normalizedCode !== undefined && !normalizedCode) {
    return NextResponse.json({ message: "Codigo clinico invalido." }, { status: 400 });
  }

  const marker = await updatePatientClinicalMarker(id, restrictionId, {
    type: parsed.data.type,
    normalizedCode: normalizedCode ?? undefined,
    label: parsed.data.label,
    severity: parsed.data.severity,
    status: parsed.data.status,
    source: parsed.data.source,
    evidenceText: parsed.data.evidenceText,
    adminId: admin.sub,
  });
  if (!marker) return NextResponse.json({ message: "Marcador clinico nao encontrado." }, { status: 404 });

  await writeAuditLog({
    action: marker.status === "RESOLVED" && existing.status !== "RESOLVED"
      ? "patient_clinical_marker_resolved"
      : "patient_clinical_marker_updated",
    adminId: admin.sub,
    entityType: "patient_clinical_marker",
    entityId: marker.id,
    ipHash: getRequestFingerprint(req).ipHash,
    metadata: { clientId: id, type: marker.type, normalizedCode: marker.normalized_code, status: marker.status },
  });

  return NextResponse.json(marker);
}
