import { NextResponse } from "next/server";
import { getSessionFromCookies } from "@/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSessionFromCookies();
  if (!session) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }
  return NextResponse.json({
    authenticated: true,
    sub: session.sub,
    email: session.email,
    name: session.name,
    mustChangePassword: session.mustChangePassword,
  });
}
