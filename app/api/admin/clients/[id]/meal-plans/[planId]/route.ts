import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminFromRequest } from "@/lib/auth/session";
import { getClientById } from "@/lib/repositories/clients";
import { deleteMealPlan, getClientMealPlans, updateMealPlan } from "@/lib/repositories/meal-plans";
import { addTimelineEvent } from "@/lib/repositories/client-timeline";
import { writeAuditLog } from "@/lib/security/audit";
import { getRequestFingerprint } from "@/lib/security/request";
import { getFoodPortionById } from "@/lib/repositories/food-portions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const itemSchema = z.object({
  food: z.string().min(1).max(300),
  quantity: z.string().max(80).nullable().optional(),
  unit: z.string().max(40).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
  // Vinculo estruturado a um alimento (TACO/personalizado) — FASE 2.
  food_source: z.enum(["TACO", "CUSTOM", "MANUFACTURER"]).nullable().optional(),
  food_ref_id: z.string().max(120).nullable().optional(),
  // Vinculo a uma medida caseira especifica (food_portions.id) — FASE 3, validado abaixo contra o food_ref_id real.
  household_measure_id: z.string().max(120).nullable().optional(),
}).strict();

const mealSchema = z.object({
  name: z.string().min(1).max(200),
  suggested_time: z.string().max(30).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
  source_recipe_id: z.string().max(80).nullable().optional(),
  items: z.array(itemSchema).max(80),
}).strict();

const weeklySlotSchema = z.object({
  weekday: z.number().int().min(0).max(6),
  meal_type: z.enum(["almoco", "jantar"]),
  title: z.string().max(200).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
  source_meal_id: z.string().max(100).nullable().optional(),
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
  // Metas nutricionais do plano (FASE 2, seçao 11) — definidas manualmente.
  target_energy_kcal: z.number().nonnegative().max(20000).nullable().optional(),
  target_protein_g: z.number().nonnegative().max(2000).nullable().optional(),
  target_carbohydrate_g: z.number().nonnegative().max(2000).nullable().optional(),
  target_fat_g: z.number().nonnegative().max(2000).nullable().optional(),
  meals: z.array(mealSchema).max(30),
  weekly_slots: z.array(weeklySlotSchema).max(14).optional(),
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

  // Nunca confia num household_measure_id vindo do browser sem revalidar
  // server-side que ele realmente pertence ao mesmo alimento do item —
  // aceitar um id trocado (ex.: da medida de outro alimento) corromperia o
  // calculo em silencio (secao 19 do pedido).
  const measureIds = Array.from(
    new Set(parsed.data.meals.flatMap((meal) => meal.items.map((item) => item.household_measure_id).filter((value): value is string => Boolean(value))))
  );
  if (measureIds.length) {
    const portions = await Promise.all(measureIds.map((measureId) => getFoodPortionById(measureId)));
    const portionById = new Map(portions.filter((portion) => portion !== null).map((portion) => [portion.id, portion]));
    for (const meal of parsed.data.meals) {
      for (const item of meal.items) {
        if (!item.household_measure_id) continue;
        const portion = portionById.get(item.household_measure_id);
        const matches = portion && portion.food_source === item.food_source && portion.food_ref_id === item.food_ref_id;
        if (!matches) {
          return NextResponse.json({ message: `Medida caseira inválida para o alimento "${item.food}".` }, { status: 400 });
        }
      }
    }
  }

  const previousPlan = (await getClientMealPlans(id)).find((item) => item.id === planId) ?? null;
  const previousRecipeIds = new Set(previousPlan?.meals.map((meal) => meal.source_recipe_id).filter(Boolean) ?? []);
  const plan = await updateMealPlan(planId, id, parsed.data);
  if (!plan) return NextResponse.json({ message: "Plano não encontrado." }, { status: 404 });

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

  const addedRecipeMeals = parsed.data.meals.filter((meal) => meal.source_recipe_id && !previousRecipeIds.has(meal.source_recipe_id));
  for (const meal of addedRecipeMeals) {
    await addTimelineEvent({
      client_id: id,
      type: "meal_plan_recipe_added",
      title: "Receita adicionada ao plano alimentar",
      description: `${meal.name} foi inserida como copia no plano do cliente.`,
      metadata: { planId, sourceRecipeId: meal.source_recipe_id, mealName: meal.name },
    });
  }

  return NextResponse.json(plan);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; planId: string }> }
) {
  const admin = await getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ message: "Não autorizado." }, { status: 401 });

  const { id, planId } = await params;
  const client = await getClientById(id);
  if (!client) return NextResponse.json({ message: "Cliente não encontrado." }, { status: 404 });

  const deleted = await deleteMealPlan(planId, id);
  if (!deleted) return NextResponse.json({ message: "Plano não encontrado." }, { status: 404 });

  await addTimelineEvent({
    client_id: id,
    type: "meal_plan_deleted",
    title: "Plano alimentar excluído",
    description: `Plano ${deleted.title} excluído do prontuário.`,
    metadata: { planId, previousStatus: deleted.status },
  });
  await writeAuditLog({
    action: "meal_plan_deleted",
    adminId: admin.sub,
    entityType: "meal_plan",
    entityId: planId,
    ipHash: getRequestFingerprint(req).ipHash,
    metadata: { clientId: id, previousStatus: deleted.status },
  });

  return NextResponse.json({ success: true });
}
