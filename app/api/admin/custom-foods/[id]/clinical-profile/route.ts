import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminFromRequest } from "@/lib/auth/session";
import {
  FOOD_CLINICAL_TRAIT_PROVENANCES,
  FOOD_CLINICAL_TRAIT_RELATIONS,
} from "@/lib/clinical/food-clinical-traits";
import { getFoodClinicalProfile } from "@/lib/clinical/food-clinical-profile";
import { getCustomFoodById } from "@/lib/repositories/custom-foods";
import { replaceFoodClinicalTraits } from "@/lib/repositories/food-clinical-traits";
import { writeAuditLog } from "@/lib/security/audit";
import { getRequestFingerprint } from "@/lib/security/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const traitSchema = z.object({
  code: z.string().min(1).max(60),
  relation: z.enum(FOOD_CLINICAL_TRAIT_RELATIONS),
  provenance: z.enum(FOOD_CLINICAL_TRAIT_PROVENANCES).default("PROFESSIONAL"),
  evidenceText: z.string().max(1000).nullable().optional(),
}).strict();

const profileSchema = z.object({
  traits: z.array(traitSchema).max(30),
}).strict();

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ message: "Nao autorizado." }, { status: 401 });

  const { id } = await params;
  const food = await getCustomFoodById(id);
  if (!food) return NextResponse.json({ message: "Alimento nao encontrado." }, { status: 404 });

  const profile = await getFoodClinicalProfile({ foodSource: food.source, foodId: id });
  return NextResponse.json({ food, profile });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ message: "Nao autorizado." }, { status: 401 });

  const { id } = await params;
  const food = await getCustomFoodById(id);
  if (!food) return NextResponse.json({ message: "Alimento nao encontrado." }, { status: 404 });

  const parsed = profileSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Dados invalidos." }, { status: 400 });
  }

  try {
    const traits = await replaceFoodClinicalTraits({
      foodSource: food.source,
      foodRefId: id,
      traits: parsed.data.traits,
      adminId: admin.sub,
    });
    await writeAuditLog({
      action: "food_clinical_profile_updated",
      adminId: admin.sub,
      entityType: "custom_food",
      entityId: id,
      ipHash: getRequestFingerprint(req).ipHash,
      metadata: { source: food.source, traitCount: traits.length },
    });
    const profile = await getFoodClinicalProfile({ foodSource: food.source, foodId: id });
    return NextResponse.json({ food, profile });
  } catch (cause) {
    return NextResponse.json({ message: cause instanceof Error ? cause.message : "Dados invalidos." }, { status: 400 });
  }
}
