import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { PROTOCOL_TEMPLATE_TARGET_GROUPS, PROTOCOL_TEMPLATE_TYPES } from "@/db/schema";
import { getAdminFromRequest } from "@/lib/auth/session";
import { createTemplate, getAllTemplates } from "@/lib/repositories/protocol-templates";
import { getRequestFingerprint } from "@/lib/security/request";
import { writeAuditLog } from "@/lib/security/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const templateSchema = z.object({
  type: z.enum(PROTOCOL_TEMPLATE_TYPES),
  target_group: z.enum(PROTOCOL_TEMPLATE_TARGET_GROUPS),
  title: z.string().min(1, "Título é obrigatório.").max(200),
  content: z.string().min(2, "JSON do conteúdo é obrigatório.").max(100000).refine((value) => {
    try {
      JSON.parse(value);
      return true;
    } catch {
      return false;
    }
  }, "Content precisa ser um JSON válido."),
  is_active: z.boolean().optional(),
}).strict();

export async function GET(req: NextRequest) {
  const admin = await getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ message: "Não autorizado." }, { status: 401 });

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
  if (!admin) return NextResponse.json({ message: "Não autorizado." }, { status: 401 });

  const parsed = templateSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Dados inválidos." }, { status: 400 });
  }

  const id = await createTemplate(parsed.data);
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
