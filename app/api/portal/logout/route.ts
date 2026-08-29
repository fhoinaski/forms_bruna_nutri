import { NextRequest, NextResponse } from "next/server";
import { clearClientPortalCookie, getClientPortalSessionFromRequest } from "@/lib/auth/client-portal-session";
import { getPatientPortalAccess, revokePatientPortalSessions } from "@/lib/repositories/patient-portal-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const session = await getClientPortalSessionFromRequest(req);
  if (session?.sid) {
    const access = await getPatientPortalAccess(session.sub);
    if (access) await revokePatientPortalSessions(access.id, session.sid);
  }
  const response = NextResponse.json({ success: true });
  clearClientPortalCookie(response);
  return response;
}
