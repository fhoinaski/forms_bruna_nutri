import { NextRequest, NextResponse } from "next/server";
import { getAdminFromRequest } from "@/lib/auth/session";
import { anonymizePrivacyRequestData, getPrivacyRequest, updatePrivacyRequest } from "@/lib/repositories/privacy";
import { writeAuditLog } from "@/lib/security/audit";
import { getRequestFingerprint } from "@/lib/security/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const admin = await getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ message: "Não autorizado." }, { status: 401 });
  const { id } = await context.params;
  const request = await getPrivacyRequest(id);
  if (!request) return NextResponse.json({ message: "Solicitação não encontrada." }, { status: 404 });
  if (request.request_type !== "exclusao" && request.request_type !== "revogacao") return NextResponse.json({ message: "Esta ação não corresponde ao pedido recebido." }, { status: 400 });
  if (request.verification_status !== "verificada") return NextResponse.json({ message: "Confirme a identidade antes de anonimizar." }, { status: 409 });
  const result = await anonymizePrivacyRequestData(request);
  await updatePrivacyRequest(id, { status: "concluida", adminNotes: `${request.admin_notes ?? ""}\nAnonimização executada: ${result.clients} cliente(s), ${result.submissions} pré-consulta(s).`.trim() });
  await writeAuditLog({ action: "data_anonymized", adminId: admin.sub, entityType: "privacy_request", entityId: id, ipHash: getRequestFingerprint(req).ipHash, metadata: result });
  return NextResponse.json({ success: true, ...result });
}
