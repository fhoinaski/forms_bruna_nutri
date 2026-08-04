import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminFromRequest } from "@/lib/auth/session";
import { getPrivacySettings, getRetentionPreview, listPrivacyRequests, updatePrivacySettings } from "@/lib/repositories/privacy";
import { listAuditLogs, writeAuditLog } from "@/lib/security/audit";
import { getRequestFingerprint } from "@/lib/security/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const admin = await getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ message: "Não autorizado." }, { status: 401 });
  const settings = await getPrivacySettings();
  const [requests, auditLogs, retentionPreview] = await Promise.all([
    listPrivacyRequests(), listAuditLogs(120), getRetentionPreview(settings?.retention_months ?? 60),
  ]);
  return NextResponse.json({ requests, auditLogs, settings, retentionPreview });
}

export async function PATCH(req: NextRequest) {
  const admin = await getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ message: "Não autorizado." }, { status: 401 });
  const parsed = z.object({ retentionMonths: z.number().int().min(12).max(240) }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: "Período inválido." }, { status: 400 });
  await updatePrivacySettings(parsed.data.retentionMonths, admin.sub);
  await writeAuditLog({ action: "retention_policy_updated", adminId: admin.sub, entityType: "privacy_settings", entityId: "default", ipHash: getRequestFingerprint(req).ipHash, metadata: { retentionMonths: parsed.data.retentionMonths } });
  return NextResponse.json({ success: true });
}
