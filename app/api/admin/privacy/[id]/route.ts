import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminFromRequest } from "@/lib/auth/session";
import { getPrivacyRequest, updatePrivacyRequest } from "@/lib/repositories/privacy";
import { writeAuditLog } from "@/lib/security/audit";
import { getRequestFingerprint } from "@/lib/security/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  status: z.enum(["recebida", "em_analise", "aguardando_titular", "concluida", "recusada"]).optional(),
  verificationStatus: z.enum(["pendente", "verificada", "nao_verificada"]).optional(),
  adminNotes: z.string().max(3000).nullable().optional(),
});

export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const admin = await getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ message: "Não autorizado." }, { status: 401 });
  const { id } = await context.params;
  const request = await getPrivacyRequest(id);
  if (!request) return NextResponse.json({ message: "Solicitação não encontrada." }, { status: 404 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: "Dados inválidos." }, { status: 400 });
  await updatePrivacyRequest(id, parsed.data);
  await writeAuditLog({ action: "privacy_request_updated", adminId: admin.sub, entityType: "privacy_request", entityId: id, ipHash: getRequestFingerprint(req).ipHash, metadata: { changedFields: Object.keys(parsed.data) } });
  return NextResponse.json({ success: true });
}
