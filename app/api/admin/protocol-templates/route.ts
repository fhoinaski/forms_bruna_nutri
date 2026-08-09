import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { PROTOCOL_TEMPLATE_TARGET_GROUPS, PROTOCOL_TEMPLATE_TYPES } from "@/db/schema";
import { getAdminFromRequest } from "@/lib/auth/session";
import { createTemplate, getAllTemplates } from "@/lib/repositories/protocol-templates";
import { getRequestFingerprint } from "@/lib/security/request";
import { writeAuditLog } from "@/lib/security/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const mealItemSchema = z.object({
  food: z.string().min(1).max(200),
  quantity: z.string().max(80).nullable().optional(),
  unit: z.string().max(40).nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
  source_recipe_id: z.string().nullable().optional(),
});

const mealSchema = z.object({
  name: z.string().min(1).max(120),
  suggested_time: z.string().max(40).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
  source_recipe_id: z.string().nullable().optional(),
  items: z.array(mealItemSchema).default([]),
});

const substitutionSchema = z.object({
  base_food: z.string().min(1).max(200),
  option_food: z.string().min(1).max(200),
  quantity: z.string().max(80).nullable().optional(),
  unit: z.string().max(40).nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
});

const supplementSchema = z.object({
  name: z.string().min(1).max(160),
  dosage: z.string().max(80).nullable().optional(),
  unit: z.string().max(40).nullable().optional(),
  instructions: z.string().max(500).nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
});

const templateSchema = z.object({
  type: z.enum(PROTOCOL_TEMPLATE_TYPES),
  target_group: z.enum(PROTOCOL_TEMPLATE_TARGET_GROUPS),
  title: z.string().min(1, "Titulo e obrigatorio.").max(200),
  content: z.string().max(100000).optional(),
  notes: z.string().max(10000).nullable().optional(),
  meals: z.array(mealSchema).optional(),
  substitutions: z.array(substitutionSchema).optional(),
  supplements: z.array(supplementSchema).optional(),
  is_active: z.boolean().optional(),
}).strict();

export async function GET(req: NextRequest) {
  const admin = await getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ message: "Nao autorizado." }, { status: 401 });

  const url = new URL(req.url);
  const includeInactive = url.searchParams.get("includeInactive") === "true";
  const type = url.searchParams.get("type") ?? undefined;
  const targetGroup = url.searchParams.get("targetGroup") ?? undefined;

  const templates = await getAllTemplates({
    includeInactive,
    type: PROTOCOL_TEMPLATE_TYPES.find((item) => item === type),
    targetGroup: PROTOCOL_TEMPLATE_TARGET_GROUPS.find((item) => item === targetGroup),
  });

  return NextResponse.json({ items: templates });
}

export async function POST(req: NextRequest) {
  const admin = await getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ message: "Nao autorizado." }, { status: 401 });

  const parsed = templateSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Dados invalidos." }, { status: 400 });
  }

  const id = await createTemplate({ ...parsed.data, content: parsed.data.content ?? "" });
  await writeAuditLog({
    action: "protocol_template_created",
    adminId: admin.sub,
    entityType: "protocol_template",
    entityId: id,
    ipHash: getRequestFingerprint(req).ipHash,
    metadata: { type: parsed.data.type, targetGroup: parsed.data.target_group },
  });

  return NextResponse.json({ id }, { status: 201 });
}
