import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminFromRequest } from "@/lib/auth/session";
import {
  archivePatientEducationCard,
  getPatientEducationCardById,
  PATIENT_EDUCATION_CARD_CATEGORIES,
  updatePatientEducationCard,
} from "@/lib/repositories/patient-education-cards";
import { getRequestFingerprint } from "@/lib/security/request";
import { writeAuditLog } from "@/lib/security/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const sectionsSchema = z.record(z.string(), z.unknown());

const cardSchema = z.object({
  slug: z.string().min(1).max(140).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  title: z.string().min(1).max(220),
  category: z.enum(PATIENT_EDUCATION_CARD_CATEGORIES),
  summary: z.string().max(2000).default(""),
  sections: sectionsSchema.default({}),
  is_active: z.boolean().optional(),
}).strict();

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ message: "Nao autorizado." }, { status: 401 });

  const { id } = await params;
  const card = await getPatientEducationCardById(id);
  if (!card) return NextResponse.json({ message: "Ficha nao encontrada." }, { status: 404 });
  return NextResponse.json(card);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ message: "Nao autorizado." }, { status: 401 });

  const { id } = await params;
  const current = await getPatientEducationCardById(id);
  if (!current) return NextResponse.json({ message: "Ficha nao encontrada." }, { status: 404 });

  const parsed = cardSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Dados invalidos." }, { status: 400 });
  }

  await updatePatientEducationCard(id, parsed.data);
  await writeAuditLog({
    action: "patient_education_card_updated",
    adminId: admin.sub,
    entityType: "patient_education_card",
    entityId: id,
    ipHash: getRequestFingerprint(req).ipHash,
    metadata: { changedTitle: parsed.data.title !== current.title, category: parsed.data.category },
  });

  return NextResponse.json({ success: true });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ message: "Nao autorizado." }, { status: 401 });

  const { id } = await params;
  const current = await getPatientEducationCardById(id);
  if (!current) return NextResponse.json({ message: "Ficha nao encontrada." }, { status: 404 });

  await archivePatientEducationCard(id);
  await writeAuditLog({
    action: "patient_education_card_archived",
    adminId: admin.sub,
    entityType: "patient_education_card",
    entityId: id,
    ipHash: getRequestFingerprint(req).ipHash,
    metadata: { title: current.title, category: current.category },
  });

  return NextResponse.json({ success: true });
}
