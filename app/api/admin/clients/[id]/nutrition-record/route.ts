import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminFromRequest } from "@/lib/auth/session";
import { getRequestFingerprint } from "@/lib/security/request";
import { writeAuditLog } from "@/lib/security/audit";
import { getClientById } from "@/lib/repositories/clients";
import {
  getNutritionRecord,
  updateNutritionRecord,
} from "@/lib/repositories/nutrition-records";
import { addTimelineEvent } from "@/lib/repositories/client-timeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const textField = z.string().max(8000).nullable().optional();
const shortField = z.string().max(120).nullable().optional();

const UpdateSchema = z.object({
  chief_complaint: textField,
  life_stage: shortField,
  biological_sex: shortField,
  target_group: shortField,
  gestational_weeks: shortField,
  breastfeeding_context: textField,
  clinical_history: textField,
  diagnoses: textField,
  medications: textField,
  supplements: textField,
  allergies: textField,
  restrictions: textField,
  food_preferences: textField,
  food_aversions: textField,
  eating_routine: textField,
  intestinal_health: textField,
  sleep_routine: textField,
  stress_context: textField,
  physical_activity: textField,
  hydration: textField,
  current_weight_kg: shortField,
  height_cm: shortField,
  bmi: shortField,
  pre_pregnancy_weight_kg: shortField,
  waist_cm: shortField,
  pre_surgery_weight_kg: shortField,
  bariatric_surgery_date: shortField,
  anthropometry_notes: textField,
  pediatric_growth_notes: textField,
  target_weight_kg: shortField,
  target_notes: textField,
  exams: textField,
  assessment: textField,
  goals: textField,
  care_plan: textField,
  risk_flags: textField,
  family_context: textField,
  private_notes: textField,
}).strict();

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await getAdminFromRequest(req);
  if (!admin) {
    return NextResponse.json({ message: "Nao autorizado." }, { status: 401 });
  }

  const { id } = await params;
  const client = await getClientById(id);
  if (!client) {
    return NextResponse.json({ message: "Cliente nao encontrado." }, { status: 404 });
  }

  const record = await getNutritionRecord(id);
  return NextResponse.json(record);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await getAdminFromRequest(req);
  if (!admin) {
    return NextResponse.json({ message: "Nao autorizado." }, { status: 401 });
  }

  const { id } = await params;
  const client = await getClientById(id);
  if (!client) {
    return NextResponse.json({ message: "Cliente nao encontrado." }, { status: 404 });
  }

  const parsed = UpdateSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ message: "Dados invalidos." }, { status: 400 });
  }

  const record = await updateNutritionRecord(id, parsed.data);
  await addTimelineEvent({
    client_id: id,
    type: "nutrition_record_updated",
    title: "Prontuario nutricional atualizado",
    description: "Ficha clinica, conduta ou dados nutricionais revisados.",
    metadata: { fields: Object.keys(parsed.data) },
  });
  await writeAuditLog({
    action: "nutrition_record_updated",
    adminId: admin.sub,
    entityType: "nutrition_record",
    entityId: record.id,
    ipHash: getRequestFingerprint(req).ipHash,
    metadata: { clientId: id, fields: Object.keys(parsed.data) },
  });

  return NextResponse.json(record);
}
