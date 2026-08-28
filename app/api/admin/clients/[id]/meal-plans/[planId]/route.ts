import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminFromRequest } from "@/lib/auth/session";
import { getClientById } from "@/lib/repositories/clients";
import { deleteMealPlan, getClientMealPlans, MealPlanVersionConflictError, updateMealPlan } from "@/lib/repositories/meal-plans";
import { addTimelineEvent } from "@/lib/repositories/client-timeline";
import { writeAuditLog } from "@/lib/security/audit";
import { getRequestFingerprint } from "@/lib/security/request";
import { getFoodPortionById } from "@/lib/repositories/food-portions";
import { validateMealPlanForPublication } from "@/lib/repositories/meal-plan-publication";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const itemSchema = z.object({
  food: z.string().min(1).max(300),
  quantity: z.string().max(80).nullable().optional(),
  unit: z.string().max(40).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
  is_optional: z.boolean().optional(),
  // Vinculo estruturado a um alimento (TACO/personalizado) — FASE 2.
  // FASE 6.5 (item 5): TBCA/IBGE_POF aceitos aqui (o item do plano em si —
  // "onde a identidade e transportada"), nunca em substitutionSchema
  // abaixo (item 13: substitutions continua so TACO/CUSTOM/MANUFACTURER/USDA
  // nesta fase).
  food_source: z.enum(["TACO", "CUSTOM", "MANUFACTURER", "USDA", "TBCA", "IBGE_POF"]).nullable().optional(),
  food_ref_id: z.string().max(120).nullable().optional(),
  // FASE 6.5 (item 3) — identidade canonica completa (ex.:
  // "tbca:medidas_caseiras:BRC0001C"), separada de food_ref_id
  // (sourceFoodId cru). NULL pra todo item legado.
  canonical_food_id: z.string().max(160).nullable().optional(),
  // Vinculo a uma medida caseira especifica (food_portions.id) — FASE 3, validado abaixo contra o food_ref_id real.
  household_measure_id: z.string().max(120).nullable().optional(),
  // Locks persistidos — quantity_locked: Optimizer V2 sobre plano salvo
  // nunca muda a quantidade deste item; substitutions_locked: geração
  // automática/global de substituições nunca sugere para este item.
  quantity_locked: z.boolean().optional(),
  substitutions_locked: z.boolean().optional(),
  // FASE 8.5 (item 2/19) — contrato do slot de origem: precisa sobreviver a
  // um ciclo de editar+salvar no MealPlanEditor, nunca só existir no
  // momento da criação por modelo. Sempre proveniência (nunca escrito
  // manualmente pela nutricionista, só carregado do que já veio do slot).
  slot_food_group: z.string().max(40).nullable().optional(),
  slot_food_subgroup: z.string().max(40).nullable().optional(),
  slot_nutritional_role: z.string().max(40).nullable().optional(),
  template_slot_id: z.string().max(120).nullable().optional(),
  slot_exchange_eligible: z.boolean().nullable().optional(),
}).strict();

const mealOptionSchema = z.object({
  label: z.string().min(1).max(200),
  description: z.string().max(1000).nullable().optional(),
  items: z.array(itemSchema).min(1).max(80),
}).strict();

const choiceGroupSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(1000).nullable().optional(),
  min_selections: z.number().int().min(0).max(80),
  max_selections: z.number().int().min(1).max(80),
  items: z.array(itemSchema).min(1).max(80),
}).strict().refine((group) => group.min_selections <= group.max_selections, {
  message: "O mínimo de escolhas não pode ser maior que o máximo.",
});

const mealSchema = z.object({
  name: z.string().min(1).max(200),
  meal_context: z.string().max(40).nullable().optional(),
  suggested_time: z.string().max(30).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
  source_recipe_id: z.string().max(80).nullable().optional(),
  meal_structure: z.enum(["SIMPLE", "OPTIONS", "COMBINATION"]).nullable().optional(),
  patient_instruction: z.string().max(1000).nullable().optional(),
  items: z.array(itemSchema).max(80),
  options: z.array(mealOptionSchema).max(20).optional(),
  choice_groups: z.array(choiceGroupSchema).max(20).optional(),
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
  // Substituições nutricionais equivalentes por item (evolução desta mesma
  // linha — ver MealPlanSubstitutionPayload em lib/repositories/meal-plans.ts).
  // Sem estes campos aqui, o editor perdia identidade/qualidade/aprovação de
  // toda substituição adicionada manualmente pelo painel por item ao salvar.
  base_food_source: z.enum(["TACO", "CUSTOM", "MANUFACTURER", "USDA"]).nullable().optional(),
  base_food_ref_id: z.string().max(120).nullable().optional(),
  option_food_source: z.enum(["TACO", "CUSTOM", "MANUFACTURER", "USDA"]).nullable().optional(),
  option_food_ref_id: z.string().max(120).nullable().optional(),
  option_household_measure_id: z.string().max(120).nullable().optional(),
  option_nutrition_snapshot: z.string().max(2000).nullable().optional(),
  equivalence_mode: z.enum(["energy", "nutritional"]).nullable().optional(),
  equivalence_score: z.number().nullable().optional(),
  equivalence_quality: z.enum(["EXCELLENT", "GOOD", "REVIEW", "UNSUITABLE"]).nullable().optional(),
  approved_by_professional: z.boolean().optional(),
  ai_suggested: z.boolean().optional(),
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
  // Optimistic concurrency (P1-A): versao esperada; 409 em save concorrente.
  expectedVersion: z.number().int().positive().optional(),
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
  const structuredItems = parsed.data.meals.flatMap((meal) => [meal.items, ...(meal.options ?? []).map((option) => option.items), ...(meal.choice_groups ?? []).map((group) => group.items)].flat());
  const measureIds = Array.from(new Set(structuredItems.map((item) => item.household_measure_id).filter((value): value is string => Boolean(value))));
  if (measureIds.length) {
    const portions = await Promise.all(measureIds.map((measureId) => getFoodPortionById(measureId)));
    const portionById = new Map(portions.filter((portion) => portion !== null).map((portion) => [portion.id, portion]));
    for (const item of structuredItems) {
        if (!item.household_measure_id) continue;
        const portion = portionById.get(item.household_measure_id);
        const matches = portion && portion.food_source === item.food_source && portion.food_ref_id === item.food_ref_id;
        if (!matches) {
          return NextResponse.json({ message: `Medida caseira inválida para o alimento "${item.food}".` }, { status: 400 });
        }
    }
  }

  const previousPlan = (await getClientMealPlans(id)).find((item) => item.id === planId) ?? null;
  if (parsed.data.status === "active") {
    if (!previousPlan || previousPlan.status !== "draft") {
      await writeAuditLog({
        action: "meal_plan_publication_blocked",
        adminId: admin.sub,
        entityType: "meal_plan",
        entityId: planId,
        ipHash: getRequestFingerprint(req).ipHash,
        metadata: { clientId: id, blockerCodes: ["INVALID_STATUS"], blockerCount: 1 },
      });
      return NextResponse.json({
        code: "MEAL_PLAN_PUBLICATION_BLOCKED",
        message: "Este plano ainda não pode ser publicado.",
        blockers: [{ code: "INVALID_STATUS", message: "Somente rascunhos podem ser publicados." }],
        warnings: [],
      }, { status: 422 });
    }

    const candidatePlan = {
      ...previousPlan,
      ...parsed.data,
      client_id: id,
      id: planId,
      status: "draft" as const,
      meals: parsed.data.meals,
      weekly_slots: parsed.data.weekly_slots ?? [],
      substitutions: parsed.data.substitutions,
      supplements: parsed.data.supplements,
    };
    const review = await validateMealPlanForPublication(candidatePlan);
    if (!review.valid) {
      await writeAuditLog({
        action: "meal_plan_publication_blocked",
        adminId: admin.sub,
        entityType: "meal_plan",
        entityId: planId,
        ipHash: getRequestFingerprint(req).ipHash,
        metadata: {
          clientId: id,
          blockerCodes: Array.from(new Set(review.blockers.map((item) => item.code))),
          blockerCount: review.blockers.length,
          warningCount: review.warnings.length,
        },
      });
      return NextResponse.json({
        code: "MEAL_PLAN_PUBLICATION_BLOCKED",
        message: "Este plano ainda não pode ser publicado.",
        blockers: review.blockers,
        warnings: review.warnings,
        summary: review.summary,
      }, { status: 422 });
    }
  }
  const previousRecipeIds = new Set(previousPlan?.meals.map((meal) => meal.source_recipe_id).filter(Boolean) ?? []);
  let plan: Awaited<ReturnType<typeof updateMealPlan>> = null;
  try {
    plan = await updateMealPlan(planId, id, parsed.data, {
      expectedVersion: parsed.data.expectedVersion,
      changedByAdminId: admin.sub,
      source: "manual",
    });
  } catch (error) {
    if (error instanceof MealPlanVersionConflictError) {
      return NextResponse.json({ message: error.message }, { status: 409 });
    }
    throw error;
  }
  if (!plan) return NextResponse.json({ message: "Plano não encontrado." }, { status: 404 });

  await addTimelineEvent({
    client_id: id,
    type: "meal_plan_updated",
    title: parsed.data.status === "active" ? "Plano alimentar ativado" : "Plano alimentar atualizado",
    description: `Plano ${parsed.data.title} salvo na versão ${plan.version}.`,
    metadata: { planId, status: parsed.data.status, version: plan.version },
  });
  await writeAuditLog({
    action: parsed.data.status === "active" ? "meal_plan_published" : "meal_plan_updated",
    adminId: admin.sub,
    entityType: "meal_plan",
    entityId: planId,
    ipHash: getRequestFingerprint(req).ipHash,
    metadata: { clientId: id, status: parsed.data.status, version: plan.version, previousActiveVersionId: previousPlan?.status === "active" ? `${previousPlan.id}:v${previousPlan.version}` : null },
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
