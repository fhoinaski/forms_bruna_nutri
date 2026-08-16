import { NextResponse } from "next/server";
import type { NextFetchEvent, NextRequest } from "next/server";
import { createInternalSessionAssertion, INTERNAL_SESSION_HEADER, verifySessionToken } from "@/lib/auth/session";
import { writeAuditLog } from "@/lib/security/audit";
import { verifyCronSecret } from "@/lib/security/cron";

const COOKIE_NAME = "bruna_nutri_admin_session";
const SECURITY_PATH = "/dashboard/settings/security";
const MUTATION_METHODS = ["POST", "PATCH", "PUT", "DELETE"];

function hasAllowedOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === request.nextUrl.host;
  } catch {
    return false;
  }
}

function noStore(response: NextResponse, enabled: boolean) {
  if (enabled) response.headers.set("Cache-Control", "private, no-store, max-age=0");
  return response;
}

export async function proxy(request: NextRequest, event: NextFetchEvent) {
  const { pathname } = request.nextUrl;
  const isDashboard = pathname.startsWith("/dashboard");
  const isAdminApi = pathname.startsWith("/api/admin");
  const isAuthApi = pathname.startsWith("/api/auth");
  const isPortalApi = pathname.startsWith("/api/portal");
  const isPublicApi = pathname.startsWith("/api/public");
  const isLoginPage = pathname === "/login";
  const isMutation = MUTATION_METHODS.includes(request.method);

  if (!isDashboard && !isAdminApi && !isAuthApi && !isPortalApi && !isPublicApi && !isLoginPage) {
    return NextResponse.next();
  }

  if (isMutation && !hasAllowedOrigin(request)) {
    return NextResponse.json({ message: "Origem nao permitida." }, { status: 403 });
  }

  if (isPortalApi || isPublicApi) {
    return noStore(NextResponse.next(), true);
  }

  const isCronRoute =
    pathname === "/api/admin/appointment-workflows/process-due" ||
    pathname === "/api/admin/appointment-briefs/prepare-upcoming" ||
    pathname === "/api/admin/payments/notify-overdue";
  if (isAdminApi && isCronRoute && verifyCronSecret(request)) {
    return noStore(NextResponse.next(), true);
  }

  const token = request.cookies.get(COOKIE_NAME)?.value;
  const session = token ? await verifySessionToken(token) : null;
  if (!session) {
    if (isDashboard) return NextResponse.redirect(new URL("/login", request.url));
    if (isAdminApi) return NextResponse.json({ message: "Nao autorizado." }, { status: 401 });
    return NextResponse.next();
  }

  if (isLoginPage) {
    return NextResponse.redirect(new URL(session.mustChangePassword ? SECURITY_PATH : "/dashboard", request.url));
  }
  if (session.mustChangePassword && isDashboard && pathname !== SECURITY_PATH) {
    return NextResponse.redirect(new URL(SECURITY_PATH, request.url));
  }

  if (isAdminApi && isMutation) {
    event.waitUntil(
      writeAuditLog({
        action: "admin_mutation_requested",
        adminId: session.sub,
        entityType: "api_route",
        entityId: pathname,
        metadata: { method: request.method },
      })
    );
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.delete(INTERNAL_SESSION_HEADER);
  requestHeaders.set(INTERNAL_SESSION_HEADER, await createInternalSessionAssertion(session));
  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: [
    "/login",
    "/dashboard/:path*",
    "/api/admin/:path*",
    "/api/auth/:path*",
    "/api/portal/:path*",
    "/api/public/:path*",
  ],
};
