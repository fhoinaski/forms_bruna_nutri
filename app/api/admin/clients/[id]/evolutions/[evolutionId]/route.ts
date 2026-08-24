import { NextRequest, NextResponse } from "next/server";
import { getAdminFromRequest } from "@/lib/auth/session";
import { calculateAgeInYears } from "@/lib/clinical/anthropometry";
import {
  deleteClientEvolution,
  getClientEvolutionById,
  updateClientEvolution,
} from "@/lib/repositories/client-evolutions";
import { getClientById } from "@/lib/repositories/clients";
import { getNutritionRecord } from "@/lib/repositories/nutrition-records";
import { getPatientAnthropometryAssessment } from "@/lib/repositories/patient-anthropometry-progress";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const patchSchema = z.object({
  measured_at: z.string().datetime().optional().nullable(),
  weight: z.number().positive().optional().nullable(),
  height: z.number().positive().optional().nullable(),
  waist_cm: z.number().positive().optional().nullable(),
  hip_cm: z.number().positive().optional().nullable(),
  arm_cm: z.number().positive().optional().nullable(),
  abdomen_cm: z.number().positive().optional().nullable(),
  thigh_cm: z.number().positive().optional().nullable(),
  body_fat_percentage: z.number().min(1).max(80).optional().nullable(),
  skinfold_triceps_mm: z.number().positive().max(80).optional().nullable(),
  skinfold_subscapular_mm: z.number().positive().max(80).optional().nullable(),
  skinfold_chest_mm: z.number().positive().max(80).optional().nullable(),
  skinfold_midaxillary_mm: z.number().positive().max(80).optional().nullable(),
  skinfold_suprailiac_mm: z.number().positive().max(80).optional().nullable(),
  skinfold_abdominal_mm: z.number().positive().max(80).optional().nullable(),
  skinfold_thigh_mm: z.number().positive().max(80).optional().nullable(),
  blood_pressure: z.string().max(40).optional().nullable(),
  energy_level: z.number().int().min(1).max(5).optional().nullable(),
  appetite: z.string().max(120).optional().nullable(),
  bowel_pattern: z.string().max(120).optional().nullable(),
  sleep_quality: z.string().max(120).optional().nullable(),
  symptoms: z.string().max(5000).optional().nullable(),
  adherence_notes: z.string().max(5000).optional().nullable(),
  adherence_score: z.number().int().min(0).max(10).optional().nullable(),
  progress_notes: z.string().max(5000).optional().nullable(),
  conduct_notes: z.string().max(5000).optional().nullable(),
  clinical_impression: z.string().max(5000).optional().nullable(),
  next_steps: z.string().max(5000).optional().nullable(),
});

async function resolveOwnedEvolution(clientId: string, evolutionId: string) {
  const client = await getClientById(clientId);
  if (!client) return { client: null, evolution: null };
  const evolution = await getClientEvolutionById(evolutionId);
  if (!evolution || evolution.client_id !== clientId) return { client, evolution: null };
  return { client, evolution };
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; evolutionId: string }> }
) {
  const admin = await getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ message: "Não autorizado." }, { status: 401 });

  const { id, evolutionId } = await params;
  const assessment = await getPatientAnthropometryAssessment(id, evolutionId);
  if (!assessment) return NextResponse.json({ message: "Avaliação não encontrada." }, { status: 404 });
  return NextResponse.json({ assessment }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; evolutionId: string }> }
) {
  const admin = await getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ message: "Não autorizado." }, { status: 401 });

  const { id, evolutionId } = await params;
  const { client, evolution } = await resolveOwnedEvolution(id, evolutionId);
  if (!client || !evolution) return NextResponse.json({ message: "Avaliação não encontrada." }, { status: 404 });

  const parsed = patchSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Dados inválidos." }, { status: 400 });
  }

  const nutritionRecord = await getNutritionRecord(id);
  const measurementDate = parsed.data.measured_at ? new Date(parsed.data.measured_at) : new Date(evolution.measured_at ?? evolution.created_at);
  await updateClientEvolution(evolutionId, {
    ...parsed.data,
    age_years: calculateAgeInYears(client.birth_date, measurementDate),
    biological_sex: nutritionRecord?.biological_sex ?? null,
  });

  return NextResponse.json({ success: true });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; evolutionId: string }> }
) {
  const admin = await getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ message: "Não autorizado." }, { status: 401 });

  const { id, evolutionId } = await params;
  const { client, evolution } = await resolveOwnedEvolution(id, evolutionId);
  if (!client || !evolution) return NextResponse.json({ message: "Avaliação não encontrada." }, { status: 404 });

  await deleteClientEvolution(evolutionId);
  return NextResponse.json({ success: true });
}
