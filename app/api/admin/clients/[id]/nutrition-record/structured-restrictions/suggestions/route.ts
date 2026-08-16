import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminFromRequest } from "@/lib/auth/session";
import { getClientById } from "@/lib/repositories/clients";
import { getNutritionRecord } from "@/lib/repositories/nutrition-records";
import { recordRejectedClinicalMarkerSuggestion } from "@/lib/repositories/patient-clinical-markers";
import { writeAuditLog } from "@/lib/security/audit";
import { getRequestFingerprint } from "@/lib/security/request";
import { suggestStructuredRestrictionsFromText } from "@/lib/ai/agents/clinical/structured-restriction-suggestions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RejectSchema = z.object({
  suggestion: z.record(z.string(), z.unknown()),
}).strict();

function recordText(record: Awaited<ReturnType<typeof getNutritionRecord>>): string {
  if (!record) return "";
  return [
    record.allergies,
    record.restrictions,
    record.food_aversions,
    record.diagnoses,
    record.clinical_history,
    record.intestinal_health,
    record.risk_flags,
  ].filter(Boolean).join("\n");
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ message: "Nao autorizado." }, { status: 401 });

  const { id } = await params;
  const client = await getClientById(id);
  if (!client) return NextResponse.json({ message: "Cliente nao encontrado." }, { status: 404 });

  const record = await getNutritionRecord(id);
  const suggestions = suggestStructuredRestrictionsFromText(recordText(record));
  return NextResponse.json({ items: suggestions });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ message: "Nao autorizado." }, { status: 401 });

  const { id } = await params;
  const client = await getClientById(id);
  if (!client) return NextResponse.json({ message: "Cliente nao encontrado." }, { status: 404 });

  const parsed = RejectSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: "Dados invalidos." }, { status: 400 });

  await recordRejectedClinicalMarkerSuggestion({ clientId: id, suggestion: parsed.data.suggestion, adminId: admin.sub });
  await writeAuditLog({
    action: "patient_clinical_marker_suggestion_rejected",
    adminId: admin.sub,
    entityType: "client",
    entityId: id,
    ipHash: getRequestFingerprint(req).ipHash,
    metadata: { clientId: id },
  });
  return NextResponse.json({ ok: true });
}
