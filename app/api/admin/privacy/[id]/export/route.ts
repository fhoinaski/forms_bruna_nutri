import { NextRequest, NextResponse } from "next/server";
import { getAdminFromRequest } from "@/lib/auth/session";
import { exportPrivacyRequestData, getPrivacyRequest } from "@/lib/repositories/privacy";
import { writeAuditLog } from "@/lib/security/audit";
import { getRequestFingerprint } from "@/lib/security/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const admin = await getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ message: "Não autorizado." }, { status: 401 });
  const { id } = await context.params;
  const request = await getPrivacyRequest(id);
  if (!request) return NextResponse.json({ message: "Solicitação não encontrada." }, { status: 404 });
  if (request.verification_status !== "verificada") return NextResponse.json({ message: "Confirme a identidade antes de exportar." }, { status: 409 });
  const data = await exportPrivacyRequestData(request);
  await writeAuditLog({ action: "data_subject_exported", adminId: admin.sub, entityType: "privacy_request", entityId: id, ipHash: getRequestFingerprint(req).ipHash });
  return new NextResponse(JSON.stringify(data, null, 2), { headers: { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename="dados-titular-${id}.json"`, "Cache-Control": "private, no-store" } });
}
