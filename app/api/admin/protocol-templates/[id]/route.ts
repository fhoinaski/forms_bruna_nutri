import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { PROTOCOL_TEMPLATE_TARGET_GROUPS, PROTOCOL_TEMPLATE_TYPES } from "@/db/schema";
import { getAdminFromRequest } from "@/lib/auth/session";
import { deleteTemplate, getTemplateById, updateTemplate } from "@/lib/repositories/protocol-templates";
import { getRequestFingerprint } from "@/lib/security/request";
import { writeAuditLog } from "@/lib/security/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const updateSchema = z.object({
  type: z.enum(PROTOCOL_TEMPLATE_TYPES).optional(),
  target_group: z.enum(PROTOCOL_TEMPLATE_TARGET_GROUPS).optional(),
  title: z.string().min(1).max(200).optional(),
  content: z.string().min(2).max(100000).refine((value) => {
    try {
      JSON.parse(value);
      return true;
    } catch {
      return false;
    }
  }, "Content precisa ser um JSON válido.").optional(),
  is_active: z.boolean().optional(),
}).strict();

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ message: "Não autorizado." }, { status: 401 });

  const { id } = await params;
  const current = await getTemplateById(id);
  if (!current) return NextResponse.json({ message: "Modelo não encontrado." }, { status: 404 });

  const parsed = updateSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Dados inválidos." }, { status: 400 });
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
  if (!admin) return NextResponse.json({ message: "Não autorizado." }, { status: 401 });

  const { id } = await params;
  const current = await getTemplateById(id);
  if (!current) return NextResponse.json({ message: "Modelo não encontrado." }, { status: 404 });

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
