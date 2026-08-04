import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminFromRequest } from "@/lib/auth/session";
import { getClientById } from "@/lib/repositories/clients";
import { updateMealPlan } from "@/lib/repositories/meal-plans";
import { addTimelineEvent } from "@/lib/repositories/client-timeline";
import { writeAuditLog } from "@/lib/security/audit";
import { getRequestFingerprint } from "@/lib/security/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const itemSchema = z.object({
  food: z.string().min(1).max(300),
  quantity: z.string().max(80).nullable().optional(),
  unit: z.string().max(40).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
}).strict();

const mealSchema = z.object({
  name: z.string().min(1).max(200),
  suggested_time: z.string().max(30).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
  items: z.array(itemSchema).max(80),
}).strict();

const substitutionSchema = z.object({
  base_food: z.string().min(1).max(300),
  option_food: z.string().min(1).max(300),
  quantity: z.string().max(80).nullable().optional(),
  unit: z.string().max(40).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
}).strict();

const supplementSchema = z.object({
  name: z.string().min(1).max(300),
  dosage: z.string().max(80).nullable().optional(),
  unit: z.string().max(40).nullable().optional(),
  instructions: z.string().max(1000).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
}).strict();

const UpdateSchema = z.object({
  title: z.string().min(1).max(200),
  status: z.enum(["draft", "active", "archived"]),
  notes: z.string().max(3000).nullable().optional(),
  meals: z.array(mealSchema).max(30),
  substitutions: z.array(substitutionSchema).max(120),
  supplements: z.array(supplementSchema).max(80),
}).strict();

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; planId: string }> }
) {
  const admin = await getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ message: "Não autorizado." }, { status: 401 });

  const { id, planId } = await params;
  const client = await getClientById(id);
  if (!client) return NextResponse.json({ message: "Cliente não encontrado." }, { status: 404 });

  const parsed = UpdateSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Dados inválidos." }, { status: 400 });
  }

  const plan = await updateMealPlan(planId, parsed.data);
  if (!plan || plan.client_id !== id) return NextResponse.json({ message: "Plano não encontrado." }, { status: 404 });

  await addTimelineEvent({
    client_id: id,
    type: "meal_plan_updated",
    title: parsed.data.status === "active" ? "Plano alimentar ativado" : "Plano alimentar atualizado",
    description: `Plano ${parsed.data.title} salvo na versão ${plan.version}.`,
    metadata: { planId, status: parsed.data.status, version: plan.version },
  });
  await writeAuditLog({
    action: "meal_plan_updated",
    adminId: admin.sub,
    entityType: "meal_plan",
    entityId: planId,
    ipHash: getRequestFingerprint(req).ipHash,
    metadata: { clientId: id, status: parsed.data.status, version: plan.version },
  });

  return NextResponse.json(plan);
}
