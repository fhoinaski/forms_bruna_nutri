import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminFromRequest } from "@/lib/auth/session";
import {
  createPatientEducationCard,
  getPatientEducationCards,
  PATIENT_EDUCATION_CARD_CATEGORIES,
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

export async function GET(req: NextRequest) {
  const admin = await getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ message: "Nao autorizado." }, { status: 401 });

  const category = req.nextUrl.searchParams.get("category") ?? undefined;
  const q = req.nextUrl.searchParams.get("q") ?? undefined;
  const includeInactive = req.nextUrl.searchParams.get("includeInactive") === "true";

  const items = await getPatientEducationCards({
    includeInactive,
    category: PATIENT_EDUCATION_CARD_CATEGORIES.find((item) => item === category),
    q,
  });

  return NextResponse.json({ items });
}

export async function POST(req: NextRequest) {
  const admin = await getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ message: "Nao autorizado." }, { status: 401 });

  const parsed = cardSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Dados invalidos." }, { status: 400 });
  }

  const id = await createPatientEducationCard(parsed.data);
  await writeAuditLog({
    action: "patient_education_card_created",
    adminId: admin.sub,
    entityType: "patient_education_card",
    entityId: id,
    ipHash: getRequestFingerprint(req).ipHash,
    metadata: { title: parsed.data.title, category: parsed.data.category },
  });

  return NextResponse.json({ id }, { status: 201 });
}
