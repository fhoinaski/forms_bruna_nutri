import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminFromRequest } from "@/lib/auth/session";
import { getClientById } from "@/lib/repositories/clients";
import { writeAuditLog } from "@/lib/security/audit";
import { getRequestFingerprint } from "@/lib/security/request";
import {
  createPatientClinicalMarker,
  listPatientClinicalMarkers,
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

const CreateSchema = z.object({
  type: z.enum(CLINICAL_MARKER_TYPES),
  normalizedCode: z.string().min(1).max(80),
  label: z.string().max(200).nullable().optional(),
  severity: z.enum(CLINICAL_MARKER_SEVERITIES).optional(),
  status: z.enum(CLINICAL_MARKER_STATUSES).optional(),
  source: z.enum(CLINICAL_MARKER_SOURCES).optional(),
  evidenceText: z.string().max(1000).nullable().optional(),
}).strict();

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ message: "Nao autorizado." }, { status: 401 });

  const { id } = await params;
  const client = await getClientById(id);
  if (!client) return NextResponse.json({ message: "Cliente nao encontrado." }, { status: 404 });

  const url = new URL(req.url);
  const includeResolved = url.searchParams.get("includeResolved") === "1";
  return NextResponse.json({ items: await listPatientClinicalMarkers(id, { includeResolved }) });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ message: "Nao autorizado." }, { status: 401 });

  const { id } = await params;
  const client = await getClientById(id);
  if (!client) return NextResponse.json({ message: "Cliente nao encontrado." }, { status: 404 });

  const parsed = CreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: "Dados invalidos." }, { status: 400 });

  const normalizedCode = normalizeClinicalMarkerCode(parsed.data.normalizedCode);
  if (!normalizedCode) return NextResponse.json({ message: "Codigo clinico invalido." }, { status: 400 });
  if (parsed.data.status === "RESOLVED") {
    return NextResponse.json({ message: "Crie marcadores como ativo ou suspeito; use resolver para encerrar." }, { status: 400 });
  }

  const marker = await createPatientClinicalMarker({
    clientId: id,
    type: parsed.data.type,
    normalizedCode,
    label: parsed.data.label ?? null,
    severity: parsed.data.severity,
    status: parsed.data.status === "ACTIVE" || parsed.data.status === "SUSPECTED" ? parsed.data.status : undefined,
    source: parsed.data.source,
    evidenceText: parsed.data.evidenceText ?? null,
    adminId: admin.sub,
  });

  await writeAuditLog({
    action: "patient_clinical_marker_created",
    adminId: admin.sub,
    entityType: "patient_clinical_marker",
    entityId: marker.id,
    ipHash: getRequestFingerprint(req).ipHash,
    metadata: { clientId: id, type: marker.type, normalizedCode: marker.normalized_code, status: marker.status, source: marker.source },
  });

  return NextResponse.json(marker, { status: 201 });
}
