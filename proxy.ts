import { NextResponse } from "next/server";
import type { NextFetchEvent, NextRequest } from "next/server";
import { verifySessionToken } from "@/lib/auth/session";
import { writeAuditLog } from "@/lib/security/audit";

const COOKIE_NAME = "bruna_nutri_admin_session";
const SECURITY_PATH = "/dashboard/settings/security";

export async function proxy(request: NextRequest, event: NextFetchEvent) {
  const { pathname } = request.nextUrl;
  const isDashboard = pathname.startsWith("/dashboard");
  const isAdminApi = pathname.startsWith("/api/admin");
  const isAuthApi = pathname.startsWith("/api/auth");
  const isLoginPage = pathname === "/login";
  if (!isDashboard && !isAdminApi && !isAuthApi && !isLoginPage) return NextResponse.next();

  if (["POST", "PATCH", "PUT", "DELETE"].includes(request.method)) {
    const origin = request.headers.get("origin");
    if (origin) {
      try {
        if (new URL(origin).host !== request.nextUrl.host) return NextResponse.json({ message: "Origem não permitida." }, { status: 403 });
      } catch {
        return NextResponse.json({ message: "Origem não permitida." }, { status: 403 });
      }
    }
  }

  const token = request.cookies.get(COOKIE_NAME)?.value;
  const session = token ? await verifySessionToken(token) : null;
  if (!session) {
    if (isDashboard) return NextResponse.redirect(new URL("/login", request.url));
    if (isAdminApi) return NextResponse.json({ message: "Não autorizado." }, { status: 401 });
    return NextResponse.next();
  }
  if (isLoginPage) return NextResponse.redirect(new URL(session.mustChangePassword ? SECURITY_PATH : "/dashboard", request.url));
  if (session.mustChangePassword && isDashboard && pathname !== SECURITY_PATH) return NextResponse.redirect(new URL(SECURITY_PATH, request.url));

  if (isAdminApi && ["POST", "PATCH", "PUT", "DELETE"].includes(request.method)) {
    event.waitUntil(writeAuditLog({ action: "admin_mutation_requested", adminId: session.sub, entityType: "api_route", entityId: pathname, metadata: { method: request.method } }));
  }
  return NextResponse.next();
}

export const config = { matcher: ["/login", "/dashboard/:path*", "/api/admin/:path*", "/api/auth/:path*"] };
