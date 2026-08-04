import { NextRequest, NextResponse } from "next/server";
import { clearAuthCookie, getAdminFromRequest } from "@/lib/auth/session";
import { getRequestFingerprint } from "@/lib/security/request";
import { writeAuditLog } from "@/lib/security/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const admin = await getAdminFromRequest(req);
  if (admin) await writeAuditLog({ action: "logout", adminId: admin.sub, ipHash: getRequestFingerprint(req).ipHash });
  const response = NextResponse.json({ success: true });
  clearAuthCookie(response);
  return response;
}
