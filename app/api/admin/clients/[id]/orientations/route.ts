import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminFromRequest } from "@/lib/auth/session";
import { getClientById } from "@/lib/repositories/clients";
import { getPatientEducationCardById } from "@/lib/repositories/patient-education-cards";
import { createEducationPublication, listPatientEducationPublications, setEducationPublicationStatus } from "@/lib/repositories/patient-deliverables";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// The catalog contains both UUIDs (custom cards) and stable seeded IDs such as
// `edu-patologia-doenca-celiaca`. Accept either form; existence is verified
// against the catalog below.
const inputSchema = z.object({ education_card_id: z.string().trim().min(1).max(200) }).strict();
const statusSchema = z.object({ id: z.string().uuid(), status: z.enum(["DRAFT", "PUBLISHED", "REVOKED"]) }).strict();
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminFromRequest(req); if (!admin) return NextResponse.json({ message: "Nao autorizado." }, { status: 401 });
  const { id } = await params; return NextResponse.json({ items: await listPatientEducationPublications(id) });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminFromRequest(req); if (!admin) return NextResponse.json({ message: "Nao autorizado." }, { status: 401 });
  const { id: patientId } = await params;
  const parsed = inputSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: "Orientacao invalida." }, { status: 400 });
  const [patient, card] = await Promise.all([getClientById(patientId), getPatientEducationCardById(parsed.data.education_card_id)]);
  if (!patient || !card) return NextResponse.json({ message: "Paciente ou orientacao nao encontrada." }, { status: 404 });
  const id = await createEducationPublication(patientId, card, admin.sub);
  return NextResponse.json({ id, status: "DRAFT" }, { status: 201 });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminFromRequest(req); if (!admin) return NextResponse.json({ message: "Nao autorizado." }, { status: 401 });
  const { id: patientId } = await params;
  const parsed = statusSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: "Atualizacao invalida." }, { status: 400 });
  const changed = await setEducationPublicationStatus(patientId, parsed.data.id, parsed.data.status, admin.sub);
  return changed ? NextResponse.json({ success: true }) : NextResponse.json({ message: "Orientacao nao encontrada." }, { status: 404 });
}
