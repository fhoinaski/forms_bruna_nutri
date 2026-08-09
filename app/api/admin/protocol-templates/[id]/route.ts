import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { PROTOCOL_TEMPLATE_TARGET_GROUPS, PROTOCOL_TEMPLATE_TYPES } from "@/db/schema";
import { getAdminFromRequest } from "@/lib/auth/session";
import { deleteTemplate, getTemplateById, getTemplateDetail, updateTemplate } from "@/lib/repositories/protocol-templates";
import { getRequestFingerprint } from "@/lib/security/request";
import { writeAuditLog } from "@/lib/security/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const mealItemSchema = z.object({
  food: z.string().min(1).max(200),
  quantity: z.string().max(80).nullable().optional(),
  unit: z.string().max(40).nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
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

const updateSchema = z.object({
  type: z.enum(PROTOCOL_TEMPLATE_TYPES).optional(),
  target_group: z.enum(PROTOCOL_TEMPLATE_TARGET_GROUPS).optional(),
  title: z.string().min(1).max(200).optional(),
  content: z.string().max(100000).optional(),
  notes: z.string().max(10000).nullable().optional(),
  meals: z.array(mealSchema).optional(),
  substitutions: z.array(substitutionSchema).optional(),
  supplements: z.array(supplementSchema).optional(),
  is_active: z.boolean().optional(),
}).strict();

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ message: "Nao autorizado." }, { status: 401 });

  const { id } = await params;
  const template = await getTemplateById(id);
  if (!template) return NextResponse.json({ message: "Modelo nao encontrado." }, { status: 404 });

  const detail = await getTemplateDetail(id);
  return NextResponse.json({ ...template, ...detail });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ message: "Nao autorizado." }, { status: 401 });

  const { id } = await params;
  const current = await getTemplateById(id);
  if (!current) return NextResponse.json({ message: "Modelo nao encontrado." }, { status: 404 });

  const parsed = updateSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Dados invalidos." }, { status: 400 });
  }

  await updateTemplate(id, parsed.data);
  await writeAuditLog({
    action: "protocol_template_updated",
    adminId: admin.sub,
    entityType: "protocol_template",
    entityId: id,
    ipHash: getRequestFingerprint(req).ipHash,
    metadata: { changedFields: Object.keys(parsed.data) },
  });

  return NextResponse.json({ success: true });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ message: "Nao autorizado." }, { status: 401 });

  const { id } = await params;
  const current = await getTemplateById(id);
  if (!current) return NextResponse.json({ message: "Modelo nao encontrado." }, { status: 404 });

  await deleteTemplate(id);
  await writeAuditLog({
    action: "protocol_template_deleted",
    adminId: admin.sub,
    entityType: "protocol_template",
    entityId: id,
    ipHash: getRequestFingerprint(req).ipHash,
    metadata: { title: current.title, type: current.type, targetGroup: current.target_group },
  });

  return NextResponse.json({ success: true });
}
