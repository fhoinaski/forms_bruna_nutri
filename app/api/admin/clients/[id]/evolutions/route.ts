import { NextRequest, NextResponse } from "next/server";
import { getAdminFromRequest } from "@/lib/auth/session";
import { getClientEvolutions, createClientEvolution } from "@/lib/repositories/client-evolutions";
import { addTimelineEvent } from "@/lib/repositories/client-timeline";
import { getClientById } from "@/lib/repositories/clients";
import { getNutritionRecord } from "@/lib/repositories/nutrition-records";
import { calculateAgeInYears } from "@/lib/clinical/anthropometry";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const createSchema = z.object({
  client_protocol_id: z.string().optional().nullable(),
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

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ message: "Não autorizado." }, { status: 401 });

  const { id } = await params;
  const evolutions = await getClientEvolutions(id);
  return NextResponse.json(evolutions);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ message: "Não autorizado." }, { status: 401 });

  const { id } = await params;

  const client = await getClientById(id);
  if (!client) return NextResponse.json({ message: "Cliente não encontrado." }, { status: 404 });

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Dados inválidos." }, { status: 400 });
  }

  const nutritionRecord = await getNutritionRecord(id);
  const measurementDate = parsed.data.measured_at ? new Date(parsed.data.measured_at) : new Date();
  const ageYears = calculateAgeInYears(client.birth_date, measurementDate);

  const evolutionId = await createClientEvolution({
    client_id: id,
    ...parsed.data,
    age_years: ageYears,
    biological_sex: nutritionRecord?.biological_sex ?? null,
  });

  const weightNote = parsed.data.weight ? ` | Peso: ${parsed.data.weight}kg` : "";
  await addTimelineEvent({
    client_id: id,
    type: "evolution_recorded",
    title: "Evolução registrada",
    description: `Registro de evolução clínica${weightNote}`,
    metadata: { evolutionId },
  });

  return NextResponse.json({ success: true, evolutionId }, { status: 201 });
}
