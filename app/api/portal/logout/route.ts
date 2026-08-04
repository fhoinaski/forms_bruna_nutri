import { NextResponse } from "next/server";
import { clearClientPortalCookie } from "@/lib/auth/client-portal-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const response = NextResponse.json({ success: true });
  clearClientPortalCookie(response);
  return response;
}
