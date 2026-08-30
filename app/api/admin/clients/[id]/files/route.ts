import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminFromRequest } from "@/lib/auth/session";
import { getClientById } from "@/lib/repositories/clients";
import { createPatientFile, listPatientFiles, setPatientFileStatus } from "@/lib/repositories/patient-deliverables";
import { getPatientFilesBucket, isAllowedPatientFile, patientFileObjectKey, safePatientFilename } from "@/lib/storage/patient-files";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const statusSchema = z.object({ id: z.string().uuid(), status: z.enum(["PRIVATE", "PUBLISHED", "REVOKED"]) }).strict();
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminFromRequest(req); if (!admin) return NextResponse.json({ message: "Nao autorizado." }, { status: 401 });
  const { id } = await params; const items = await listPatientFiles(id); return NextResponse.json({ items: items.map(({ object_key: _objectKey, ...item }) => item) });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminFromRequest(req); if (!admin) return NextResponse.json({ message: "Nao autorizado." }, { status: 401 });
  const { id: patientId } = await params;
  if (!await getClientById(patientId)) return NextResponse.json({ message: "Paciente nao encontrado." }, { status: 404 });
  const form = await req.formData().catch(() => null); const file = form?.get("file");
  if (!(file instanceof File) || !isAllowedPatientFile(file)) return NextResponse.json({ message: "Arquivo invalido. Envie PDF, JPG, PNG ou WEBP de ate 10 MB." }, { status: 400 });
  const id = crypto.randomUUID(); const objectKey = patientFileObjectKey(patientId, id, file.type);
  const bucket = getPatientFilesBucket();
  await bucket.put(objectKey, await file.arrayBuffer(), { httpMetadata: { contentType: file.type } });
  try {
    await createPatientFile({ id, patient_id: patientId, object_key: objectKey, original_filename: safePatientFilename(file.name), mime_type: file.type, byte_size: file.size });
  } catch (error) {
    await bucket.delete(objectKey).catch(() => undefined);
    throw error;
  }
  return NextResponse.json({ id, status: "PRIVATE" }, { status: 201 });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminFromRequest(req); if (!admin) return NextResponse.json({ message: "Nao autorizado." }, { status: 401 });
  const { id: patientId } = await params;
  const parsed = statusSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: "Atualizacao invalida." }, { status: 400 });
  const changed = await setPatientFileStatus(patientId, parsed.data.id, parsed.data.status, admin.sub);
  return changed ? NextResponse.json({ success: true }) : NextResponse.json({ message: "Arquivo nao encontrado." }, { status: 404 });
}
